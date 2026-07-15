import io
from pathlib import Path

import pandas as pd

from app.config import DATA_DIR, MAX_ROWS, MAX_UPLOAD_MB
from app.models.schema import DatasetProfile, ExcelIngestMeta
from app.services.excel_reader import read_excel_with_merges
from app.services.schema_analyzer import analyze_dataframe
from app.services.session import session_store


def _read_upload(
    content: bytes,
    filename: str,
    *,
    header_row: int | None = None,
    sheet_index: int = 0,
) -> tuple[pd.DataFrame, ExcelIngestMeta | None]:
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_UPLOAD_MB:
        raise ValueError(f"File exceeds {MAX_UPLOAD_MB}MB limit")

    lower = filename.lower()
    if lower.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(content), nrows=MAX_ROWS)
        return df, None
    if lower.endswith(".xlsx"):
        df, meta = read_excel_with_merges(
            content,
            sheet_index=sheet_index,
            header_row=header_row,
            max_rows=MAX_ROWS,
        )
        return df, meta
    if lower.endswith(".xls"):
        df = pd.read_excel(io.BytesIO(content), nrows=MAX_ROWS)
        meta = ExcelIngestMeta(
            sheet_name="Sheet1",
            header_row=0,
            merged_cells_resolved=0,
            merge_support=False,
        )
        return df, meta

    raise ValueError("Only CSV and Excel files are supported")


def ingest_file(
    content: bytes,
    filename: str,
    *,
    header_row: int | None = None,
    sheet_index: int = 0,
) -> tuple[str, DatasetProfile]:
    df, excel_meta = _read_upload(
        content,
        filename,
        header_row=header_row,
        sheet_index=sheet_index,
    )

    if len(df) > MAX_ROWS:
        raise ValueError(f"File exceeds {MAX_ROWS} row limit")

    profile = analyze_dataframe(df, filename, excel_meta=excel_meta)

    session = session_store.create(filename, profile, Path())
    session_dir = DATA_DIR / session.session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    parquet_path = session_dir / "data.parquet"
    df.to_parquet(parquet_path, index=False)
    session.parquet_path = parquet_path

    return session.session_id, profile
