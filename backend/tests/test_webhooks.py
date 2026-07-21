import io
from unittest.mock import patch
from fastapi.testclient import TestClient
import pytest

from app.main import app
from app.middleware.rate_limit import limiter
from app.models.pipeline import PipelinePlan, PipelineStep
from app.services.saved_pipeline_store import saved_pipeline_store


def test_webhook_trigger_success_and_errors():
    client = TestClient(app, raise_server_exceptions=False)
    uid = "webhook-test-owner"

    # Create a saved pipeline in store
    plan = PipelinePlan(
        name="Filter Test Pipeline",
        steps=[
            PipelineStep(
                id="s1",
                type="filter",
                label="Filter Amount",
                params={"column": "amount", "op": "gt", "value": 50},
            )
        ],
        edges=[],
    )
    sp, raw_secret = saved_pipeline_store.create(uid=uid, name="Filter Pipeline", pipeline=plan)
    pipeline_id = sp.pipeline_id

    csv_data = b"amount,category\n100,electronics\n20,books\n150,furniture\n"

    try:
        # 1. Correct secret -> 200 with expected JSON shape
        resp_valid = client.post(
            f"/api/webhooks/{pipeline_id}/trigger",
            headers={"X-Webhook-Secret": raw_secret},
            files={"file": ("test.csv", io.BytesIO(csv_data), "text/csv")},
        )
        assert resp_valid.status_code == 200
        res_json = resp_valid.json()
        assert res_json["status"] == "success"
        assert res_json["pipeline_id"] == pipeline_id
        assert res_json["pipeline_name"] == "Filter Pipeline"
        assert res_json["row_count"] == 2  # 100 and 150
        assert "amount" in res_json["columns"]
        assert len(res_json["preview"]) == 2
        assert "execution_log" in res_json

        # Verify updated trigger stats on stored pipeline
        updated_sp = saved_pipeline_store.get(pipeline_id)
        assert updated_sp is not None
        assert updated_sp.trigger_count == 1
        assert updated_sp.last_triggered_at is not None

        # 2. Wrong secret -> 404 (indistinguishable from nonexistent pipeline)
        resp_wrong_secret = client.post(
            f"/api/webhooks/{pipeline_id}/trigger",
            headers={"X-Webhook-Secret": "invalid-secret-12345"},
            files={"file": ("test.csv", io.BytesIO(csv_data), "text/csv")},
        )
        assert resp_wrong_secret.status_code == 404
        assert resp_wrong_secret.json()["detail"] == "Pipeline not found"

        # Nonexistent pipeline_id with valid secret -> 404 identical detail
        resp_nonexistent = client.post(
            "/api/webhooks/non-existent-uuid/trigger",
            headers={"X-Webhook-Secret": raw_secret},
            files={"file": ("test.csv", io.BytesIO(csv_data), "text/csv")},
        )
        assert resp_nonexistent.status_code == 404
        assert resp_nonexistent.json()["detail"] == "Pipeline not found"

        # 3. Missing secret header -> 404
        resp_no_header = client.post(
            f"/api/webhooks/{pipeline_id}/trigger",
            files={"file": ("test.csv", io.BytesIO(csv_data), "text/csv")},
        )
        assert resp_no_header.status_code == 404
        assert resp_no_header.json()["detail"] == "Pipeline not found"

        # 4. Oversized file -> 413
        large_csv = b"amount,category\n" + (b"100,test\n" * 100000)
        with patch("app.api.webhooks.config.MAX_UPLOAD_MB", 0):  # limit to 0MB so test file triggers 413
            resp_oversized = client.post(
                f"/api/webhooks/{pipeline_id}/trigger",
                headers={"X-Webhook-Secret": raw_secret},
                files={"file": ("large.csv", io.BytesIO(large_csv), "text/csv")},
            )
            assert resp_oversized.status_code == 413
            assert "exceeds maximum allowed size" in resp_oversized.json()["detail"]

        # 5. Rate limit exceeded -> 429
        with patch.dict("os.environ", {"LLM_RATE_LIMIT_PER_MINUTE": "1"}):
            with limiter._lock:
                limiter._buckets.pop(f"webhook_{pipeline_id}", None)

            # Request 1 -> 200
            r1 = client.post(
                f"/api/webhooks/{pipeline_id}/trigger",
                headers={"X-Webhook-Secret": raw_secret},
                files={"file": ("test.csv", io.BytesIO(csv_data), "text/csv")},
            )
            assert r1.status_code == 200

            # Request 2 -> 429 Rate limit exceeded
            r2 = client.post(
                f"/api/webhooks/{pipeline_id}/trigger",
                headers={"X-Webhook-Secret": raw_secret},
                files={"file": ("test.csv", io.BytesIO(csv_data), "text/csv")},
            )
            assert r2.status_code == 429

        # 6. Deleting saved pipeline invalidates webhook (trigger after delete -> 404)
        saved_pipeline_store.delete(pipeline_id)
        resp_after_del = client.post(
            f"/api/webhooks/{pipeline_id}/trigger",
            headers={"X-Webhook-Secret": raw_secret},
            files={"file": ("test.csv", io.BytesIO(csv_data), "text/csv")},
        )
        assert resp_after_del.status_code == 404

    finally:
        saved_pipeline_store.delete(pipeline_id)
