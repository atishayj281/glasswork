"""Tests for Stripe billing endpoint and webhook handler."""
import json
import time
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
import pytest

from app.billing.tiers import TierName
from app.main import app
from app.middleware.auth import get_current_user
from app.models.user import UserSubscription
from app.services.user_store import user_store


# ---------------------------------------------------------------------------
# Tier config sanity checks
# ---------------------------------------------------------------------------

def test_tier_config_limits_are_correct():
    from app.billing.tiers import TIERS
    explorer = TIERS[TierName.EXPLORER]
    analyst = TIERS[TierName.ANALYST]
    studio = TIERS[TierName.STUDIO]

    assert explorer.max_uploads_per_month == 10
    assert explorer.max_file_size_mb == 10
    assert explorer.max_pipeline_runs_per_month == 20
    assert explorer.max_pipeline_generations_per_month == 10
    assert explorer.max_daily_tokens == 50_000
    assert explorer.max_daily_llm_calls == 20
    assert explorer.max_saved_pipelines == 0
    assert explorer.session_retention_days == 1
    assert explorer.export_formats == ["csv"]
    assert explorer.allowed_llm_providers == ["default"]

    assert analyst.max_uploads_per_month == 200
    assert analyst.max_file_size_mb == 50
    assert analyst.max_pipeline_runs_per_month is None  # unlimited
    assert analyst.max_pipeline_generations_per_month == 200
    assert analyst.max_daily_tokens == 500_000
    assert analyst.max_daily_llm_calls == 200
    assert analyst.max_saved_pipelines == 20
    assert analyst.session_retention_days == 7

    assert studio.max_uploads_per_month is None  # unlimited
    assert studio.max_pipeline_generations_per_month is None  # unlimited
    assert studio.max_daily_tokens == 2_000_000
    assert studio.max_saved_pipelines is None  # unlimited
    assert studio.session_retention_days == 30
    assert studio.priority_queue is True


# ---------------------------------------------------------------------------
# /api/billing/me
# ---------------------------------------------------------------------------

def test_billing_me_returns_correct_tier():
    from tests.test_auth import _firebase_decode, _valid_bearer

    uid = "billing-me-test-user"
    user_store.save_subscription(UserSubscription(uid=uid, tier=TierName.ANALYST))

    client = TestClient(app, raise_server_exceptions=False)
    with patch("firebase_admin.auth.verify_id_token", side_effect=_firebase_decode(uid)):
        resp = client.get("/api/billing/me", headers=_valid_bearer(uid))

    assert resp.status_code == 200
    data = resp.json()
    assert data["tier"] == "analyst"
    assert data["tier_label"] == "Analyst"
    assert data["limits"]["max_uploads_per_month"] == 200
    assert data["limits"]["max_saved_pipelines"] == 20
    assert data["limits"]["max_daily_tokens"] == 500_000
    assert "uploads" in data["usage_this_period"]


# ---------------------------------------------------------------------------
# Webhook signature verification
# ---------------------------------------------------------------------------

def test_webhook_valid_signature_is_accepted():
    """A correctly-signed webhook payload should be processed (status 200)."""
    webhook_secret = "whsec_test_secret_abc123"

    uid = "stripe-webhook-valid-user"
    payload_data = {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "metadata": {"uid": uid, "tier": "analyst"},
                "customer": "cus_test123",
                "subscription": "sub_test123",
            }
        },
    }
    payload = json.dumps(payload_data).encode("utf-8")
    ts = int(time.time())
    sig = f"t={ts},v1=fakesig"

    # Mock stripe.Webhook.construct_event to bypass signature verification
    mock_event = {
        "type": payload_data["type"],
        "data": payload_data["data"],
    }
    with patch("stripe.Webhook.construct_event", return_value=mock_event), \
         patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": webhook_secret}):
        client = TestClient(app)
        resp = client.post(
            "/api/billing/webhook",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Stripe-Signature": sig,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"


def test_webhook_tampered_signature_rejected():
    """A tampered Stripe signature must be rejected with HTTP 400."""
    webhook_secret = "whsec_test_secret_abc123"

    payload_data = {
        "type": "customer.subscription.deleted",
        "data": {"object": {"customer": "cus_tampered"}},
    }
    payload = json.dumps(payload_data).encode("utf-8")
    tampered_sig = "t=12345,v1=deadbeefdeadbeefdeadbeefdeadbeef"

    import stripe as _stripe
    with patch("stripe.Webhook.construct_event",
               side_effect=_stripe.error.SignatureVerificationError("bad sig", "sig_header")), \
         patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": webhook_secret}):
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.post(
            "/api/billing/webhook",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Stripe-Signature": tampered_sig,
            },
        )
        assert resp.status_code == 400
        assert "signature" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Subscription downgrade on cancellation
# ---------------------------------------------------------------------------

def test_subscription_deleted_downgrades_to_explorer():
    """customer.subscription.deleted webhook must downgrade user to Explorer."""
    uid = "downgrade-test-user"
    customer_id = "cus_downgrade_test"

    sub = UserSubscription(
        uid=uid,
        tier=TierName.ANALYST,
        stripe_customer_id=customer_id,
        stripe_subscription_id="sub_test_downgrade",
        stripe_status="active",
    )
    user_store.save_subscription(sub)

    payload_data = {
        "type": "customer.subscription.deleted",
        "data": {
            "object": {
                "customer": customer_id,
                "id": "sub_test_downgrade",
                "status": "canceled",
            }
        },
    }
    payload = json.dumps(payload_data).encode("utf-8")
    mock_event = payload_data

    with patch("stripe.Webhook.construct_event", return_value=mock_event), \
         patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": "whsec_test"}):
        client = TestClient(app)
        resp = client.post(
            "/api/billing/webhook",
            content=payload,
            headers={
                "Content-Type": "application/json",
                "Stripe-Signature": "t=0,v1=ignored",
            },
        )
        assert resp.status_code == 200

    # Verify the user is now on Explorer tier
    updated_sub = user_store.get_subscription(uid)
    assert updated_sub.tier == TierName.EXPLORER
    assert updated_sub.stripe_status == "canceled"


def test_payment_failed_marks_past_due():
    """invoice.payment_failed webhook must set stripe_status to past_due."""
    uid = "pastdue-test-user"
    customer_id = "cus_pastdue_test"

    sub = UserSubscription(
        uid=uid,
        tier=TierName.STUDIO,
        stripe_customer_id=customer_id,
        stripe_status="active",
    )
    user_store.save_subscription(sub)

    payload_data = {
        "type": "invoice.payment_failed",
        "data": {
            "object": {
                "customer": customer_id,
                "subscription": "sub_pastdue",
            }
        },
    }
    payload = json.dumps(payload_data).encode("utf-8")
    mock_event = payload_data

    with patch("stripe.Webhook.construct_event", return_value=mock_event), \
         patch.dict("os.environ", {"STRIPE_WEBHOOK_SECRET": "whsec_test"}):
        client = TestClient(app)
        resp = client.post(
            "/api/billing/webhook",
            content=payload,
            headers={"Content-Type": "application/json", "Stripe-Signature": "t=0,v1=ignored"},
        )
        assert resp.status_code == 200

    updated_sub = user_store.get_subscription(uid)
    assert updated_sub.stripe_status == "past_due"
    # Tier should NOT change on payment failure — only on deletion
    assert updated_sub.tier == TierName.STUDIO
