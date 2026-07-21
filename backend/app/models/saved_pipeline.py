from datetime import datetime, timezone
import hashlib
import secrets
from typing import Any, Literal
from pydantic import BaseModel, Field

from app.models.pipeline import PipelinePlan


class SavedPipeline(BaseModel):
    pipeline_id: str
    uid: str
    name: str
    pipeline: PipelinePlan
    secret_hash: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_triggered_at: datetime | None = None
    trigger_count: int = 0
    status: Literal["active", "inactive"] = "active"

    @staticmethod
    def hash_secret(raw_secret: str) -> str:
        """Hash a raw webhook secret using SHA-256."""
        return hashlib.sha256(raw_secret.encode("utf-8")).hexdigest()

    def verify_secret(self, raw_secret: str) -> bool:
        """Verify a candidate raw secret against secret_hash using constant-time comparison."""
        if not raw_secret:
            return False
        candidate_hash = self.hash_secret(raw_secret)
        return secrets.compare_digest(candidate_hash, self.secret_hash)
