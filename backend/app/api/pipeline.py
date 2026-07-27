import logging

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel

from app.config import BUDGET_MAX_CALLS_PER_DAY, BUDGET_MAX_TOKENS_PER_DAY
from app.middleware.auth import get_current_user_optional, require_session_access
from app.middleware.rate_limit import limiter
from app.models.pipeline import ExecutionResult, PipelinePlan
from app.services.agent import generate_pipeline
from app.services.budget import check_budget, record_llm_call
from app.services.executor import execute_pipeline
from app.services.session import session_store

router = APIRouter()
logger = logging.getLogger(__name__)


class GenerateRequest(BaseModel):
    intent: str | None = None


@router.get("/pipeline/{session_id}")
async def get_pipeline(
    session_id: str,
    uid: str | None = Depends(get_current_user_optional),
) -> PipelinePlan | None:
    logger.info("[GET /pipeline] session=%s", session_id)
    session = require_session_access(session_id, uid)
    has_pipeline = session.pipeline is not None
    step_count = len(session.pipeline.steps) if has_pipeline else 0
    logger.info("[GET /pipeline] session=%s has_pipeline=%s steps=%d", session_id, has_pipeline, step_count)
    return session.pipeline


@router.patch("/pipeline/{session_id}")
async def update_pipeline(
    session_id: str,
    plan: PipelinePlan,
    uid: str | None = Depends(get_current_user_optional),
) -> PipelinePlan:
    logger.info("[PATCH /pipeline] session=%s steps=%d edges=%d", session_id, len(plan.steps), len(plan.edges))
    session = require_session_access(session_id, uid)
    session.pipeline = plan
    session_store.save(session)
    logger.info("[PATCH /pipeline] session=%s saved OK — pipeline=%r", session_id, plan.name)
    return plan


from app.middleware.gating import require_tier_limit
from app.services.user_store import user_store


@router.post("/pipeline/{session_id}/generate")
async def generate(
    session_id: str,
    body: GenerateRequest | None = None,
    uid: str | None = Depends(get_current_user_optional),
    tier_cfg = Depends(require_tier_limit("pipeline_generations")),
) -> PipelinePlan:
    logger.info("[POST /generate] session=%s intent=%r", session_id, body.intent if body else None)
    session = require_session_access(session_id, uid)

    # Protect LLM endpoints with per-second rate limiting
    rate_limit_key = uid if uid else f"session_{session_id}"
    limiter.check(rate_limit_key)

    # Enforce per-uid daily LLM budget (only for authenticated users)
    if uid:
        try:
            check_budget(uid)
        except ValueError as e:
            raise HTTPException(status_code=429, detail=str(e))

    intent = body.intent if body else None
    try:
        plan = await generate_pipeline(session, intent)
        logger.info("[POST /generate] session=%s generated pipeline=%r steps=%d", session_id, plan.name, len(plan.steps))
        # Record usage
        user_store.record_usage(uid or "anonymous", "pipeline_generations")
        if uid:
            token_estimate = len(plan.model_dump_json()) // 4
            record_llm_call(uid, tokens_used=token_estimate)
        return plan
    except Exception as e:
        logger.error("[POST /generate] session=%s FAILED error=%s", session_id, e)
        raise HTTPException(500, f"Pipeline generation failed: {e}") from e


def run_pipeline_bg(session_id: str):
    # Background task — called server-side after the caller's access has already
    # been authorised by the /execute endpoint.  No uid check needed here.
    logger.info("[BG] pipeline execution started | session=%s", session_id)
    session = session_store.get(session_id)
    if not session or not session.pipeline:
        logger.warning("[BG] session=%s has no session or pipeline — aborting", session_id)
        return
    step_ids = [s.id for s in session.pipeline.steps]
    logger.info("[BG] session=%s pipeline=%r steps=%s", session_id, session.pipeline.name, step_ids)
    try:
        logger.info("[BG] session=%s loading dataframe", session_id)
        df = session_store.load_dataframe(session_id)
        if df is None:
            raise ValueError("Dataset not found")
        logger.info("[BG] session=%s dataframe loaded rows=%d cols=%d", session_id, len(df), len(df.columns))

        logger.info("[BG] session=%s executing pipeline", session_id)
        result = execute_pipeline(df, session.pipeline)
        logger.info(
            "[BG] session=%s pipeline COMPLETED rows=%d viz_specs=%d",
            session_id, result.row_count, len(result.viz_specs),
        )
        session.execution_status = "completed"
        session.execution_logs.append(result.execution_log)
        session.execution_result = result.model_dump()
        session_store.save(session)
        logger.info("[BG] session=%s result saved to store", session_id)
    except Exception as e:
        logger.error("[BG] session=%s pipeline FAILED error=%s", session_id, e, exc_info=True)
        session.execution_status = "failed"
        session.execution_error = str(e)
        session_store.save(session)


from app.services.queue import enqueue_task


@router.post("/pipeline/{session_id}/execute")
async def execute(
    session_id: str,
    background_tasks: BackgroundTasks,
    uid: str | None = Depends(get_current_user_optional),
    tier_cfg = Depends(require_tier_limit("pipeline_runs")),
):
    logger.info("[POST /execute] session=%s triggering execution", session_id)
    session = require_session_access(session_id, uid)
    if not session.pipeline:
        logger.warning("[POST /execute] session=%s has no pipeline", session_id)
        raise HTTPException(400, "No pipeline defined. Generate or create one first.")

    user_store.record_usage(uid or "anonymous", "pipeline_runs")

    session.execution_status = "processing"
    session.execution_error = None
    session.execution_result = None
    session_store.save(session)
    logger.info("[POST /execute] session=%s status set to processing", session_id)

    # Attempt to offload task to Redis Message Queue for dedicated background worker processes
    task_id = enqueue_task("pipeline_execution", {"session_id": session_id})
    if task_id:
        logger.info("[POST /execute] session=%s enqueued task_id=%s", session_id, task_id)
        return {"status": "processing", "task_id": task_id, "mode": "queued"}

    # Fallback to local background task execution when Redis queue is unconfigured
    logger.info("[POST /execute] Redis queue unavailable — running via local FastAPI BackgroundTasks", session_id)
    background_tasks.add_task(run_pipeline_bg, session_id)
    return {"status": "processing", "mode": "local_bg"}


@router.get("/pipeline/{session_id}/status")
async def get_status(
    session_id: str,
    uid: str | None = Depends(get_current_user_optional),
):
    session = require_session_access(session_id, uid)
    logger.debug(
        "[GET /status] session=%s status=%s error=%s",
        session_id, session.execution_status, session.execution_error,
    )
    return {
        "status": session.execution_status,
        "error": session.execution_error,
        "result": session.execution_result,
    }


@router.get("/session/{session_id}/download")
async def download_dataset(
    session_id: str,
    uid: str | None = Depends(get_current_user_optional),
):
    require_session_access(session_id, uid)
    df = session_store.load_dataframe(session_id)
    if df is None:
        raise HTTPException(404, "Dataset not found")

    # Sanitize formulas at export-time only
    from app.services.ingest import sanitize_formulas
    df = sanitize_formulas(df)

    records = df.to_dict(orient="records")
    from app.services.session import _sanitize_for_firestore
    return _sanitize_for_firestore(records)


@router.get("/pipeline/{session_id}/logs")
async def get_logs(
    session_id: str,
    uid: str | None = Depends(get_current_user_optional),
) -> list[list[dict]]:
    session = require_session_access(session_id, uid)
    return [log.model_dump() for log in session.execution_logs]


@router.get("/session/{session_id}/profile")
async def get_profile(
    session_id: str,
    uid: str | None = Depends(get_current_user_optional),
):
    session = require_session_access(session_id, uid)
    return session.profile
