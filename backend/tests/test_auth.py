"""Tests for session-scoped authorization (Bug 2 fix).

These tests exercise require_session_access via the FastAPI TestClient,
using an in-process mock of session_store and firebase_admin.auth so no
real Firebase connection is needed.

Endpoints covered:
  POST /api/chat/{session_id}
  GET  /api/pipeline/{session_id}
  GET  /api/pipeline/{session_id}/status
  GET  /api/pipeline/{session_id}/logs
  GET  /api/session/{session_id}/profile
"""

from unittest.mock import MagicMock, patch
from pathlib import Path
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Helpers for building fake sessions
# ---------------------------------------------------------------------------

def _make_session(uid: str | None = None, pipeline=None):
    """Return a minimal SessionState-like object."""
    from app.models.schema import DatasetProfile
    from app.services.session import SessionState

    profile = DatasetProfile(
        file_name="test.csv",
        row_count=3,
        column_count=2,
        columns=[],
    )
    return SessionState(
        session_id="test-session-id",
        file_name="test.csv",
        profile=profile,
        parquet_path=Path("/tmp/test.parquet"),
        uid=uid,
        pipeline=pipeline,
        created_at=datetime.utcnow(),
    )



# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

OWNED_UID = "user-abc"
OTHER_UID = "user-xyz"
SESSION_ID = "test-session-id"


@pytest.fixture()
def owned_session():
    """A session owned by OWNED_UID."""
    return _make_session(uid=OWNED_UID)


@pytest.fixture()
def anonymous_session():
    """A session with uid=None (never claimed)."""
    return _make_session(uid=None)


def _make_client(session_obj):
    """Build a TestClient with session_store.get patched to return session_obj."""
    # Patch session_store.get used by require_session_access (imported lazily
    # inside auth.py to avoid circular imports).
    with patch("app.services.session.session_store") as mock_store:
        mock_store.get.return_value = session_obj
        # Import app *after* patching so the routers pick up the mock.
        from app.main import app
        client = TestClient(app, raise_server_exceptions=False)
        yield client, mock_store


# ---------------------------------------------------------------------------
# Shared helper
# ---------------------------------------------------------------------------

def _valid_bearer(uid: str) -> dict:
    """Return Authorization header for a uid, with firebase_admin mocked."""
    return {"Authorization": f"Bearer token-for-{uid}"}


def _firebase_decode(uid: str):
    """Return a side_effect for firebase_admin.auth.verify_id_token."""
    def _decode(token):
        if token == f"token-for-{uid}":
            return {"uid": uid}
        raise Exception("bad token")
    return _decode


# ---------------------------------------------------------------------------
# Tests: GET /api/pipeline/{session_id}
# ---------------------------------------------------------------------------

class TestGetPipelineAuth:
    """Confirm ownership enforcement on GET /api/pipeline/{session_id}."""

    def _get(self, client, session_id=SESSION_ID, headers=None):
        return client.get(f"/api/pipeline/{session_id}", headers=headers or {})

    def test_no_token_on_owned_session_returns_404(self, owned_session):
        """Unauthenticated caller must get 404 — not 403 — for an owned session."""
        with patch("app.services.session.session_store") as mock_store, \
             patch("firebase_admin.auth.verify_id_token", side_effect=Exception("no token")):
            mock_store.get.return_value = owned_session
            from app.main import app
            client = TestClient(app, raise_server_exceptions=False)
            resp = self._get(client)
        assert resp.status_code == 404

    def test_wrong_uid_on_owned_session_returns_404(self, owned_session):
        """A valid token for a *different* uid must also get 404."""
        with patch("app.services.session.session_store") as mock_store, \
             patch("firebase_admin.auth.verify_id_token",
                   side_effect=_firebase_decode(OTHER_UID)):
            mock_store.get.return_value = owned_session
            from app.main import app
            client = TestClient(app, raise_server_exceptions=False)
            resp = self._get(client, headers=_valid_bearer(OTHER_UID))
        assert resp.status_code == 404

    def test_correct_uid_on_owned_session_returns_200(self, owned_session):
        """The owning uid must be able to access their own session."""
        with patch("app.services.session.session_store") as mock_store, \
             patch("firebase_admin.auth.verify_id_token",
                   side_effect=_firebase_decode(OWNED_UID)):
            mock_store.get.return_value = owned_session
            from app.main import app
            client = TestClient(app, raise_server_exceptions=False)
            resp = self._get(client, headers=_valid_bearer(OWNED_UID))
        # pipeline is None → FastAPI serialises as null → 200 OK
        assert resp.status_code == 200

    def test_anonymous_session_accessible_without_token(self, anonymous_session):
        """Anonymous sessions (uid=None) must be accessible to any caller."""
        with patch("app.services.session.session_store") as mock_store, \
             patch("firebase_admin.auth.verify_id_token", side_effect=Exception("no token")):
            mock_store.get.return_value = anonymous_session
            from app.main import app
            client = TestClient(app, raise_server_exceptions=False)
            resp = self._get(client)
        assert resp.status_code == 200

    def test_missing_session_returns_404(self):
        """A session that does not exist must return 404."""
        with patch("app.services.session.session_store") as mock_store, \
             patch("firebase_admin.auth.verify_id_token", side_effect=_firebase_decode(OWNED_UID)):
            mock_store.get.return_value = None
            from app.main import app
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(f"/api/pipeline/nonexistent-id",
                              headers=_valid_bearer(OWNED_UID))
        assert resp.status_code == 404

    def test_404_detail_does_not_reveal_ownership(self, owned_session):
        """The 404 response body for wrong-uid must be the same as for missing session."""
        with patch("app.services.session.session_store") as mock_store, \
             patch("firebase_admin.auth.verify_id_token",
                   side_effect=_firebase_decode(OTHER_UID)):
            mock_store.get.return_value = owned_session
            from app.main import app
            client = TestClient(app, raise_server_exceptions=False)
            wrong_uid_resp = self._get(client, headers=_valid_bearer(OTHER_UID))

        with patch("app.services.session.session_store") as mock_store2, \
             patch("firebase_admin.auth.verify_id_token",
                   side_effect=_firebase_decode(OWNED_UID)):
            mock_store2.get.return_value = None
            client2 = TestClient(app, raise_server_exceptions=False)
            missing_resp = self._get(client2, headers=_valid_bearer(OWNED_UID))

        # Both should return 404 with the same detail text.
        assert wrong_uid_resp.status_code == 404
        assert missing_resp.status_code == 404
        assert wrong_uid_resp.json()["detail"] == missing_resp.json()["detail"]


# ---------------------------------------------------------------------------
# Tests: GET /api/pipeline/{session_id}/status
# ---------------------------------------------------------------------------

class TestGetStatusAuth:

    def test_no_token_owned_session_404(self, owned_session):
        with patch("app.services.session.session_store") as mock_store, \
             patch("firebase_admin.auth.verify_id_token", side_effect=Exception("no")):
            mock_store.get.return_value = owned_session
            from app.main import app
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(f"/api/pipeline/{SESSION_ID}/status")
        assert resp.status_code == 404

    def test_owner_gets_200(self, owned_session):
        with patch("app.services.session.session_store") as mock_store, \
             patch("firebase_admin.auth.verify_id_token",
                   side_effect=_firebase_decode(OWNED_UID)):
            mock_store.get.return_value = owned_session
            from app.main import app
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(f"/api/pipeline/{SESSION_ID}/status",
                              headers=_valid_bearer(OWNED_UID))
        assert resp.status_code == 200
        assert "status" in resp.json()


# ---------------------------------------------------------------------------
# Tests: GET /api/pipeline/{session_id}/logs
# ---------------------------------------------------------------------------

class TestGetLogsAuth:

    def test_wrong_uid_returns_404(self, owned_session):
        with patch("app.services.session.session_store") as mock_store, \
             patch("firebase_admin.auth.verify_id_token",
                   side_effect=_firebase_decode(OTHER_UID)):
            mock_store.get.return_value = owned_session
            from app.main import app
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(f"/api/pipeline/{SESSION_ID}/logs",
                              headers=_valid_bearer(OTHER_UID))
        assert resp.status_code == 404

    def test_owner_gets_200(self, owned_session):
        with patch("app.services.session.session_store") as mock_store, \
             patch("firebase_admin.auth.verify_id_token",
                   side_effect=_firebase_decode(OWNED_UID)):
            mock_store.get.return_value = owned_session
            from app.main import app
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(f"/api/pipeline/{SESSION_ID}/logs",
                              headers=_valid_bearer(OWNED_UID))
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Tests: GET /api/session/{session_id}/profile
# ---------------------------------------------------------------------------

class TestGetProfileAuth:

    def test_no_token_owned_session_404(self, owned_session):
        with patch("app.services.session.session_store") as mock_store, \
             patch("firebase_admin.auth.verify_id_token", side_effect=Exception("no")):
            mock_store.get.return_value = owned_session
            from app.main import app
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(f"/api/session/{SESSION_ID}/profile")
        assert resp.status_code == 404

    def test_anonymous_session_accessible(self, anonymous_session):
        with patch("app.services.session.session_store") as mock_store, \
             patch("firebase_admin.auth.verify_id_token", side_effect=Exception("no")):
            mock_store.get.return_value = anonymous_session
            from app.main import app
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(f"/api/session/{SESSION_ID}/profile")
        assert resp.status_code == 200

    def test_owner_gets_200(self, owned_session):
        with patch("app.services.session.session_store") as mock_store, \
             patch("firebase_admin.auth.verify_id_token",
                   side_effect=_firebase_decode(OWNED_UID)):
            mock_store.get.return_value = owned_session
            from app.main import app
            client = TestClient(app, raise_server_exceptions=False)
            resp = client.get(f"/api/session/{SESSION_ID}/profile",
                              headers=_valid_bearer(OWNED_UID))
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Tests: require_session_access unit tests (no HTTP layer)
# ---------------------------------------------------------------------------

class TestRequireSessionAccessUnit:
    """Unit-test require_session_access() directly."""

    def test_missing_session_raises_404(self):
        with patch("app.services.session.session_store") as mock_store:
            mock_store.get.return_value = None
            from app.middleware.auth import require_session_access
            from fastapi import HTTPException
            with pytest.raises(HTTPException) as exc_info:
                require_session_access("bad-id", uid=None)
        assert exc_info.value.status_code == 404

    def test_wrong_uid_raises_404(self, owned_session):
        with patch("app.services.session.session_store") as mock_store:
            mock_store.get.return_value = owned_session
            from app.middleware.auth import require_session_access
            from fastapi import HTTPException
            with pytest.raises(HTTPException) as exc_info:
                require_session_access(SESSION_ID, uid=OTHER_UID)
        assert exc_info.value.status_code == 404

    def test_correct_uid_returns_session(self, owned_session):
        with patch("app.services.session.session_store") as mock_store:
            mock_store.get.return_value = owned_session
            from app.middleware.auth import require_session_access
            result = require_session_access(SESSION_ID, uid=OWNED_UID)
        assert result is owned_session

    def test_none_uid_on_anonymous_session_allowed(self, anonymous_session):
        with patch("app.services.session.session_store") as mock_store:
            mock_store.get.return_value = anonymous_session
            from app.middleware.auth import require_session_access
            result = require_session_access(SESSION_ID, uid=None)
        assert result is anonymous_session

    def test_any_uid_on_anonymous_session_allowed(self, anonymous_session):
        """Any authenticated caller may access an unclaimed session."""
        with patch("app.services.session.session_store") as mock_store:
            mock_store.get.return_value = anonymous_session
            from app.middleware.auth import require_session_access
            result = require_session_access(SESSION_ID, uid=OTHER_UID)
        assert result is anonymous_session
