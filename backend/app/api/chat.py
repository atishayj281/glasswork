import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import BUDGET_MAX_CALLS_PER_DAY, BUDGET_MAX_TOKENS_PER_DAY
from app.middleware.auth import get_current_user_optional, require_session_access
from app.middleware.rate_limit import limiter
from app.services.agent import chat_stream
from app.services.budget import check_budget, record_llm_call

router = APIRouter()


from app.middleware.gating import check_provider_access


class ChatRequest(BaseModel):
    message: str
    provider: str | None = "default"


@router.post("/chat/{session_id}")
async def chat(
    session_id: str,
    body: ChatRequest,
    uid: str | None = Depends(get_current_user_optional),
):
    session = require_session_access(session_id, uid)

    if body.provider and body.provider != "default":
        check_provider_access(uid, body.provider)

    # Protect LLM endpoints with per-second rate limiting
    rate_limit_key = uid if uid else f"session_{session_id}"
    limiter.check(rate_limit_key)

    # Enforce per-uid daily LLM budget (only for authenticated users)
    if uid:
        try:
            check_budget(uid)
        except ValueError as e:
            raise HTTPException(status_code=429, detail=str(e))

    async def event_generator():
        full_response_chars = 0
        try:
            async for token in chat_stream(session, body.message):
                full_response_chars += len(token)
                yield f"data: {json.dumps({'token': token})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            # Record usage after stream completes; rough estimate: 4 chars ≈ 1 token
            if uid:
                record_llm_call(uid, tokens_used=full_response_chars // 4)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
