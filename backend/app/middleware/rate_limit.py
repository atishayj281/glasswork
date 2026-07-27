import logging
import os
import threading
import time
from fastapi import HTTPException, status

from app.services.redis_client import get_redis_client
from app.services.rule_config import rule_config

logger = logging.getLogger(__name__)


class TokenBucketLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, tuple[float, float]] = {}  # key -> (tokens, last_update)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        """Check rate limit for the given key. Raises HTTPException 429 if exceeded."""
        limit_per_minute = float(rule_config.get_rule("llm_rate_limit_per_minute", 20.0))

        redis = get_redis_client()
        if redis and redis.is_available():
            self._check_redis(redis, key, limit_per_minute)
        else:
            self._check_memory(key, limit_per_minute)

    def _check_redis(self, redis, key: str, limit_per_minute: float) -> None:
        """Distributed rate limiting using Redis 1-minute fixed window with sliding expiry."""
        current_minute = int(time.time() // 60)
        redis_key = f"rate_limit:{key}:{current_minute}"

        pipe = redis.pipeline()
        if pipe is None:
            self._check_memory(key, limit_per_minute)
            return

        try:
            pipe.incr(redis_key)
            pipe.expire(redis_key, 70)  # Keep key around for 70 seconds
            count, _ = pipe.execute()
            count = int(count or 1)

            if count > limit_per_minute:
                logger.warning("Distributed Redis rate limit exceeded for key=%s (count=%d/%d)", key, count, limit_per_minute)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded. Maximum {int(limit_per_minute)} requests per minute allowed."
                )
            logger.info("Distributed Redis rate limit check passed for key=%s (count=%d/%d)", key, count, limit_per_minute)
        except HTTPException:
            raise
        except Exception as e:
            logger.error("Redis rate limit check error for key=%s: %s — falling back to local bucket", key, e)
            self._check_memory(key, limit_per_minute)

    def _check_memory(self, key: str, limit_per_minute: float) -> None:
        """Thread-safe in-memory token bucket fallback."""
        capacity = limit_per_minute
        fill_rate = capacity / 60.0  # tokens per second

        now = time.time()
        with self._lock:
            if key not in self._buckets:
                self._buckets[key] = (capacity, now)

            tokens, last_update = self._buckets[key]
            elapsed = now - last_update

            # Refill tokens
            tokens = min(capacity, tokens + (elapsed * fill_rate))

            if tokens >= 1.0:
                tokens -= 1.0
                self._buckets[key] = (tokens, now)
                logger.info(
                    "Local rate limit check passed for key=%s. Remaining tokens: %.2f/%d",
                    key, tokens, capacity
                )
            else:
                self._buckets[key] = (tokens, now)
                logger.warning("Local rate limit exceeded for key=%s. Refilling...", key)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded. Maximum {int(capacity)} requests per minute allowed."
                )


limiter = TokenBucketLimiter()
