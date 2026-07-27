import pandas as pd

from app.models.schema import ColumnMeta, DatasetProfile, ExcelIngestMeta

SAMPLE_ROWS = 1000


def _clean_numeric_series(series: pd.Series) -> pd.Series:
    """Extract numeric values from formatted strings (e.g. ₹250, $1,000, 15%, (250))."""
    if pd.api.types.is_numeric_dtype(series):
        return series
    s = series.astype(str).str.strip()
    s = s.str.replace(r'^\((.*)\)$', r'-\1', regex=True)
    s = s.str.replace(r'[₹$€£¥\s,%]', '', regex=True)
    extracted = s.str.extract(r'([-+]?\d*\.?\d+)', expand=False)
    return pd.to_numeric(extracted, errors="coerce")


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
                try:
                    non_null = sample[col].dropna().head(100)
                    if len(non_null) > 0:
                        cleaned = _clean_numeric_series(non_null)
                        valid_count = int(cleaned.notna().sum())
                        if valid_count > 0 and (valid_count / len(non_null)) >= 0.5:
                            dtype = "numeric (formatted)"
                except Exception:
                    pass

        columns.append(ColumnMeta(name=str(col), dtype=dtype, null_pct=round(null_pct, 2)))

    return DatasetProfile(
        file_name=file_name,
        row_count=len(df),
        column_count=len(df.columns),
        columns=columns,
        excel_meta=excel_meta,
    )
