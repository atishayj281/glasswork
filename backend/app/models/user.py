from datetime import datetime, timezone
from pydantic import BaseModel, Field
from app.billing.tiers import TierName


class UserSubscription(BaseModel):
    uid: str
    tier: TierName = TierName.EXPLORER
    stripe_customer_id: str | None = None
    stripe_subscription_id: str | None = None
    stripe_status: str | None = None  # active, trialing, past_due, canceled
    current_period_end: datetime | None = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UsageEvent(BaseModel):
    event_id: str
    uid: str
    metric: str  # "uploads" | "pipeline_runs" | "pipeline_generations"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
