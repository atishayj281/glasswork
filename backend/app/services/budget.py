"""
budget.py — Per-uid daily LLM call and token budget, backed by Redis.

Keys used in Redis:
  budget:calls:{uid}:{YYYY-MM-DD}   — integer call count (INCR)
  budget:tokens:{uid}:{YYYY-MM-DD}  — integer token count (INCRBY)

Both keys are set to expire at midnight UTC on creation so they reset
automatically without a cron job.

Environment variables read:
  REDIS_URL       — connection URL, e.g. redis://localhost:6379/0
                    If absent, budget tracking is DISABLED (permissive mode).

Constants (also in config.py):
  BUDGET_MAX_CALLS_PER_DAY   = 100
  BUDGET_MAX_TOKENS_PER_DAY  = 200_000
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy Redis client — only imported if REDIS_URL is set
# ---------------------------------------------------------------------------
_redis_client = None
_redis_init_attempted = False


def _get_redis():
    global _redis_client, _redis_init_attempted
    if _redis_init_attempted:
        return _redis_client
    _redis_init_attempted = True
    url = os.getenv("REDIS_URL", "")
    if not url:
        logger.warning("REDIS_URL not set — LLM budget tracking disabled (permissive mode)")
        return None
    try:
        import redis  # noqa: PLC0415
        _redis_client = redis.from_url(url, decode_responses=True, socket_connect_timeout=2)
        _redis_client.ping()
        logger.info("Redis connected for budget tracking: %s", url)
    except Exception as e:
        logger.error("Redis connection failed — budget tracking disabled: %s", e)
        _redis_client = None
    return _redis_client


def _day_key_suffix() -> str:
    """Return today's date in UTC as YYYY-MM-DD."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _seconds_until_midnight_utc() -> int:
    """Seconds remaining until the next UTC midnight."""
    now = datetime.now(timezone.utc)
    midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1, int((midnight - now).total_seconds()))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def record_llm_call(uid: str, tokens_used: int = 0) -> None:
    """
    Increment the daily call counter and token counter for *uid*.
    Silently no-ops if Redis is unavailable.
    """
    r = _get_redis()
    if r is None:
        return
    ttl = _seconds_until_midnight_utc()
    day = _day_key_suffix()
    calls_key = f"budget:calls:{uid}:{day}"
    tokens_key = f"budget:tokens:{uid}:{day}"
    try:
        pipe = r.pipeline()
        pipe.incr(calls_key)
        pipe.expire(calls_key, ttl)
        if tokens_used > 0:
            pipe.incrby(tokens_key, tokens_used)
            pipe.expire(tokens_key, ttl)
        pipe.execute()
    except Exception as e:
        logger.error("Budget record failed for uid=%s: %s", uid, e)


def check_budget(uid: str, max_calls: int | None = None, max_tokens: int | None = None) -> None:
    """
    Raise ValueError with a descriptive message if the uid has exceeded
    either the daily call or token budget.
    Resolves limits from the user's tier if max_calls or max_tokens are None.
    Silently no-ops (allows the request) if Redis is unavailable.
    """
    r = _get_redis()
    if r is None:
        return

    if max_calls is None or max_tokens is None:
        from app.billing.tiers import get_tier_config
        from app.services.user_store import user_store
        sub = user_store.get_subscription(uid)
        tier_cfg = get_tier_config(sub.tier)
        if max_calls is None:
            max_calls = tier_cfg.max_daily_llm_calls
        if max_tokens is None:
            max_tokens = tier_cfg.max_daily_tokens

    day = _day_key_suffix()
    calls_key = f"budget:calls:{uid}:{day}"
    tokens_key = f"budget:tokens:{uid}:{day}"
    try:
        pipe = r.pipeline()
        pipe.get(calls_key)
        pipe.get(tokens_key)
        calls_raw, tokens_raw = pipe.execute()
    except Exception as e:
        logger.error("Budget check failed for uid=%s — allowing request: %s", uid, e)
        return

    calls = int(calls_raw or 0)
    tokens = int(tokens_raw or 0)

    if calls >= max_calls:
        raise ValueError(
            f"Daily LLM call limit reached ({calls}/{max_calls}). "
            f"Your budget resets at midnight UTC."
        )
    if tokens >= max_tokens:
        raise ValueError(
            f"Daily token limit reached ({tokens}/{max_tokens}). "
            f"Your budget resets at midnight UTC."
        )



def get_usage(uid: str) -> dict:
    """
    Return current daily usage for *uid* as a dict with keys
    ``calls`` and ``tokens``.  Returns zeros if Redis is unavailable.
    """
    r = _get_redis()
    if r is None:
        return {"calls": 0, "tokens": 0, "redis_available": False}
    day = _day_key_suffix()
    calls_key = f"budget:calls:{uid}:{day}"
    tokens_key = f"budget:tokens:{uid}:{day}"
    try:
        pipe = r.pipeline()
        pipe.get(calls_key)
        pipe.get(tokens_key)
        calls_raw, tokens_raw = pipe.execute()
    except Exception as e:
        logger.error("Budget usage fetch failed for uid=%s: %s", uid, e)
        return {"calls": 0, "tokens": 0, "redis_available": False}
    return {
        "calls": int(calls_raw or 0),
        "tokens": int(tokens_raw or 0),
        "redis_available": True,
    }
