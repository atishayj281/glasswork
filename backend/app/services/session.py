import json
import logging
import math
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from app.config import DATA_DIR, SESSION_TTL_HOURS
from app.models.pipeline import PipelinePlan, StepLog
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
    uid: str | None = None  # Firebase user id (None = anonymous)
    process_on_client: bool = True
    execution_status: str = "idle"  # idle, processing, completed, failed
    execution_error: str | None = None
    execution_result: dict | None = None

    def is_expired(self) -> bool:
        return datetime.utcnow() - self.created_at > timedelta(hours=SESSION_TTL_HOURS)


def _firestore_json_default(obj: Any) -> Any:
    """Custom JSON encoder fallback for types Firestore cannot store.

    Handles numpy scalars, numpy arrays, pandas NA/NaT, and non-finite
    floats (NaN, Inf) that cause Firestore to reject a document with an
    'invalid nested entity' error.
    """
    try:
        import numpy as np
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return None if (np.isnan(obj) or np.isinf(obj)) else float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.bool_):
            return bool(obj)
    except ImportError:
        pass
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    try:
        import pandas as _pd
        if obj is _pd.NA or obj is _pd.NaT:
            return None
    except ImportError:
        pass
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def _sanitize_for_firestore(data: Any) -> Any:
    """Round-trip through JSON to strip numpy types and NaN/Inf values."""
    if data is None:
        return None
    return json.loads(
        json.dumps(data, default=_firestore_json_default),
        parse_constant=lambda _: None,  # NaN / Infinity / -Infinity -> None
    )


def serialize_session(state: SessionState) -> dict:
    # Serialize execution logs to a JSON string to avoid nested array limitations in Firestore
    execution_logs_str = None
    if state.execution_logs:
        try:
            raw_logs = [[log.model_dump() for log in run] for run in state.execution_logs]
            execution_logs_str = json.dumps(_sanitize_for_firestore(raw_logs), default=_firestore_json_default)
        except Exception as e:
            logging.getLogger(__name__).error(f"Failed to serialize execution_logs to string: {e}")
            execution_logs_str = None

    # Serialize execution result to a JSON string to avoid nested array (e.g. heatmap z) and NaN limitations in Firestore
    execution_result_str = None
    if state.execution_result:
        try:
            execution_result_str = json.dumps(_sanitize_for_firestore(state.execution_result), default=_firestore_json_default)
        except Exception as e:
            logging.getLogger(__name__).error(f"Failed to serialize execution_result to string: {e}")
            execution_result_str = None

    return {
        "session_id": state.session_id,
        "file_name": state.file_name,
        "profile": state.profile.model_dump() if state.profile else None,
        "parquet_path": str(state.parquet_path),
        "chat_history": state.chat_history,
        "pipeline": state.pipeline.model_dump() if state.pipeline else None,
        "execution_logs": execution_logs_str,
        "created_at": state.created_at.isoformat(),
        "uid": state.uid,
        "process_on_client": state.process_on_client,
        "execution_status": state.execution_status,
        "execution_error": state.execution_error,
        "execution_result": execution_result_str,
    }


def deserialize_session(data: dict) -> SessionState:
    profile_data = data.get("profile")
    profile = DatasetProfile.model_validate(profile_data) if profile_data else None
    
    pipeline_data = data.get("pipeline")
    pipeline = PipelinePlan.model_validate(pipeline_data) if pipeline_data else None
    
    # Parse execution_logs from JSON string or list fallback
    execution_logs_data = data.get("execution_logs")
    if isinstance(execution_logs_data, str):
        try:
            execution_logs_data = json.loads(execution_logs_data)
        except Exception:
            execution_logs_data = []
    elif not isinstance(execution_logs_data, list):
        execution_logs_data = []
        
    execution_logs = []
    for run in execution_logs_data:
        if isinstance(run, list):
            execution_logs.append([StepLog.model_validate(log) for log in run if isinstance(log, dict)])
        
    created_at_val = data.get("created_at")
    if isinstance(created_at_val, str):
        created_at = datetime.fromisoformat(created_at_val)
    else:
        created_at = datetime.utcnow()
        
    # Parse execution_result from JSON string or dict fallback
    execution_result_data = data.get("execution_result")
    execution_result = None
    if isinstance(execution_result_data, str):
        try:
            execution_result = json.loads(execution_result_data)
        except Exception:
            execution_result = None
    elif isinstance(execution_result_data, dict):
        execution_result = execution_result_data
        
    return SessionState(
        session_id=data["session_id"],
        file_name=data["file_name"],
        profile=profile,
        parquet_path=Path(data["parquet_path"]),
        chat_history=data.get("chat_history") or [],
        pipeline=pipeline,
        execution_logs=execution_logs,
        created_at=created_at,
        uid=data.get("uid"),
        process_on_client=data.get("process_on_client", True),
        execution_status=data.get("execution_status", "idle"),
        execution_error=data.get("execution_error"),
        execution_result=execution_result,
    )



class SessionStore:
    def __init__(self) -> None:
        self._local_sessions: dict[str, SessionState] = {}
        self._firestore_db = None
        self._firestore_checked = False
        DATA_DIR.mkdir(parents=True, exist_ok=True)

    def _get_firestore(self):
        if self._firestore_checked:
            return self._firestore_db
        
        self._firestore_checked = True
        try:
            import firebase_admin
            from firebase_admin import firestore
            firebase_admin.get_app()
            self._firestore_db = firestore.client()
            logging.getLogger(__name__).info("Firestore session store initialized successfully")
        except Exception as e:
            logging.getLogger(__name__).warning(
                f"Firestore could not be initialized, falling back to local memory: {e}"
            )
        return self._firestore_db

    def create(
        self,
        file_name: str,
        profile: DatasetProfile,
        parquet_path: Path,
        uid: str | None = None,
        process_on_client: bool = True,
    ) -> SessionState:
        self._purge_expired()
        session_id = str(uuid.uuid4())
        state = SessionState(
            session_id=session_id,
            file_name=file_name,
            profile=profile,
            parquet_path=parquet_path,
            uid=uid,
            process_on_client=process_on_client,
        )
        self.save(state)
        return state

    def save(self, state: SessionState) -> None:
        # Save locally (as cache)
        self._local_sessions[state.session_id] = state
        
        # Save to Firestore if available
        firestore_db = self._get_firestore()
        if firestore_db:
            try:
                doc_ref = firestore_db.collection("sessions").document(state.session_id)
                doc_ref.set(serialize_session(state))
            except Exception as e:
                log = logging.getLogger(__name__)
                log.error(
                    "Failed to save session %s to Firestore (full payload): %s — retrying without execution_result",
                    state.session_id, e,
                )
                # Fallback: strip execution_result (may contain unencodable types)
                # so that execution_status / execution_error are always persisted.
                try:
                    fallback = serialize_session(state)
                    fallback["execution_result"] = None
                    doc_ref.set(fallback)
                    log.warning(
                        "Saved session %s to Firestore WITHOUT execution_result — "
                        "status=%s will be visible but chart/preview data lost in Firestore",
                        state.session_id, state.execution_status,
                    )
                except Exception as e2:
                    log.error(
                        "Fallback Firestore save also failed for session %s: %s",
                        state.session_id, e2,
                    )

    def claim(self, session_id: str, uid: str) -> SessionState | None:
        """Associate an anonymous session with a logged-in user."""
        state = self.get(session_id)
        if state:
            state.uid = uid
            self.save(state)
        return state

    def get(self, session_id: str) -> SessionState | None:
        # If Firestore is active, fetch from Firestore to ensure multi-process consistency
        firestore_db = self._get_firestore()
        if firestore_db:
            try:
                doc_ref = firestore_db.collection("sessions").document(session_id)
                doc_snap = doc_ref.get()
                if doc_snap.exists:
                    data = doc_snap.to_dict()
                    state = deserialize_session(data)
                    
                    # Merge with local cache if the local cache has more up-to-date execution info
                    local_state = self._local_sessions.get(session_id)
                    if local_state:
                        if local_state.execution_status in ("completed", "failed") and state.execution_status == "processing":
                            state.execution_status = local_state.execution_status
                            state.execution_error = local_state.execution_error
                            state.execution_result = local_state.execution_result
                        elif local_state.execution_result and not state.execution_result:
                            state.execution_result = local_state.execution_result
                            
                    if state.is_expired():
                        self.delete(session_id)
                        return None
                    return state
            except Exception as e:
                logging.getLogger(__name__).error(f"Failed to get session {session_id} from Firestore: {e}")
                return None

                
        # Fallback to local memory cache for dev environment without Firestore
        state = self._local_sessions.get(session_id)
        if state:
            if state.is_expired():
                self.delete(session_id)
                return None
            return state
        return None

    def delete(self, session_id: str) -> None:
        # Remove from local cache
        state = self._local_sessions.pop(session_id, None)
        
        # Unlink local file
        if state and state.parquet_path.exists():
            state.parquet_path.unlink(missing_ok=True)
            
        # Delete from Firestore if available
        firestore_db = self._get_firestore()
        if firestore_db:
            try:
                firestore_db.collection("sessions").document(session_id).delete()
            except Exception as e:
                logging.getLogger(__name__).error(f"Failed to delete session {session_id} from Firestore: {e}")
                
        # Delete from Supabase Storage if available
        try:
            from app.config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_STORAGE_BUCKET
            if SUPABASE_URL and SUPABASE_KEY:
                from app.api.upload import get_supabase_client
                supabase = get_supabase_client()
                storage_path = f"sessions/{session_id}/data.parquet"
                supabase.storage.from_(SUPABASE_STORAGE_BUCKET).remove([storage_path])
        except Exception as e:
            logging.getLogger(__name__).error(f"Failed to delete parquet storage file for session {session_id}: {e}")

    def load_dataframe(self, session_id: str) -> pd.DataFrame | None:
        state = self.get(session_id)
        if not state:
            return None
            
        local_path = state.parquet_path
        if not local_path or not local_path.exists() or local_path == Path():
            # If the path in state is relative/empty or file does not exist locally
            local_path = DATA_DIR / session_id / "data.parquet"
            
            # The parquet file is not on this server instance! Download it from Supabase Storage.
            logging.getLogger(__name__).info(f"Parquet file not found locally at {local_path}. Fetching from Supabase Storage.")
            try:
                from app.api.upload import get_supabase_client
                from app.config import SUPABASE_URL, SUPABASE_KEY, SUPABASE_STORAGE_BUCKET
                
                if SUPABASE_URL and SUPABASE_KEY:
                    storage_path = f"sessions/{session_id}/data.parquet"
                    supabase = get_supabase_client()
                    
                    # Create parent directory if it doesn't exist
                    local_path.parent.mkdir(parents=True, exist_ok=True)
                    
                    # Download from Supabase
                    response = supabase.storage.from_(SUPABASE_STORAGE_BUCKET).download(storage_path)
                    with open(local_path, "wb") as f:
                        f.write(response)
                        
                    logging.getLogger(__name__).info(f"Successfully downloaded parquet file for session {session_id} to {local_path}")
                    # Update the parquet path in session state
                    state.parquet_path = local_path
                    self.save(state)
                else:
                    logging.getLogger(__name__).warning("Supabase URL or Key not set. Cannot download parquet file.")
                    return None
            except Exception as e:
                logging.getLogger(__name__).error(f"Failed to download parquet file for session {session_id} from Supabase: {e}")
                return None
                
        return pd.read_parquet(local_path)

    def _purge_expired(self) -> None:
        expired = [sid for sid, s in self._local_sessions.items() if s.is_expired()]
        for sid in expired:
            self.delete(sid)


session_store = SessionStore()

