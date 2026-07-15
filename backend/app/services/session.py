import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from app.config import DATA_DIR, SESSION_TTL_HOURS
from app.models.pipeline import ExecutionResult, PipelinePlan, StepLog
from app.models.schema import DatasetProfile


@dataclass
class SessionState:
    session_id: str
    file_name: str
    profile: DatasetProfile
    parquet_path: Path
    chat_history: list[dict[str, str]] = field(default_factory=list)
    pipeline: PipelinePlan | None = None
    execution_logs: list[list[StepLog]] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)

    def is_expired(self) -> bool:
        return datetime.utcnow() - self.created_at > timedelta(hours=SESSION_TTL_HOURS)


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}
        DATA_DIR.mkdir(parents=True, exist_ok=True)

    def create(
        self,
        file_name: str,
        profile: DatasetProfile,
        parquet_path: Path,
    ) -> SessionState:
        self._purge_expired()
        session_id = str(uuid.uuid4())
        state = SessionState(
            session_id=session_id,
            file_name=file_name,
            profile=profile,
            parquet_path=parquet_path,
        )
        self._sessions[session_id] = state
        return state

    def get(self, session_id: str) -> SessionState | None:
        self._purge_expired()
        state = self._sessions.get(session_id)
        if state and state.is_expired():
            self.delete(session_id)
            return None
        return state

    def delete(self, session_id: str) -> None:
        state = self._sessions.pop(session_id, None)
        if state and state.parquet_path.exists():
            state.parquet_path.unlink(missing_ok=True)

    def load_dataframe(self, session_id: str) -> pd.DataFrame | None:
        state = self.get(session_id)
        if not state or not state.parquet_path.exists():
            return None
        return pd.read_parquet(state.parquet_path)

    def _purge_expired(self) -> None:
        expired = [sid for sid, s in self._sessions.items() if s.is_expired()]
        for sid in expired:
            self.delete(sid)


session_store = SessionStore()
