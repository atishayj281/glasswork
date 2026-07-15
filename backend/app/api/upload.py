from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from app.services.ingest import ingest_file

router = APIRouter()


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    header_row: int | None = Query(None, ge=0, description="0-based header row (auto-detect if omitted)"),
    sheet_index: int = Query(0, ge=0, description="Excel sheet index"),
):
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    content = await file.read()
    try:
        session_id, profile = ingest_file(
            content,
            file.filename,
            header_row=header_row,
            sheet_index=sheet_index,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    return {"session_id": session_id, "profile": profile}
