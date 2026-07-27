from enum import Enum
import os
from dataclasses import field
from pydantic import BaseModel, Field


class TierName(str, Enum):
    EXPLORER = "explorer"
    ANALYST = "analyst"
    STUDIO = "studio"


class TierConfig(BaseModel):
    name: TierName
    label: str
    price_monthly: int  # in USD
    stripe_price_id_env_var: str
    max_uploads_per_month: int | None = None  # None = unlimited
    max_file_size_mb: int = 10
    max_pipeline_runs_per_month: int | None = None  # None = unlimited
    max_pipeline_generations_per_month: int | None = None  # None = unlimited
    max_daily_tokens: int = 50_000
    max_daily_llm_calls: int = 20
    session_retention_days: int = 1
    allowed_llm_providers: list[str] = Field(default_factory=lambda: ["default"])
    max_saved_pipelines: int | None = 0  # 0 for Explorer, 20 for Analyst, None for Studio
    max_seats: int = 1
    export_formats: list[str] = Field(default_factory=lambda: ["csv"])
    priority_queue: bool = False

    @property
    def stripe_price_id(self) -> str | None:
        if not self.stripe_price_id_env_var:
            return None
        return os.getenv(self.stripe_price_id_env_var, None)


TIERS: dict[TierName, TierConfig] = {
    TierName.EXPLORER: TierConfig(
        name=TierName.EXPLORER,
        label="Explorer",
        price_monthly=0,
        stripe_price_id_env_var="",
        max_uploads_per_month=10,
        max_file_size_mb=10,
        max_pipeline_runs_per_month=20,
        max_pipeline_generations_per_month=10,
        max_daily_tokens=50_000,
        max_daily_llm_calls=20,
        session_retention_days=1,
        allowed_llm_providers=["default"],
        max_saved_pipelines=0,  # no persistence for Explorer tier
        max_seats=1,
        export_formats=["csv"],
        priority_queue=False,
    ),
    TierName.ANALYST: TierConfig(
        name=TierName.ANALYST,
        label="Analyst",
        price_monthly=19,
        stripe_price_id_env_var="STRIPE_PRICE_ANALYST",
        max_uploads_per_month=200,
        max_file_size_mb=50,
        max_pipeline_runs_per_month=None,  # unlimited
        max_pipeline_generations_per_month=200,
        max_daily_tokens=500_000,
        max_daily_llm_calls=200,
        session_retention_days=7,
        allowed_llm_providers=["default", "openai", "anthropic", "ollama"],
        max_saved_pipelines=20,
        max_seats=1,
        export_formats=["csv", "png", "svg"],
        priority_queue=False,
    ),
    TierName.STUDIO: TierConfig(
        name=TierName.STUDIO,
        label="Studio",
        price_monthly=79,
        stripe_price_id_env_var="STRIPE_PRICE_STUDIO",
        max_uploads_per_month=None,  # unlimited
        max_file_size_mb=200,
        max_pipeline_runs_per_month=None,  # unlimited
        max_pipeline_generations_per_month=None,  # unlimited
        max_daily_tokens=2_000_000,
        max_daily_llm_calls=1_000,
        session_retention_days=30,
        allowed_llm_providers=["default", "openai", "anthropic", "ollama"],
        max_saved_pipelines=None,  # unlimited
        max_seats=10,
        export_formats=["csv", "png", "svg", "scheduled"],
        priority_queue=True,
    ),
}


def get_tier_config(tier_name: str | TierName | None) -> TierConfig:
    if isinstance(tier_name, str):
        try:
            tier_enum = TierName(tier_name.lower())
        except ValueError:
            tier_enum = TierName.EXPLORER
    elif isinstance(tier_name, TierName):
        tier_enum = tier_name
    else:
        tier_enum = TierName.EXPLORER

    return TIERS[tier_enum]
