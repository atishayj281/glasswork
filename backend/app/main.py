# Load .env FIRST — before any other import that may read os.getenv() at module level.
# This is defense-in-depth alongside the lazy Firestore init in session.py.
from dotenv import load_dotenv
load_dotenv()

import base64
import json
import logging
import os

import firebase_admin
from firebase_admin import credentials
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, pipeline, upload
from app.config import CORS_ORIGIN, FIREBASE_STORAGE_BUCKET
from app.logging_config import setup_logging
from app.middleware.auth import get_current_user
from app.services.session import session_store

setup_logging()


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

    cred = credentials.Certificate(sa_dict)
    firebase_admin.initialize_app(cred, {"storageBucket": FIREBASE_STORAGE_BUCKET})


_init_firebase()

app = FastAPI(title="Aegis Agentic Data Platform", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[CORS_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(pipeline.router, prefix="/api", tags=["pipeline"])


@app.post("/api/sessions/{session_id}/claim", tags=["session"])
async def claim_session(session_id: str, uid: str = Depends(get_current_user)):
    """Associate an anonymous session with the authenticated user (migration on login)."""
    state = session_store.claim(session_id, uid)
    if not state:
        raise HTTPException(404, "Session not found or expired")
    return {"status": "ok", "session_id": session_id, "uid": uid}


@app.get("/health")
async def health():
    return {"status": "ok"}
