import io
import logging
from pathlib import Path

import pandas as pd

from app.config import DATA_DIR, MAX_ROWS, MAX_UPLOAD_MB
from app.models.schema import DatasetProfile, ExcelIngestMeta
from app.services.excel_reader import read_excel_with_merges
from app.services.schema_analyzer import analyze_dataframe
from app.services.session import session_store

logger = logging.getLogger(__name__)


def _read_upload(
    content: bytes,
    filename: str,
    *,
    header_row: int | None = None,
    sheet_index: int = 0,
) -> tuple[pd.DataFrame, ExcelIngestMeta | None]:
    size_mb = len(content) / (1024 * 1024)
    logger.info("[ingest] _read_upload file=%r size_mb=%.2f", filename, size_mb)
    if size_mb > MAX_UPLOAD_MB:
        raise ValueError(f"File exceeds {MAX_UPLOAD_MB}MB limit")

    lower = filename.lower()
    if lower.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(content), nrows=MAX_ROWS)
        logger.info("[ingest] read CSV rows=%d cols=%d", len(df), len(df.columns))
        return df, None
    if lower.endswith(".xlsx"):
        df, meta = read_excel_with_merges(
            content,
            sheet_index=sheet_index,
            header_row=header_row,
            max_rows=MAX_ROWS,
        )
        logger.info("[ingest] read XLSX rows=%d cols=%d merged_resolved=%s", len(df), len(df.columns), meta.merged_cells_resolved if meta else 0)
        return df, meta
    if lower.endswith(".xls"):
        df = pd.read_excel(io.BytesIO(content), nrows=MAX_ROWS)
        meta = ExcelIngestMeta(
            sheet_name="Sheet1",
            header_row=0,
            merged_cells_resolved=0,
            merge_support=False,
        )
        logger.info("[ingest] read XLS rows=%d cols=%d", len(df), len(df.columns))
        return df, meta

    raise ValueError("Only CSV and Excel files are supported")


def sanitize_formulas(df: pd.DataFrame) -> pd.DataFrame:
    """Sanitize cells starting with =, +, -, @ to prevent CSV/Excel formula injection.
    
    Decision: We prefix dangerous cells with a single quote ('). This is the recommended
    defense (e.g. by OWASP) because it forces Excel to treat the cell contents as text,
    preventing arbitrary execution while preserving the actual value. We only sanitize
    actual string values so that numeric values (which may naturally start with - or +)
    remain intact as numbers.
    """
    for col in df.columns:
        df[col] = df[col].apply(
            lambda val: f"'{val}"
            if isinstance(val, str) and val.lstrip().startswith(('=', '+', '-', '@'))
            else val
        )
    return df


def ingest_file(
    content: bytes,
    filename: str,
    *,
    header_row: int | None = None,
    sheet_index: int = 0,
    uid: str | None = None,
) -> tuple[str, DatasetProfile]:
    logger.info("[ingest] ingest_file START file=%r uid=%s", filename, uid)
    df, excel_meta = _read_upload(
        content,
        filename,
        header_row=header_row,
        sheet_index=sheet_index,
    )

    if len(df) > MAX_ROWS:
        raise ValueError(f"File exceeds {MAX_ROWS} row limit")

    logger.info("[ingest] analyzing schema rows=%d cols=%d", len(df), len(df.columns))
    profile = analyze_dataframe(df, filename, excel_meta=excel_meta)

    # Determine client processing based on 20MB file size limit
    file_size_bytes = len(content)
    process_on_client = file_size_bytes <= (20 * 1024 * 1024)
    profile.process_on_client = process_on_client

    logger.info("[ingest] creating session file=%r uid=%s process_on_client=%s", filename, uid, process_on_client)
    session = session_store.create(filename, profile, Path(), uid=uid, process_on_client=process_on_client)
    session_dir = DATA_DIR / session.session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    parquet_path = session_dir / "data.parquet"
    df.to_parquet(parquet_path, index=False)
    session.parquet_path = parquet_path
    logger.info("[ingest] parquet saved locally | session=%s path=%s", session.session_id, parquet_path)

    # Upload parquet to Supabase Storage
    try:
        from app.api.upload import get_supabase_client
        from app.config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_STORAGE_BUCKET
        if SUPABASE_URL and SUPABASE_KEY:
            supabase = get_supabase_client()
            storage_path = f"sessions/{session.session_id}/data.parquet"
            logger.info("[ingest] uploading parquet to Supabase | session=%s path=%s", session.session_id, storage_path)
            with open(parquet_path, "rb") as f:
                supabase.storage.from_(SUPABASE_STORAGE_BUCKET).upload(
                    storage_path,
                    f.read(),
                    {"content-type": "application/octet-stream"},
                )
            logger.info("[ingest] Supabase parquet upload OK | session=%s", session.session_id)
    except Exception as e:
        import logging as _log
        _log.getLogger(__name__).error(f"Failed to upload parquet dataset to cloud storage: {e}")
        from app.config import SUPABASE_URL, SUPABASE_KEY
        if SUPABASE_URL and SUPABASE_KEY:
            raise ValueError(f"Failed to upload parquet dataset to cloud storage: {e}") from e

    # Persist the updated session state
    session_store.save(session)
    logger.info("[ingest] ingest_file DONE | session=%s", session.session_id)

    return session.session_id, profile
