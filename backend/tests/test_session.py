import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path
from datetime import datetime

from app.models.schema import DatasetProfile
from app.services.session import SessionState, session_store


def _make_test_profile():
    return DatasetProfile(
        file_name="test.csv",
        row_count=3,
        column_count=2,
        columns=[],
    )


def test_save_firestore_fails_retains_local_cache():
    """Simulate Firestore save failing. The session must still exist in the local cache."""
    session_store._local_sessions.clear()
    
    session = SessionState(
        session_id="test-session-save-fail",
        file_name="test.csv",
        profile=_make_test_profile(),
        parquet_path=Path("/tmp/fake.parquet"),
        created_at=datetime.utcnow()
    )
    
    with patch.object(session_store, "_get_firestore") as mock_get_fs:
        mock_fs = MagicMock()
        mock_fs.collection.return_value.document.return_value.set.side_effect = Exception("Firestore down")
        mock_get_fs.return_value = mock_fs
        
        # Save should log the error and NOT raise/crash
        session_store.save(session)
        
    # Local cache must still have it
    assert session_store._local_sessions["test-session-save-fail"] is session


def test_get_firestore_fails_falls_back_to_local():
    """If Firestore get fails, SessionStore.get must fall back to local cache."""
    session_store._local_sessions.clear()
    
    session = SessionState(
        session_id="test-session-get-fail",
        file_name="test.csv",
        profile=_make_test_profile(),
        parquet_path=Path("/tmp/fake.parquet"),
        created_at=datetime.utcnow()
    )
    session_store._local_sessions["test-session-get-fail"] = session
    
    with patch.object(session_store, "_get_firestore") as mock_get_fs:
        mock_fs = MagicMock()
        mock_fs.collection.return_value.document.return_value.get.side_effect = Exception("Firestore read failed")
        mock_get_fs.return_value = mock_fs
        
        # Calling get should NOT return None, but fallback to local cache
        retrieved = session_store.get("test-session-get-fail")
        assert retrieved is session


def test_delete_removes_all_three_locations():
    """Confirm session_store.delete() removes data from local disk, Firestore, and Supabase Storage."""
    session_store._local_sessions.clear()
    
    fake_path = MagicMock(spec=Path)
    fake_path.exists.return_value = True
    
    session = SessionState(
        session_id="test-session-delete",
        file_name="test.csv",
        profile=_make_test_profile(),
        parquet_path=fake_path,
        created_at=datetime.utcnow()
    )
    session_store._local_sessions["test-session-delete"] = session
    
    with patch.object(session_store, "_get_firestore") as mock_get_fs, \
         patch("app.api.upload.get_supabase_client") as mock_get_sb, \
         patch.dict("os.environ", {"SUPABASE_URL": "http://fake", "SUPABASE_KEY": "fake"}):
        
        mock_fs = MagicMock()
        mock_get_fs.return_value = mock_fs
        
        mock_sb = MagicMock()
        mock_get_sb.return_value = mock_sb
        
        session_store.delete("test-session-delete")
        
        # 1. Local file unlink called
        fake_path.unlink.assert_called_once_with(missing_ok=True)
        
        # 2. Firestore doc delete called
        mock_fs.collection.assert_called_with("sessions")
        mock_fs.collection.return_value.document.assert_called_with("test-session-delete")
        mock_fs.collection.return_value.document.return_value.delete.assert_called_once()
        
        # 3. Supabase Storage remove called
        from app.config import SUPABASE_STORAGE_BUCKET
        mock_sb.storage.from_.assert_called_once_with(SUPABASE_STORAGE_BUCKET)
        mock_sb.storage.from_.return_value.remove.assert_called_once_with(["sessions/test-session-delete/data.parquet"])
        
        # 4. Local cache removed
        assert "test-session-delete" not in session_store._local_sessions


def test_get_firestore_fails_and_no_local_cache_returns_none():
    """
    Test a race/fail scenario:
    1. A session is updated on replica A (not present in replica B's local cache).
    2. Firestore read fails for a request landing on replica B (fresh replica with no local cache).
    3. The store must return None.
    """
    session_store._local_sessions.clear()
    
    # Replica B has no local cache for 'test-session-race'
    with patch.object(session_store, "_get_firestore") as mock_get_fs:
        mock_fs = MagicMock()
        mock_fs.collection.return_value.document.return_value.get.side_effect = Exception("Firestore read failed")
        mock_get_fs.return_value = mock_fs
        
        # Calling get should return None because Firestore failed and local cache is empty on this replica
        retrieved = session_store.get("test-session-race")
        assert retrieved is None

