"""
rule_config.py — Dynamic Rule Configuration Store backed by Redis / Firestore
with environment variable override support for dynamic rule changes and testing.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

from app.services.redis_client import get_redis_client
from app.services.firestore import get_firestore_client

logger = logging.getLogger(__name__)

# Default system rules fallback table
DEFAULT_RULES: Dict[str, Any] = {
    "llm_rate_limit_per_minute": 20.0,
    "budget_max_calls_per_day": 100,
    "budget_max_tokens_per_day": 200000,
    "circuit_breaker_failure_threshold": 5,
    "circuit_breaker_recovery_time_seconds": 30.0,
    "session_ttl_hours": 24,
    "max_upload_mb": 20,
    "max_rows": 100000,
}


class RuleConfigStore:
    def __init__(self) -> None:
        self._local_cache: Dict[str, Any] = {}

    def get_rule(self, key: str, default: Optional[Any] = None) -> Any:
        """Fetch a configuration rule. Lookup order:
        1. Environment variable (UPPERCASE) if explicitly set
        2. Local memory set_rule cache
        3. Redis cache key 'rule_config:{key}'
        4. Firestore collection 'rules' document '{key}'
        5. Passed default (if provided)
        6. DEFAULT_RULES table
        """
        # 1. Environment variable lookup (supports pytest patch.dict("os.environ"))
        env_val = os.getenv(key.upper())
        if env_val is not None:
            try:
                if env_val.isdigit():
                    return int(env_val)
                return float(env_val)
            except ValueError:
                return env_val

        # 2. Local memory cache (via set_rule)
        if key in self._local_cache:
            return self._local_cache[key]

        # 3. Redis lookup
        redis = get_redis_client()
        if redis:
            cached = redis.get(f"rule_config:{key}")
            if cached is not None:
                try:
                    return json.loads(cached)
                except Exception:
                    return cached

        # 4. Firestore lookup
        firestore = get_firestore_client()
        if firestore:
            try:
                doc = firestore.collection("rules").document(key).get()
                if doc.exists:
                    val = doc.to_dict().get("value")
                    if val is not None:
                        if redis:
                            redis.set(f"rule_config:{key}", json.dumps(val), ex=60)
                        return val
            except Exception as e:
                logger.debug("Firestore rule lookup failed for %s: %s", key, e)

        # 5. Caller-provided default
        if default is not None:
            return default

        # 6. Default rules table fallback
        return DEFAULT_RULES.get(key)

    def set_rule(self, key: str, value: Any) -> bool:
        """Update a dynamic configuration rule across Redis & Firestore."""
        self._local_cache[key] = value

        # Update Redis
        redis = get_redis_client()
        if redis:
            try:
                redis.set(f"rule_config:{key}", json.dumps(value))
            except Exception as e:
                logger.error("Failed to set rule in Redis (%s): %s", key, e)

        # Update Firestore
        firestore = get_firestore_client()
        if firestore:
            try:
                firestore.collection("rules").document(key).set({"value": value, "updated_at": firestore.SERVER_TIMESTAMP})
            except Exception as e:
                logger.error("Failed to set rule in Firestore (%s): %s", key, e)

        return True


rule_config = RuleConfigStore()
