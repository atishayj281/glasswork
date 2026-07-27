import logging
from typing import Callable

from fastapi import Depends, HTTPException, status

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
