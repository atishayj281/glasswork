import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.services.agent import chat_stream
from app.services.session import session_store

router = APIRouter()


class ChatRequest(BaseModel):
    message: str


@router.post("/chat/{session_id}")
async def chat(session_id: str, body: ChatRequest):
    session = session_store.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    async def event_generator():
        try:
            async for token in chat_stream(session, body.message):
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
