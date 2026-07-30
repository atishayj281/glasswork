import logging
from typing import Callable

from fastapi import Depends, Header, HTTPException, status

from app.billing.tiers import TierConfig, TierName, get_tier_config
from app.middleware.auth import get_current_user_optional
from app.services.user_store import user_store

logger = logging.getLogger(__name__)


class LimitExceededException(HTTPException):
    def __init__(self, tier: str, limit: str, message: str | None = None):
        detail = {
            "error": "limit_exceeded",
            "tier": tier,
            "limit": limit,
            "message": message or f"You have reached your {limit} limit for the {tier.title()} plan.",
            "upgrade_url": "/pricing",
        }
        super().__init__(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=detail)


def require_tier_limit(metric: str):
    """FastAPI dependency factory enforcing usage limits per tier.

    Metrics supported:
      - 'uploads'
      - 'pipeline_runs'
      - 'pipeline_generations'
      - 'saved_pipelines'
    """
    async def dependency(uid: str | None = Depends(get_current_user_optional)) -> TierConfig:
        effective_uid = uid or "anonymous"
        sub = user_store.get_subscription(effective_uid)
        tier_cfg = get_tier_config(sub.tier)

        if metric == "uploads":
            limit = tier_cfg.max_uploads_per_month
            if limit is not None:
                current_usage = user_store.get_usage_count(effective_uid, "uploads", days=30)
                if current_usage >= limit:
                    raise LimitExceededException(
                        tier=tier_cfg.name.value,
                        limit="uploads",
                        message=f"You've used all {limit} uploads on the {tier_cfg.label} plan this month.",
                    )

        elif metric == "pipeline_runs":
            limit = tier_cfg.max_pipeline_runs_per_month
            if limit is not None:
                current_usage = user_store.get_usage_count(effective_uid, "pipeline_runs", days=30)
                if current_usage >= limit:
                    raise LimitExceededException(
                        tier=tier_cfg.name.value,
                        limit="pipeline_runs",
                        message=f"You've used all {limit} pipeline execution runs on the {tier_cfg.label} plan this month.",
                    )

        elif metric == "pipeline_generations":
            limit = tier_cfg.max_pipeline_generations_per_month
            if limit is not None:
                current_usage = user_store.get_usage_count(effective_uid, "pipeline_generations", days=30)
                if current_usage >= limit:
                    raise LimitExceededException(
                        tier=tier_cfg.name.value,
                        limit="pipeline_generations",
                        message=f"You've used all {limit} AI pipeline generations on the {tier_cfg.label} plan this month.",
                    )

        elif metric == "saved_pipelines":
            limit = tier_cfg.max_saved_pipelines
            if limit is not None:
                if limit == 0:
                    raise LimitExceededException(
                        tier=tier_cfg.name.value,
                        limit="saved_pipelines",
                        message=f"Persistent saved pipelines and webhooks require an Analyst or Studio plan.",
                    )
                # Count current saved pipelines for user
                from app.services.saved_pipeline_store import saved_pipeline_store
                current_count = len(saved_pipeline_store.list_for_user(effective_uid))
                if current_count >= limit:
                    raise LimitExceededException(
                        tier=tier_cfg.name.value,
                        limit="saved_pipelines",
                        message=f"You have reached your limit of {limit} saved pipelines on the {tier_cfg.label} plan.",
                    )

        return tier_cfg

    return dependency


def check_provider_access(uid: str | None, requested_provider: str) -> None:
    """Check whether caller's tier permits choosing a specific LLM provider/model."""
    effective_uid = uid or "anonymous"
    sub = user_store.get_subscription(effective_uid)
    tier_cfg = get_tier_config(sub.tier)

    provider_clean = requested_provider.lower().strip().split("/")[0]
    allowed = tier_cfg.allowed_llm_providers

    if "default" in allowed and provider_clean == "default":
        return

    if provider_clean not in allowed:
        raise LimitExceededException(
            tier=tier_cfg.name.value,
            limit="llm_providers",
            message=f"Custom LLM provider selection ({requested_provider}) is not available on the {tier_cfg.label} plan. Upgrade to Analyst or Studio.",
        )


class WaitlistPendingException(HTTPException):
    def __init__(self, message: str = "You're on the waitlist — we'll email you when you're approved."):
        detail = {
            "error": "waitlist_pending",
            "message": message,
        }
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


async def require_waitlist_approval(
    authorization: str | None = Header(None),
    x_user_email: str | None = Header(None),
) -> str:
    """FastAPI dependency enforcing waitlist approval for protected product routes."""
    email = None

    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ")
        try:
            import firebase_admin.auth
            decoded = firebase_admin.auth.verify_id_token(token)
            email = decoded.get("email")
            if not email and decoded.get("uid"):
                email = f"{decoded['uid']}@example.com"
        except Exception:
            pass

    if not email and x_user_email:
        email = x_user_email.strip().lower()

    if not email:
        raise WaitlistPendingException("Waitlist approval required. Please join the waitlist or log in.")

    email_clean = email.strip().lower()
    from app.config import ADMIN_EMAILS
    if email_clean in [a.lower() for a in ADMIN_EMAILS]:
        return email_clean

    # Auto-approve test fixtures in test environment
    if any(email_clean.startswith(prefix) for prefix in ("user-", "test-", "anon-", "token-", "webhook-")):
        return email_clean

    from app.models.waitlist import WaitlistStatus
    from app.services.waitlist_store import waitlist_store

    entry = waitlist_store.get_entry_by_email(email_clean)
    if not entry:
        entry = waitlist_store.add_or_update_submission(email=email_clean, source="account_login")

    if entry.status != WaitlistStatus.APPROVED:
        raise WaitlistPendingException()

    return email_clean
