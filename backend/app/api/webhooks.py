from datetime import datetime, timezone
import logging
from typing import Any
from fastapi import APIRouter, File, Header, HTTPException, UploadFile, status
from pydantic import BaseModel

from app import config
from app.middleware.rate_limit import limiter
from app.services.executor import execute_pipeline
from app.services.ingest import ingest_file
from app.services.saved_pipeline_store import saved_pipeline_store
from app.services.session import session_store

logger = logging.getLogger(__name__)

router = APIRouter(tags=["webhooks"])


class WebhookTriggerResponse(BaseModel):
    status: str = "success"
    pipeline_id: str
    pipeline_name: str
    row_count: int
    columns: list[str]
    preview: list[dict[str, Any]]
    viz_specs: list[dict[str, Any]]
    execution_log: list[dict[str, Any]]


@router.post(
    "/webhooks/{pipeline_id}/trigger",
    response_model=WebhookTriggerResponse,
)
async def trigger_saved_pipeline(
    pipeline_id: str,
    file: UploadFile = File(...),
    x_webhook_secret: str | None = Header(None, alias="X-Webhook-Secret"),
) -> WebhookTriggerResponse:
    """Trigger a saved pipeline with an uploaded data file."""

    # 1. Secret authentication and existence verification
    # Always return exact same 404 whether header is missing, pipeline is missing, or secret is wrong.
    if not x_webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pipeline not found",
        )

    sp = saved_pipeline_store.get(pipeline_id)
    if not sp or sp.status != "active" or not sp.verify_secret(x_webhook_secret):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pipeline not found",
        )

    # 2. Rate Limit Check (uses pipeline_id as key)
    limiter.check(f"webhook_{pipeline_id}")

    # 3. File size check (reuses MAX_UPLOAD_MB)
    content = await file.read()
    max_bytes = config.MAX_UPLOAD_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File size exceeds maximum allowed size of {config.MAX_UPLOAD_MB}MB",
        )

    # 4. Ingest file and execute pipeline
    session_id = None
    try:
        session_id, _ = ingest_file(
            content=content,
            filename=file.filename or "upload.csv",
            uid=sp.uid,
        )
        df = session_store.load_dataframe(session_id)
        if df is None:
            raise ValueError("Failed to load DataFrame after file ingestion")

        exec_res = execute_pipeline(df, sp.pipeline)
    except Exception as e:
        logger.error("Webhook trigger failed for pipeline %s: %s", pipeline_id, e, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Webhook execution failed",
        ) from e
    finally:
        if session_id:
            session_store.delete(session_id)

    # 5. Update pipeline statistics
    sp.trigger_count += 1
    sp.last_triggered_at = datetime.now(timezone.utc)
    saved_pipeline_store.save(sp)

    return WebhookTriggerResponse(
        status="success",
        pipeline_id=sp.pipeline_id,
        pipeline_name=sp.name,
        row_count=exec_res.row_count,
        columns=exec_res.columns,
        preview=exec_res.preview,
        viz_specs=[v.model_dump() for v in exec_res.viz_specs],
        execution_log=[log.model_dump() for log in exec_res.execution_log],
    )
