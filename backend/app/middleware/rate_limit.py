import os
import time
import logging
import threading
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

class TokenBucketLimiter:
    def __init__(self):
        self._buckets = {}  # key -> (tokens, last_update)
        self._lock = threading.Lock()

    def check(self, key: str) -> None:
        """Check rate limit for the given key. Raises HTTPException 429 if exceeded."""
        try:
            limit_per_minute = float(os.getenv("LLM_RATE_LIMIT_PER_MINUTE", "20"))
        except ValueError:
            limit_per_minute = 20.0

        capacity = limit_per_minute
        fill_rate = capacity / 60.0  # tokens per second

        now = time.time()
        with self._lock:
            if key not in self._buckets:
                # Start with full capacity
                self._buckets[key] = (capacity, now)
            
            tokens, last_update = self._buckets[key]
            elapsed = now - last_update
            
            # Refill tokens
            tokens = min(capacity, tokens + (elapsed * fill_rate))
            
            if tokens >= 1.0:
                tokens -= 1.0
                self._buckets[key] = (tokens, now)
                logger.info(
                    "Rate limit check passed for key=%s. Remaining tokens: %.2f/%d",
                    key, tokens, capacity
                )
            else:
                self._buckets[key] = (tokens, now)
                logger.warning("Rate limit exceeded for key=%s. Refilling...", key)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded. Maximum {int(capacity)} requests per minute allowed."
                )

limiter = TokenBucketLimiter()
