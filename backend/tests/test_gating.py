"""Tests for tier-based gating middleware."""
import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient

from app.billing.tiers import TierName
from app.middleware.auth import get_current_user_optional
from app.middleware.gating import LimitExceededException, require_tier_limit, check_provider_access
from app.models.user import UserSubscription
from app.services.user_store import user_store


def create_gating_test_app():
    """Minimal FastAPI app that exercises each gating dependency."""
    test_app = FastAPI()

    @test_app.get("/test/upload")
    async def upload_endpoint(tier=Depends(require_tier_limit("uploads"))):
        return {"ok": True, "tier": tier.name.value}

    @test_app.get("/test/run")
    async def run_endpoint(tier=Depends(require_tier_limit("pipeline_runs"))):
        return {"ok": True, "tier": tier.name.value}

    @test_app.get("/test/generate")
    async def generate_endpoint(tier=Depends(require_tier_limit("pipeline_generations"))):
        return {"ok": True, "tier": tier.name.value}

    @test_app.get("/test/save")
    async def save_endpoint(tier=Depends(require_tier_limit("saved_pipelines"))):
        return {"ok": True, "tier": tier.name.value}

    return test_app


def make_client_for_uid(uid: str) -> TestClient:
    """Build a TestClient whose dependency_overrides inject `uid` as current user."""
    test_app = create_gating_test_app()

    async def override_current_user():
        return uid

    test_app.dependency_overrides[get_current_user_optional] = override_current_user
    return TestClient(test_app, raise_server_exceptions=False)


def test_upload_limit_enforcement():
    test_uid = "user_gating_test_upload"
    sub = UserSubscription(uid=test_uid, tier=TierName.EXPLORER)
    user_store.save_subscription(sub)
    # Clear any prior usage for this uid
    user_store._local_usage_events = [ev for ev in user_store._local_usage_events if ev.uid != test_uid]

    client = make_client_for_uid(test_uid)

    # Explorer allows 10 uploads/month. Simulate 10 prior events then check the 11th.
    for _ in range(10):
        user_store.record_usage(test_uid, "uploads")

    # 11th request should breach limit -> 402
    res = client.get("/test/upload")
    assert res.status_code == 402, res.text
    data = res.json()
    assert data["detail"]["error"] == "limit_exceeded"
    assert data["detail"]["tier"] == "explorer"
    assert data["detail"]["limit"] == "uploads"
    assert data["detail"]["upgrade_url"] == "/pricing"



def test_saved_pipelines_gating_explorer():
    test_uid = "user_explorer_saved"
    sub = UserSubscription(uid=test_uid, tier=TierName.EXPLORER)
    user_store.save_subscription(sub)

    client = make_client_for_uid(test_uid)
    res = client.get("/test/save")
    assert res.status_code == 402, res.text
    data = res.json()
    assert data["detail"]["limit"] == "saved_pipelines"


def test_saved_pipelines_allowed_analyst():
    test_uid = "user_analyst_saved"
    sub = UserSubscription(uid=test_uid, tier=TierName.ANALYST)
    user_store.save_subscription(sub)

    client = make_client_for_uid(test_uid)
    res = client.get("/test/save")
    assert res.status_code == 200, res.text


def test_provider_access_gating():
    explorer_uid = "explorer_provider_user"
    analyst_uid = "analyst_provider_user"

    user_store.save_subscription(UserSubscription(uid=explorer_uid, tier=TierName.EXPLORER))
    user_store.save_subscription(UserSubscription(uid=analyst_uid, tier=TierName.ANALYST))

    # Explorer can use default model
    check_provider_access(explorer_uid, "default")

    # Explorer cannot use custom openai/anthropic/ollama model
    with pytest.raises(LimitExceededException) as exc_info:
        check_provider_access(explorer_uid, "openai/gpt-4o")
    assert exc_info.value.status_code == 402

    # Analyst can use custom models
    check_provider_access(analyst_uid, "openai/gpt-4o")
    check_provider_access(analyst_uid, "anthropic/claude-3-5-sonnet")


def test_unlimited_tier_never_blocks():
    """Studio tier has no upload limit — any number of requests should pass."""
    test_uid = "user_studio_unlimited"
    sub = UserSubscription(uid=test_uid, tier=TierName.STUDIO)
    user_store.save_subscription(sub)
    user_store._local_usage_events = [ev for ev in user_store._local_usage_events if ev.uid != test_uid]

    # Simulate 500 prior uploads (well beyond Explorer's limit of 10)
    for _ in range(500):
        user_store.record_usage(test_uid, "uploads")

    client = make_client_for_uid(test_uid)
    res = client.get("/test/upload")
    assert res.status_code == 200, res.text
    assert res.json()["tier"] == "studio"

