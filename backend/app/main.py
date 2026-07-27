# Load .env FIRST — before any other import that may read os.getenv() at module level.
# This is defense-in-depth alongside the lazy Firestore init in session.py.
from dotenv import load_dotenv
load_dotenv()

import asyncio
import base64
import json
import logging
import os

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

import firebase_admin
from firebase_admin import credentials
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.api import billing, chat, pipeline, saved_pipelines, upload, webhooks
from app.config import CORS_ORIGIN, FIREBASE_STORAGE_BUCKET
from app.logging_config import setup_logging
from app.middleware.auth import get_current_user
from app.services.session import session_store

setup_logging()

_gc_logger = logging.getLogger("app.gc")

async def _session_gc_loop() -> None:
    """Background coroutine that purges expired sessions every 30 minutes.

    Sessions use tier-aware retention (Explorer 1d, Analyst 7d, Studio 30d).
    This loop ensures expired sessions are cleaned up in near-real-time without
    relying solely on the on-demand expiry check inside session_store.get().
    """
    while True:
        try:
            await asyncio.sleep(30 * 60)  # 30 minutes
            session_store._purge_expired()
            _gc_logger.info("[gc] session purge complete")
        except asyncio.CancelledError:
            break
        except Exception as exc:
            _gc_logger.error("[gc] session purge failed: %s", exc)


@asynccontextmanager
async def _lifespan(app: FastAPI):
    gc_task = asyncio.create_task(_session_gc_loop())
    _gc_logger.info("[gc] session expiry GC loop started (interval=30min)")
    yield
    gc_task.cancel()
    try:
        await gc_task
    except asyncio.CancelledError:
        pass


def _init_sentry(dsn: str) -> bool:
    """Initialize Sentry if a DSN is provided. Returns True if initialized,
    False otherwise. Pulled out as a standalone function so tests can call it
    directly with a mocked sentry_sdk.init — no need to reimport the whole
    app module to exercise this branch, which avoids creating duplicate
    module-level singletons (like the logging contextvar) elsewhere.
    """
    if dsn:
        sentry_sdk.init(
            dsn=dsn,
            integrations=[FastApiIntegration()],
            traces_sample_rate=1.0,
            send_default_pii=True,
        )
        return True
    logging.getLogger(__name__).warning(
        "Sentry DSN not set — Sentry exception tracking disabled"
    )
    return False


_init_sentry(os.getenv("SENTRY_DSN", ""))


def _init_firebase() -> None:
    """Initialize firebase-admin from FIREBASE_SERVICE_ACCOUNT_JSON env var.

    Accepts the value as:
    - A raw JSON string  (e.g. paste of the service account JSON)
    - A base64-encoded JSON string
    - A file path to the service account JSON file
    """
    raw = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "")
    if not raw:
        logging.getLogger(__name__).warning(
            "FIREBASE_SERVICE_ACCOUNT_JSON not set — Firebase features disabled"
        )
        return

    sa_dict: dict | None = None

    # 1. Try parsing as a raw JSON string
    try:
        sa_dict = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        pass

    # 2. Try decoding as base64 then parsing as JSON
    if sa_dict is None:
        try:
            sa_dict = json.loads(base64.b64decode(raw).decode())
        except Exception:
            pass

    # 3. Try treating it as a file path
    if sa_dict is None:
        try:
            with open(raw) as f:
                sa_dict = json.load(f)
        except Exception:
            pass

    if sa_dict is None:
        logging.getLogger(__name__).error(
            "FIREBASE_SERVICE_ACCOUNT_JSON could not be parsed — Firebase features disabled"
        )
        return

    try:
        firebase_admin.get_app()
    except ValueError:
        cred = credentials.Certificate(sa_dict)
        firebase_admin.initialize_app(cred, {"storageBucket": FIREBASE_STORAGE_BUCKET})


_init_firebase()

app = FastAPI(title="Aegis Agentic Data Platform", version="0.1.0", lifespan=_lifespan)


def _compute_cors_origins(cors_origin: str, environment: str | None) -> list[str]:
    """Compute the allowed CORS origins list. Pulled out as a standalone,
    pure function (no env reads inside it) so tests can exercise both the
    production-safe default and the development case directly, without
    reimporting app.main and its transitive modules (which previously
    caused a duplicate `session_context` ContextVar and broke correlation-id
    logging tests when run after this one in the same process).
    """
    origins = [cors_origin]
    if environment == "development":
        origins.extend(["http://localhost:5173", "http://127.0.0.1:5173"])
    return origins


origins = _compute_cors_origins(CORS_ORIGIN, os.getenv("ENVIRONMENT"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.middleware.correlation import CorrelationIdMiddleware
app.add_middleware(CorrelationIdMiddleware)

app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(pipeline.router, prefix="/api", tags=["pipeline"])
app.include_router(saved_pipelines.router, prefix="/api", tags=["saved_pipelines"])
app.include_router(webhooks.router, prefix="/api", tags=["webhooks"])
app.include_router(billing.router, prefix="/api", tags=["billing"])



@app.post("/api/sessions/{session_id}/claim", tags=["session"])
async def claim_session(session_id: str, uid: str = Depends(get_current_user)):
    """Associate an anonymous session with the authenticated user (migration on login).

    Intentionally does NOT use require_session_access for the ownership check:
    claim() is the promotion path, so it must be accessible regardless of whether
    the session is anonymous (uid=None) or already owned.  get_current_user above
    already guarantees the caller holds a valid Firebase token.
    """
    try:
        state = session_store.claim(session_id, uid)
        if not state:
            raise HTTPException(404, "Session not found or expired")
    except ValueError as e:
        raise HTTPException(409, str(e))
    return {"status": "ok", "session_id": session_id, "uid": uid}


from pydantic import BaseModel as _BaseModel
from datetime import datetime as _dt


class SessionSummaryResponse(_BaseModel):
    session_id: str
    file_name: str
    pipeline_name: str | None
    created_at: str  # ISO-8601
    chat_message_count: int
    has_result: bool


@app.get("/api/sessions", tags=["session"], response_model=list[SessionSummaryResponse])
async def list_my_sessions(uid: str = Depends(get_current_user)):
    """Return a recency-sorted list of the caller's active (non-expired) sessions."""
    states = session_store.list_for_user(uid, limit=50)
    return [
        SessionSummaryResponse(
            session_id=s.session_id,
            file_name=s.file_name,
            pipeline_name=s.pipeline.name if s.pipeline else None,
            created_at=s.created_at.isoformat() + "Z",
            chat_message_count=len(s.chat_history),
            has_result=s.execution_result is not None,
        )
        for s in states
    ]


from app.middleware.auth import get_current_user_optional as _get_user_opt
from app.middleware.auth import require_session_access as _req_access
from app.models.schema import DatasetProfile as _DatasetProfile


@app.get("/api/session/{session_id}/profile", tags=["session"], response_model=_DatasetProfile)
async def get_session_profile(
    session_id: str,
    uid: str | None = Depends(_get_user_opt),
):
    """Return the DatasetProfile (schema) of a session without re-uploading the file."""
    state = _req_access(session_id, uid)
    if not state.profile:
        raise HTTPException(404, "Session has no profile — file may not have been ingested yet")
    return state.profile


@app.get("/api/me/budget", tags=["budget"])
async def get_my_budget(uid: str = Depends(get_current_user)):
    """Return the authenticated user's daily LLM call/token usage and limits."""
    from app.services.budget import get_usage
    from app.config import BUDGET_MAX_CALLS_PER_DAY, BUDGET_MAX_TOKENS_PER_DAY
    usage = get_usage(uid)
    return {
        "uid": uid,
        "calls_today": usage["calls"],
        "tokens_today": usage["tokens"],
        "calls_limit": BUDGET_MAX_CALLS_PER_DAY,
        "tokens_limit": BUDGET_MAX_TOKENS_PER_DAY,
        "redis_available": usage.get("redis_available", False),
    }


_last_health_check_result = None
_last_health_check_time = 0.0
_HEALTH_CACHE_TTL = 10.0  # seconds

@app.get("/health", tags=["health"])
async def health():
    import time
    global _last_health_check_result, _last_health_check_time
    now = time.time()

    if _last_health_check_result and (now - _last_health_check_time < _HEALTH_CACHE_TTL):
        is_unhealthy = _last_health_check_result.get("status") == "degraded"
        if is_unhealthy:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=503, content=_last_health_check_result)
        return _last_health_check_result

    firestore_status = "ok"
    firestore_db = session_store._get_firestore()
    if firestore_db:
        try:
            # Lightweight ping: check dummy document metadata without reading data
            firestore_db.collection("_health_").document("ping").get()
        except Exception as e:
            firestore_status = f"unhealthy: {e}"
    else:
        firestore_status = "disabled"

    supabase_status = "ok"
    try:
        from app.config import SUPABASE_URL, SUPABASE_KEY
        if SUPABASE_URL and SUPABASE_KEY:
            from app.api.upload import get_supabase_client
            supabase = get_supabase_client()
            supabase.storage.list_buckets()
        else:
            supabase_status = "disabled"
    except Exception as e:
        supabase_status = f"unhealthy: {e}"

    redis_status = "disabled"
    try:
        from app.services.redis_client import get_redis_client
        redis = get_redis_client()
        if redis:
            redis_status = "ok" if redis.is_available() else "unhealthy: ping failed"
    except Exception as e:
        redis_status = f"unhealthy: {e}"

    from app.services.circuit_breaker import litellm_circuit_breaker, supabase_circuit_breaker, firebase_circuit_breaker
    cb_statuses = {
        "litellm": litellm_circuit_breaker.get_status(),
        "supabase": supabase_circuit_breaker.get_status(),
        "firebase": firebase_circuit_breaker.get_status(),
    }

    is_unhealthy = (
        "unhealthy" in firestore_status
        or "unhealthy" in supabase_status
        or "unhealthy" in redis_status
        or any(cb["state"] == "OPEN" for cb in cb_statuses.values())
    )
    status_str = "degraded" if is_unhealthy else "ok"

    response_data = {
        "status": status_str,
        "details": {
            "firestore": firestore_status,
            "supabase": supabase_status,
            "redis": redis_status,
            "circuit_breakers": cb_statuses,
        }
    }

    _last_health_check_result = response_data
    _last_health_check_time = now

    if is_unhealthy:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=503, content=response_data)

    return response_data