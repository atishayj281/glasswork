from datetime import datetime
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.middleware.auth import get_current_user, require_session_access
from app.models.pipeline import PipelinePlan
from app.services.saved_pipeline_store import saved_pipeline_store

router = APIRouter(tags=["saved_pipelines"])


class PromotePipelineRequest(BaseModel):
    session_id: str
    name: str | None = None


class SavedPipelineCreateResponse(BaseModel):
    pipeline_id: str
    name: str
    webhook_secret: str
    created_at: datetime
    status: str


class SavedPipelineListItemResponse(BaseModel):
    pipeline_id: str
    name: str
    pipeline: PipelinePlan
    created_at: datetime
    last_triggered_at: datetime | None = None
    trigger_count: int = 0
    status: str


class RotateSecretResponse(BaseModel):
    pipeline_id: str
    webhook_secret: str


@router.post(
    "/pipelines/saved",
    response_model=SavedPipelineCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def promote_pipeline(
    req: PromotePipelineRequest,
    user_uid: str = Depends(get_current_user),
) -> SavedPipelineCreateResponse:
    """Promote a session's pipeline to a persistent SavedPipeline."""
    session = require_session_access(req.session_id, user_uid)

    if not session.pipeline:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session has no generated or edited pipeline to save",
        )

    pipeline_name = req.name.strip() if req.name and req.name.strip() else session.pipeline.name
    sp, raw_secret = saved_pipeline_store.create(
        uid=user_uid,
        name=pipeline_name,
        pipeline=session.pipeline,
    )

    return SavedPipelineCreateResponse(
        pipeline_id=sp.pipeline_id,
        name=sp.name,
        webhook_secret=raw_secret,
        created_at=sp.created_at,
        status=sp.status,
    )


@router.get(
    "/pipelines/saved",
    response_model=list[SavedPipelineListItemResponse],
)
async def list_saved_pipelines(
    user_uid: str = Depends(get_current_user),
) -> list[SavedPipelineListItemResponse]:
    """List all saved pipelines owned by the authenticated caller."""
    pipelines = saved_pipeline_store.list_for_user(user_uid)
    return [
        SavedPipelineListItemResponse(
            pipeline_id=sp.pipeline_id,
            name=sp.name,
            pipeline=sp.pipeline,
            created_at=sp.created_at,
            last_triggered_at=sp.last_triggered_at,
            trigger_count=sp.trigger_count,
            status=sp.status,
        )
        for sp in pipelines
    ]


@router.delete("/pipelines/saved/{pipeline_id}")
async def delete_saved_pipeline(
    pipeline_id: str,
    user_uid: str = Depends(get_current_user),
) -> dict[str, str]:
    """Delete a saved pipeline owned by the authenticated caller."""
    sp = saved_pipeline_store.get(pipeline_id)
    if not sp or sp.uid != user_uid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved pipeline not found",
        )

    saved_pipeline_store.delete(pipeline_id)
    return {"status": "deleted", "pipeline_id": pipeline_id}


@router.post(
    "/pipelines/saved/{pipeline_id}/rotate-secret",
    response_model=RotateSecretResponse,
)
async def rotate_pipeline_secret(
    pipeline_id: str,
    user_uid: str = Depends(get_current_user),
) -> RotateSecretResponse:
    """Rotate the webhook secret for a saved pipeline."""
    sp = saved_pipeline_store.get(pipeline_id)
    if not sp or sp.uid != user_uid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved pipeline not found",
        )

    result = saved_pipeline_store.rotate_secret(pipeline_id)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved pipeline not found",
        )

    _, new_raw_secret = result
    return RotateSecretResponse(
        pipeline_id=pipeline_id,
        webhook_secret=new_raw_secret,
    )
