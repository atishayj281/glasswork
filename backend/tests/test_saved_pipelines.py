from unittest.mock import patch
from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.models.pipeline import PipelinePlan, PipelineStep
from app.services.saved_pipeline_store import saved_pipeline_store
from app.services.session import session_store
from tests.test_auth import _firebase_decode, _make_session, _valid_bearer


def test_promote_list_rotate_delete_saved_pipeline_flow():
    client = TestClient(app, raise_server_exceptions=False)

    user1_uid = "user-1-uid"
    user2_uid = "user-2-uid"

    # Create session for user1 with a pipeline
    session1 = _make_session(uid=user1_uid)
    session1.session_id = "session-user1"
    session1.pipeline = PipelinePlan(
        name="Sales Processing Pipeline",
        steps=[
            PipelineStep(
                id="step1",
                type="filter",
                label="Filter Step",
                params={"column": "amount", "op": "gt", "value": 100},
            )
        ],
        edges=[],
    )
    session_store._local_sessions[session1.session_id] = session1

    try:
        with patch(
            "firebase_admin.auth.verify_id_token",
            side_effect=_firebase_decode(user1_uid),
        ):
            headers1 = _valid_bearer(user1_uid)

            # 1. Promote pipeline
            resp_save = client.post(
                "/api/pipelines/saved",
                json={"session_id": session1.session_id, "name": "Saved Sales Pipeline"},
                headers=headers1,
            )
            assert resp_save.status_code == 201
            save_data = resp_save.json()
            assert save_data["name"] == "Saved Sales Pipeline"
            assert "webhook_secret" in save_data
            raw_secret = save_data["webhook_secret"]
            assert len(raw_secret) > 0
            pipeline_id = save_data["pipeline_id"]

            # 2. List saved pipelines as user1
            resp_list = client.get("/api/pipelines/saved", headers=headers1)
            assert resp_list.status_code == 200
            list_data = resp_list.json()
            assert len(list_data) == 1
            item = list_data[0]
            assert item["pipeline_id"] == pipeline_id
            assert item["name"] == "Saved Sales Pipeline"
            # Verify secret is NEVER in list response
            assert "webhook_secret" not in item
            assert "secret_hash" not in item

        # 3. User2 attempts to access user1's saved pipeline (IDOR prevention)
        with patch(
            "firebase_admin.auth.verify_id_token",
            side_effect=_firebase_decode(user2_uid),
        ):
            headers2 = _valid_bearer(user2_uid)

            # List user2's pipelines -> empty
            resp_user2_list = client.get("/api/pipelines/saved", headers=headers2)
            assert resp_user2_list.status_code == 200
            assert len(resp_user2_list.json()) == 0

            # User2 tries to rotate secret of user1's pipeline -> 404
            resp_user2_rotate = client.post(
                f"/api/pipelines/saved/{pipeline_id}/rotate-secret",
                headers=headers2,
            )
            assert resp_user2_rotate.status_code == 404

            # User2 tries to delete user1's pipeline -> 404
            resp_user2_del = client.delete(
                f"/api/pipelines/saved/{pipeline_id}",
                headers=headers2,
            )
            assert resp_user2_del.status_code == 404

        # 4. User1 rotates secret
        with patch(
            "firebase_admin.auth.verify_id_token",
            side_effect=_firebase_decode(user1_uid),
        ):
            resp_rotate = client.post(
                f"/api/pipelines/saved/{pipeline_id}/rotate-secret",
                headers=headers1,
            )
            assert resp_rotate.status_code == 200
            rotate_data = resp_rotate.json()
            assert rotate_data["pipeline_id"] == pipeline_id
            new_secret = rotate_data["webhook_secret"]
            assert new_secret != raw_secret

            # 5. User1 deletes pipeline
            resp_delete = client.delete(
                f"/api/pipelines/saved/{pipeline_id}",
                headers=headers1,
            )
            assert resp_delete.status_code == 200
            assert resp_delete.json()["status"] == "deleted"

            # List after delete -> empty
            resp_after_del = client.get("/api/pipelines/saved", headers=headers1)
            assert resp_after_del.status_code == 200
            assert len(resp_after_del.json()) == 0

    finally:
        session_store.delete(session1.session_id)
        saved_pipeline_store.delete(pipeline_id)


def test_promote_pipeline_no_pipeline_in_session():
    client = TestClient(app, raise_server_exceptions=False)
    uid = "user-empty-sess"

    session = _make_session(uid=uid)
    session.session_id = "session-empty"
    session.pipeline = None
    session_store._local_sessions[session.session_id] = session

    try:
        with patch(
            "firebase_admin.auth.verify_id_token",
            side_effect=_firebase_decode(uid),
        ):
            headers = _valid_bearer(uid)
            resp = client.post(
                "/api/pipelines/saved",
                json={"session_id": session.session_id},
                headers=headers,
            )
            assert resp.status_code == 400
            assert "no generated or edited pipeline" in resp.json()["detail"].lower()
    finally:
        session_store.delete(session.session_id)
