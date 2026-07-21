from datetime import datetime, timezone
import logging
import secrets
import uuid
from typing import Any

from app.models.pipeline import PipelinePlan
from app.models.saved_pipeline import SavedPipeline
from app.services.firestore import get_firestore_client

logger = logging.getLogger(__name__)


def serialize_saved_pipeline(sp: SavedPipeline) -> dict[str, Any]:
    return {
        "pipeline_id": sp.pipeline_id,
        "uid": sp.uid,
        "name": sp.name,
        "pipeline": sp.pipeline.model_dump(),
        "secret_hash": sp.secret_hash,
        "created_at": sp.created_at.isoformat(),
        "last_triggered_at": sp.last_triggered_at.isoformat() if sp.last_triggered_at else None,
        "trigger_count": sp.trigger_count,
        "status": sp.status,
    }


def deserialize_saved_pipeline(data: dict[str, Any]) -> SavedPipeline:
    created_at_val = data.get("created_at")
    if isinstance(created_at_val, str):
        created_at = datetime.fromisoformat(created_at_val)
    else:
        created_at = datetime.now(timezone.utc)

    last_triggered_at_val = data.get("last_triggered_at")
    if isinstance(last_triggered_at_val, str):
        last_triggered_at = datetime.fromisoformat(last_triggered_at_val)
    else:
        last_triggered_at = None

    pipeline_data = data.get("pipeline")
    pipeline = (
        PipelinePlan.model_validate(pipeline_data)
        if isinstance(pipeline_data, dict)
        else PipelinePlan()
    )

    return SavedPipeline(
        pipeline_id=data["pipeline_id"],
        uid=data["uid"],
        name=data["name"],
        pipeline=pipeline,
        secret_hash=data["secret_hash"],
        created_at=created_at,
        last_triggered_at=last_triggered_at,
        trigger_count=data.get("trigger_count", 0),
        status=data.get("status", "active"),
    )


class SavedPipelineStore:
    def __init__(self) -> None:
        self._local_pipelines: dict[str, SavedPipeline] = {}

    def _get_firestore(self):
        return get_firestore_client()

    def create(
        self,
        uid: str,
        name: str,
        pipeline: PipelinePlan,
    ) -> tuple[SavedPipeline, str]:
        pipeline_id = str(uuid.uuid4())
        raw_secret = secrets.token_urlsafe(32)
        secret_hash = SavedPipeline.hash_secret(raw_secret)

        sp = SavedPipeline(
            pipeline_id=pipeline_id,
            uid=uid,
            name=name,
            pipeline=pipeline,
            secret_hash=secret_hash,
        )
        self.save(sp)
        return sp, raw_secret

    def save(self, sp: SavedPipeline) -> None:
        # Save to local cache
        self._local_pipelines[sp.pipeline_id] = sp

        # Save to Firestore if available
        firestore_db = self._get_firestore()
        if firestore_db:
            try:
                doc_ref = firestore_db.collection("saved_pipelines").document(sp.pipeline_id)
                doc_ref.set(serialize_saved_pipeline(sp))
            except Exception as e:
                logger.error(
                    "Failed to save saved_pipeline %s to Firestore: %s",
                    sp.pipeline_id,
                    e,
                )

    def get(self, pipeline_id: str) -> SavedPipeline | None:
        firestore_db = self._get_firestore()
        if firestore_db:
            try:
                doc_ref = firestore_db.collection("saved_pipelines").document(pipeline_id)
                doc_snap = doc_ref.get()
                if doc_snap.exists:
                    sp = deserialize_saved_pipeline(doc_snap.to_dict())
                    self._local_pipelines[pipeline_id] = sp
                    return sp
            except Exception as e:
                logger.error("Failed to get saved_pipeline %s from Firestore: %s", pipeline_id, e)

        return self._local_pipelines.get(pipeline_id)

    def list_for_user(self, uid: str) -> list[SavedPipeline]:
        results: dict[str, SavedPipeline] = {}
        firestore_db = self._get_firestore()
        if firestore_db:
            try:
                docs = firestore_db.collection("saved_pipelines").where("uid", "==", uid).stream()
                for doc in docs:
                    sp = deserialize_saved_pipeline(doc.to_dict())
                    results[sp.pipeline_id] = sp
                    self._local_pipelines[sp.pipeline_id] = sp
            except Exception as e:
                logger.error("Failed to list saved_pipelines for user %s from Firestore: %s", uid, e)

        # Merge local memory pipelines for this user
        for sp in self._local_pipelines.values():
            if sp.uid == uid and sp.pipeline_id not in results:
                results[sp.pipeline_id] = sp

        # Return sorted by created_at descending
        return sorted(results.values(), key=lambda p: p.created_at, reverse=True)

    def delete(self, pipeline_id: str) -> bool:
        existed = pipeline_id in self._local_pipelines
        self._local_pipelines.pop(pipeline_id, None)

        firestore_db = self._get_firestore()
        if firestore_db:
            try:
                doc_ref = firestore_db.collection("saved_pipelines").document(pipeline_id)
                if doc_ref.get().exists:
                    existed = True
                    doc_ref.delete()
            except Exception as e:
                logger.error("Failed to delete saved_pipeline %s from Firestore: %s", pipeline_id, e)

        return existed

    def rotate_secret(self, pipeline_id: str) -> tuple[SavedPipeline, str] | None:
        sp = self.get(pipeline_id)
        if not sp:
            return None

        new_raw_secret = secrets.token_urlsafe(32)
        sp.secret_hash = SavedPipeline.hash_secret(new_raw_secret)
        self.save(sp)
        return sp, new_raw_secret


saved_pipeline_store = SavedPipelineStore()
