import pandas as pd

from app.models.schema import ColumnMeta, DatasetProfile, ExcelIngestMeta

SAMPLE_ROWS = 1000


def analyze_dataframe(
    df: pd.DataFrame,
    file_name: str,
    excel_meta: ExcelIngestMeta | None = None,
) -> DatasetProfile:
    sample = df.head(SAMPLE_ROWS)
    columns: list[ColumnMeta] = []

    for col in df.columns:
        null_pct = float(sample[col].isna().mean() * 100) if len(sample) > 0 else 0.0
        dtype = str(sample[col].dtype)
        if dtype == "object":
            try:
                pd.to_numeric(sample[col].dropna().head(100))
                dtype = "numeric (inferred)"
            except (ValueError, TypeError):
                pass
        columns.append(ColumnMeta(name=str(col), dtype=dtype, null_pct=round(null_pct, 2)))

    return DatasetProfile(
        file_name=file_name,
        row_count=len(df),
        column_count=len(df.columns),
        columns=columns,
        excel_meta=excel_meta,
    )
