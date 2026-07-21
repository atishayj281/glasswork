import pytest
import pandas as pd
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import uuid

from app.main import app
from app.services.ingest import sanitize_formulas
from app.middleware.rate_limit import limiter
from app.services.session import session_store
from tests.test_auth import _make_session, _firebase_decode, _valid_bearer


def test_formula_injection_sanitization_helper():
    df = pd.DataFrame({
        "formulas": ["=SUM(A1)", "+10", "-5", "@dangerous", "normal", "   =with_spaces"],
        "numbers": [10, -5, 3.14, None, 0, 1],
        "mixed": [True, False, None, "plain", "=formula", "+plus"]
    })
    
    sanitized = sanitize_formulas(df.copy())
    
    # Check that dangerous formulas are prefixed with single quote
    assert sanitized["formulas"].iloc[0] == "'=SUM(A1)"
    assert sanitized["formulas"].iloc[1] == "'+10"
    assert sanitized["formulas"].iloc[2] == "'-5"
    assert sanitized["formulas"].iloc[3] == "'@dangerous"
    assert sanitized["formulas"].iloc[4] == "normal"
    assert sanitized["formulas"].iloc[5] == "'   =with_spaces"
    
    # Check that numbers are NOT converted or modified (should remain integer/float/None)
    assert sanitized["numbers"].iloc[0] == 10
    assert sanitized["numbers"].iloc[1] == -5
    assert sanitized["numbers"].iloc[2] == 3.14
    
    # Check mixed values
    assert sanitized["mixed"].iloc[0] is True
    assert sanitized["mixed"].iloc[4] == "'=formula"
    assert sanitized["mixed"].iloc[5] == "'+plus"


def test_rate_limiter_chat_endpoint():
    session = _make_session(uid="rate-limit-uid")
    
    with patch.dict("os.environ", {"LLM_RATE_LIMIT_PER_MINUTE": "2"}), \
         patch("app.services.session.session_store.get", return_value=session), \
         patch("firebase_admin.auth.verify_id_token", side_effect=_firebase_decode("rate-limit-uid")):
        
        with limiter._lock:
            limiter._buckets.pop("rate-limit-uid", None)
            
        client = TestClient(app, raise_server_exceptions=False)
        headers = _valid_bearer("rate-limit-uid")
        
        async def dummy_generator(*args, **kwargs):
            yield "data: {}\n\n"

        with patch("app.services.agent.chat_stream", return_value=dummy_generator()):
            # Req 1: Allowed
            resp1 = client.post("/api/chat/test-session-id", json={"message": "hi"}, headers=headers)
            assert resp1.status_code == 200
            
            # Req 2: Allowed
            resp2 = client.post("/api/chat/test-session-id", json={"message": "hi"}, headers=headers)
            assert resp2.status_code == 200
            
            # Req 3: Blocked
            resp3 = client.post("/api/chat/test-session-id", json={"message": "hi"}, headers=headers)
            assert resp3.status_code == 429
            assert "Rate limit exceeded" in resp3.json()["detail"]


def test_rate_limiter_generate_endpoint():
    session = _make_session(uid="rate-limit-uid-gen")
    
    with patch.dict("os.environ", {"LLM_RATE_LIMIT_PER_MINUTE": "1"}), \
         patch("app.services.session.session_store.get", return_value=session), \
         patch("firebase_admin.auth.verify_id_token", side_effect=_firebase_decode("rate-limit-uid-gen")):
        
        with limiter._lock:
            limiter._buckets.pop("rate-limit-uid-gen", None)
            
        client = TestClient(app, raise_server_exceptions=False)
        headers = _valid_bearer("rate-limit-uid-gen")
        
        with patch("app.api.pipeline.generate_pipeline") as mock_gen:
            from app.models.pipeline import PipelinePlan
            mock_gen.return_value = PipelinePlan(name="Plan", steps=[], edges=[])
            
            # Req 1: Allowed
            resp1 = client.post("/api/pipeline/test-session-id/generate", json={"intent": "do stuff"}, headers=headers)
            assert resp1.status_code == 200
            
            # Req 2: Blocked
            resp2 = client.post("/api/pipeline/test-session-id/generate", json={"intent": "do stuff"}, headers=headers)
            assert resp2.status_code == 429
            assert "Rate limit exceeded" in resp2.json()["detail"]


def test_rate_limiter_anonymous_sessions_independent():
    # Two separate anonymous sessions (uid=None)
    session1 = _make_session(uid=None)
    session2 = _make_session(uid=None)
    
    # Store them in cache so get_current_user_optional doesn't fail on require_session_access
    session_store._local_sessions["session-1"] = session1
    session_store._local_sessions["session-2"] = session2

    try:
        with patch.dict("os.environ", {"LLM_RATE_LIMIT_PER_MINUTE": "1"}):
            with limiter._lock:
                limiter._buckets.pop("session_session-1", None)
                limiter._buckets.pop("session_session-2", None)

            client = TestClient(app, raise_server_exceptions=False)
            
            async def dummy_generator(*args, **kwargs):
                yield "data: {}\n\n"

            with patch("app.services.agent.chat_stream", return_value=dummy_generator()):
                # Session 1: Req 1 should succeed
                resp1 = client.post("/api/chat/session-1", json={"message": "hi"})
                assert resp1.status_code == 200

                # Session 1: Req 2 should be blocked (limit is 1 per minute)
                resp2 = client.post("/api/chat/session-1", json={"message": "hi"})
                assert resp2.status_code == 429

                # Session 2: Req 1 should succeed (independent budget)
                resp3 = client.post("/api/chat/session-2", json={"message": "hi"})
                assert resp3.status_code == 200
    finally:
        session_store._local_sessions.pop("session-1", None)
        session_store._local_sessions.pop("session-2", None)


def test_claim_session_ownership_takeover_prevention():
    session = _make_session(uid="uid-A")
    
    with patch("app.services.session.session_store.get", return_value=session), \
         patch("app.services.session.session_store.save") as mock_save, \
         patch("firebase_admin.auth.verify_id_token", side_effect=_firebase_decode("uid-B")):
        
        client = TestClient(app, raise_server_exceptions=False)
        headers = _valid_bearer("uid-B")
        
        # uid-B attempts to claim the session owned by uid-A
        resp = client.post("/api/sessions/test-session-id/claim", headers=headers)
        
        # Must return 409 Conflict
        assert resp.status_code == 409
        assert "already claimed" in resp.json()["detail"]
        
        # Confirm that save was not called and session.uid remains uid-A
        assert session.uid == "uid-A"
        mock_save.assert_not_called()


def test_formula_injection_delayed_to_export():
    from app.services.ingest import ingest_file
    from app.services.executor import execute_pipeline
    from app.models.pipeline import PipelinePlan, PipelineStep
    
    # 1. Prepare dangerous CSV data
    csv_content = b"col1,col2\n-A102,10\n+911234567890,20\nnormal,30\n"
    
    # Ingest the file (this writes a parquet file locally)
    with patch("app.api.upload.get_supabase_client") as mock_sb:
        session_id, profile = ingest_file(
            content=csv_content,
            filename="data.csv",
            uid="user-test-san"
        )
    
    try:
        # Load ingested dataframe directly and verify values are UNMODIFIED
        df_ingested = session_store.load_dataframe(session_id)
        assert df_ingested is not None
        assert df_ingested["col1"].iloc[0] == "-A102"
        assert df_ingested["col1"].iloc[1] == "+911234567890"
        assert df_ingested["col1"].iloc[2] == "normal"
        
        # 2. Run a pipeline filter step using the raw unmodified value
        plan = PipelinePlan(
            name="Filter Raw Value",
            steps=[
                PipelineStep(
                    id="f1",
                    type="filter",
                    label="Filter -A102",
                    params={"column": "col1", "op": "eq", "value": "-A102"}
                )
            ],
            edges=[]
        )
        res = execute_pipeline(df_ingested, plan)
        # Should match exactly 1 row (the one with -A102)
        assert res.row_count == 1
        
        # 3. Request download and verify values are SANITIZED (prefixed)
        with patch("firebase_admin.auth.verify_id_token", side_effect=_firebase_decode("user-test-san")):
            client = TestClient(app, raise_server_exceptions=False)
            headers = _valid_bearer("user-test-san")
            
            resp = client.get(f"/api/session/{session_id}/download", headers=headers)
            assert resp.status_code == 200
            data = resp.json()
            
            # The exported data must have the single-quote prefix
            assert data[0]["col1"] == "'-A102"
            assert data[1]["col1"] == "'+911234567890"
            assert data[2]["col1"] == "normal"
            
    finally:
        # Clean up session
        session_store.delete(session_id)


def test_cors_origins_default_to_production_safe(monkeypatch):
    import sys
    import importlib
    import dotenv

    # Remove all app modules from sys.modules to force full reload (including config)
    for mod in list(sys.modules.keys()):
        if mod.startswith("app"):
            del sys.modules[mod]

    # Prevent load_dotenv from loading the local dev .env file
    monkeypatch.setattr(dotenv, "load_dotenv", lambda *a, **kw: None)

    # Set CORS_ORIGIN to a production URL and unset ENVIRONMENT
    monkeypatch.setenv("CORS_ORIGIN", "https://aegis.example.com")
    monkeypatch.delenv("ENVIRONMENT", raising=False)

    # Import a FRESH copy of app.main under a local alias. Do NOT reassign the
    # module-level `app` name imported at the top of this file — other tests
    # in this module (and pytest's collection order) rely on it continuing to
    # point at the original, unmutated FastAPI instance.
    fresh_main = importlib.import_module("app.main")

    # Inspect middleware on the freshly-reloaded FastAPI instance
    cors_mw = None
    for mw in fresh_main.app.user_middleware:
        if "CORSMiddleware" in str(mw.cls):
            cors_mw = mw
            break

    assert cors_mw is not None, "CORSMiddleware not found in app user_middleware"
    allow_origins = cors_mw.kwargs.get("allow_origins", [])

    # Localhost origins must NOT be present
    assert "http://localhost:5173" not in allow_origins
    assert "http://127.0.0.1:5173" not in allow_origins


def test_health_endpoint_degraded_and_cache():
    import app.main as app_main

    # Force reset the cache variables on the ALREADY-IMPORTED module (this
    # test does not force a reload, so app_main is the same module object
    # used by the top-level `app` import — no need to reassign anything).
    app_main._last_health_check_result = None
    app_main._last_health_check_time = 0.0

    # Mock Firestore and Supabase configs to be active
    # and mock Firestore doc get() to fail (raise Exception)
    with patch("app.services.session.session_store._get_firestore") as mock_get_fs, \
         patch.dict("os.environ", {"SUPABASE_URL": "http://fake", "SUPABASE_KEY": "fake"}), \
         patch("app.api.upload.get_supabase_client") as mock_get_sb:
        
        # Setup mock db raising exception on ping
        mock_db = MagicMock()
        mock_db.collection.return_value.document.return_value.get.side_effect = Exception("Firestore down")
        mock_get_fs.return_value = mock_db
        
        # Setup mock supabase
        mock_get_sb.return_value = MagicMock()
        
        client = TestClient(app_main.app, raise_server_exceptions=True)
        
        # First call: Should perform live call and return 503 degraded (because Firestore fails)
        resp1 = client.get("/health")
        assert resp1.status_code == 503
        data1 = resp1.json()
        assert data1["status"] == "degraded"
        assert "unhealthy" in data1["details"]["firestore"]
        assert mock_db.collection.assert_called_once
        
        # Second call within TTL: Should hit cache, NOT trigger Firestore get() again, and return 503
        mock_db.reset_mock()
        resp2 = client.get("/health")
        assert resp2.status_code == 503
        data2 = resp2.json()
        assert data2["status"] == "degraded"
        # Verify get() was not called again
        mock_db.collection.assert_not_called()


def test_health_endpoint_supabase_degraded():
    import app.main as app_main

    # Force reset cache
    app_main._last_health_check_result = None
    app_main._last_health_check_time = 0.0

    with patch("app.services.session.session_store._get_firestore") as mock_get_fs, \
         patch.dict("os.environ", {"SUPABASE_URL": "http://fake", "SUPABASE_KEY": "fake"}), \
         patch("app.api.upload.get_supabase_client") as mock_get_sb:
        
        # Firestore is healthy
        mock_db = MagicMock()
        mock_get_fs.return_value = mock_db
        
        # Supabase list_buckets fails
        mock_sb_client = MagicMock()
        mock_sb_client.storage.list_buckets.side_effect = Exception("Supabase storage down")
        mock_get_sb.return_value = mock_sb_client
        
        client = TestClient(app_main.app, raise_server_exceptions=True)
        
        resp = client.get("/health")
        assert resp.status_code == 503
        data = resp.json()
        assert data["status"] == "degraded"
        assert "unhealthy" in data["details"]["supabase"]


def test_session_id_correlation_in_logs(monkeypatch):
    import io
    import json
    import logging
    from app.logging_config import JSONFormatter
    
    # Force production mode for logging config to use JSONFormatter
    monkeypatch.setenv("ENVIRONMENT", "production")
    
    # Capture root logger logs
    log_capture = io.StringIO()
    handler = logging.StreamHandler(log_capture)
    handler.setFormatter(JSONFormatter())
    
    root_logger = logging.getLogger()
    # Temporarily add our test handler
    old_handlers = list(root_logger.handlers)
    for h in old_handlers:
        root_logger.removeHandler(h)
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.INFO)
    
    try:
        # Mock session get so it doesn't fail require_session_access completely
        session = _make_session(uid=None)
        session.session_id = "test-corr-session-999-uuid-like-size-36"
        
        with patch("app.services.session.session_store.get", return_value=session):
            client = TestClient(app, raise_server_exceptions=False)
            # Hit get_pipeline endpoint which has an INFO-level log statement
            resp = client.get("/api/pipeline/test-corr-session-999-uuid-like-size-36")
            assert resp.status_code == 200
            
        # Get logs
        log_output = log_capture.getvalue()
        lines = [line for line in log_output.strip().split("\n") if line]
        
        assert len(lines) > 0, "No logs were captured"
        
        # Parse logs as JSON and check session_id
        session_id_found = False
        for line in lines:
            try:
                log_data = json.loads(line)
                print("### Session ID ####")
                print(log_data.get("session_id"))
                if log_data.get("session_id") == "test-corr-session-999-uuid-like-size-36":
                    session_id_found = True
                    break
            except json.JSONDecodeError:
                continue
                
        assert session_id_found, f"session_id was not correlated in JSON logs: {log_output}"
        
    finally:
        # Restore old handlers
        root_logger.removeHandler(handler)
        for h in old_handlers:
            root_logger.addHandler(h)


def test_sentry_init_no_dsn_no_crash(monkeypatch):
    import sys
    import importlib

    # Remove app modules from sys.modules to force full reload
    for mod in list(sys.modules.keys()):
        if mod.startswith("app"):
            del sys.modules[mod]

    # Unset SENTRY_DSN env var
    monkeypatch.delenv("SENTRY_DSN", raising=False)

    # Importing app.main should NOT crash. Use a local alias — do not
    # reassign the module-level `app` name used by other tests in this file.
    fresh_main = importlib.import_module("app.main")
    assert fresh_main.app is not None