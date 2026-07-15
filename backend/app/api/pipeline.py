from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.pipeline import ExecutionResult, PipelinePlan
from app.services.agent import generate_pipeline
from app.services.executor import execute_pipeline
from app.services.session import session_store

router = APIRouter()


class GenerateRequest(BaseModel):
    intent: str | None = None


@router.get("/pipeline/{session_id}")
async def get_pipeline(session_id: str) -> PipelinePlan | None:
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return session.pipeline


@router.patch("/pipeline/{session_id}")
async def update_pipeline(session_id: str, plan: PipelinePlan) -> PipelinePlan:
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    session.pipeline = plan
    return plan


@router.post("/pipeline/{session_id}/generate")
async def generate(session_id: str, body: GenerateRequest | None = None) -> PipelinePlan:
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    intent = body.intent if body else None
    try:
        return await generate_pipeline(session, intent)
    except Exception as e:
        raise HTTPException(500, f"Pipeline generation failed: {e}") from e


@router.post("/pipeline/{session_id}/execute")
async def execute(session_id: str) -> ExecutionResult:
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if not session.pipeline:
        raise HTTPException(400, "No pipeline defined. Generate or create one first.")

    df = session_store.load_dataframe(session_id)
    if df is None:
        raise HTTPException(404, "Dataset not found")

    try:
        result = execute_pipeline(df, session.pipeline)
        session.execution_logs.append(result.execution_log)
        return result
    except Exception as e:
        raise HTTPException(400, f"Pipeline execution failed: {e}") from e


@router.get("/pipeline/{session_id}/logs")
async def get_logs(session_id: str) -> list[list[dict]]:
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return [log.model_dump() for log in session.execution_logs]


@router.get("/session/{session_id}/profile")
async def get_profile(session_id: str):
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    return session.profile
