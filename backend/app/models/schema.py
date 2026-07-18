from pydantic import BaseModel, Field


class ExcelIngestMeta(BaseModel):
    sheet_name: str
    header_row: int
    merged_cells_resolved: int
    merge_support: bool


class ColumnMeta(BaseModel):
    name: str
    dtype: str
    null_pct: float = Field(ge=0, le=100)


class DatasetProfile(BaseModel):
    file_name: str
    row_count: int
    column_count: int
    columns: list[ColumnMeta]
    excel_meta: ExcelIngestMeta | None = None
    process_on_client: bool = True

