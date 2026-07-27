import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from supabase import create_client

from app.config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_STORAGE_BUCKET
from app.middleware.auth import get_current_user
from app.services.ingest import ingest_file

router = APIRouter()
logger = logging.getLogger(__name__)

_supabase_client = None


def get_supabase_client():
    global _supabase_client
    if _supabase_client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError("Supabase configuration (SUPABASE_URL, SUPABASE_KEY) is missing.")
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _supabase_client


from app.billing.tiers import TierConfig
from app.middleware.gating import require_tier_limit
from app.services.user_store import user_store


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    header_row: int | None = Query(None, ge=0, description="0-based header row (auto-detect if omitted)"),
    sheet_index: int = Query(0, ge=0, description="Excel sheet index"),
    uid: str = Depends(get_current_user),
    tier_cfg: TierConfig = Depends(require_tier_limit("uploads")),
):
    """Receive file from frontend, upload to Supabase Storage using service role key (bypasses RLS),
    then ingest the data into a session."""
    content = await file.read()
    filename = file.filename or "upload"
    size_mb = len(content) / (1024 * 1024)

    # Check tier max file size
    if size_mb > tier_cfg.max_file_size_mb:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "limit_exceeded",
                "tier": tier_cfg.name.value,
                "limit": "max_file_size_mb",
                "message": f"File size ({size_mb:.1f} MB) exceeds maximum allowed size ({tier_cfg.max_file_size_mb} MB) for the {tier_cfg.label} plan.",
                "upgrade_url": "/pricing",
            },
        )

    logger.info("[upload] uid=%s file=%r size=%.1fKB header_row=%s sheet=%d", uid, filename, len(content) / 1024, header_row, sheet_index)

    # Record upload usage
    user_store.record_usage(uid, "uploads")

    # Upload to Supabase Storage using service role key — bypasses RLS
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    storage_path = f"users/{uid}/uploads/{uuid.uuid4()}.{ext}"
    try:
        supabase = get_supabase_client()
        supabase.storage.from_(SUPABASE_STORAGE_BUCKET).upload(
            storage_path,
            content,
            {"content-type": file.content_type or "application/octet-stream"},
        )
        logger.info("[upload] Supabase Storage upload OK | uid=%s path=%s", uid, storage_path)
    except Exception as e:
        logger.error("[upload] Supabase Storage upload FAILED | uid=%s error=%s", uid, e)
        raise HTTPException(400, f"Could not upload file to storage: {e}") from e

    try:
        logger.info("[upload] starting ingest | uid=%s file=%r", uid, filename)
        session_id, profile = ingest_file(
            content,
            filename,
            uid=uid,
            header_row=header_row,
            sheet_index=sheet_index,
        )
        
        # Set session context for structured logging correlation
        from app.logging_config import session_context
        session_context.set(session_id)
        
        logger.info(
            "[upload] ingest OK | uid=%s session=%s rows=%d cols=%d",
            uid, session_id, profile.row_count, profile.column_count,
        )
    except ValueError as e:
        logger.error("[upload] ingest FAILED | uid=%s file=%r error=%s", uid, filename, e)
        raise HTTPException(400, str(e)) from e

    from app.services.session import session_store
    session = session_store.get(session_id)
    process_on_client = session.process_on_client if session else True
    logger.info("[upload] done | session=%s process_on_client=%s", session_id, process_on_client)

    return {
        "session_id": session_id,
        "profile": profile,
        "process_on_client": process_on_client,
    }
