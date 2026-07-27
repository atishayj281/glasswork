"""
redis_client.py — Centralized Redis client manager with Upstash rediss:// support,
connection pooling, auto-reconnection, health ping, and graceful fallback.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

_redis_instance = None
_redis_initialized = False


class RedisClient:
    def __init__(self, url: str) -> None:
        self.url = url
        self.client = None
        self._is_connected = False
        self._connect()

    def _connect(self) -> None:
        if not self.url:
            self._is_connected = False
            return

        try:
            import redis  # noqa: PLC0415

            # Upstash compatibility: parse SSL requirements if url starts with rediss://
            kwargs: dict[str, Any] = {
                "decode_responses": True,
                "socket_connect_timeout": 3.0,
                "socket_timeout": 3.0,
                "retry_on_timeout": True,
            }

            if self.url.startswith("rediss://"):
                kwargs["ssl_cert_reqs"] = None

            self.client = redis.from_url(self.url, **kwargs)
            self.client.ping()
            self._is_connected = True
            logger.info("Successfully connected to Redis: %s", self._safe_url())
        except Exception as e:
            logger.error("Failed to initialize Redis client (%s): %s", self._safe_url(), e)
            self.client = None
            self._is_connected = False

    def _safe_url(self) -> str:
        if "@" in self.url:
            # Mask user:password in logs
            parts = self.url.split("@")
            prefix = parts[0].split("://")[0] + "://***"
            return f"{prefix}@{parts[1]}"
        return self.url

    def is_available(self) -> bool:
        if not self._is_connected or self.client is None:
            return False
        try:
            return bool(self.client.ping())
        except Exception as e:
            logger.warning("Redis ping health check failed: %s", e)
            self._is_connected = False
            return False

    def get(self, key: str) -> Optional[str]:
        if not self.is_available():
            return None
        try:
            return self.client.get(key)
        except Exception as e:
            logger.error("Redis GET key=%s failed: %s", key, e)
            return None

    def set(self, key: str, value: str, ex: Optional[int] = None) -> bool:
        if not self.is_available():
            return False
        try:
            return bool(self.client.set(key, value, ex=ex))
        except Exception as e:
            logger.error("Redis SET key=%s failed: %s", key, e)
            return False

    def delete(self, *keys: str) -> int:
        if not self.is_available() or not keys:
            return 0
        try:
            return int(self.client.delete(*keys))
        except Exception as e:
            logger.error("Redis DELETE keys=%s failed: %s", keys, e)
            return 0

    def incrby(self, key: str, amount: int = 1) -> Optional[int]:
        if not self.is_available():
            return None
        try:
            return int(self.client.incrby(key, amount))
        except Exception as e:
            logger.error("Redis INCRBY key=%s amount=%d failed: %s", key, amount, e)
            return None

    def expire(self, key: str, seconds: int) -> bool:
        if not self.is_available():
            return False
        try:
            return bool(self.client.expire(key, seconds))
        except Exception as e:
            logger.error("Redis EXPIRE key=%s seconds=%d failed: %s", key, seconds, e)
            return False

    def pipeline(self):
        if not self.is_available():
            return None
        try:
            return self.client.pipeline()
        except Exception as e:
            logger.error("Redis PIPELINE initialization failed: %s", e)
            return None


def get_redis_client() -> Optional[RedisClient]:
    """Return singleton RedisClient or None if REDIS_URL is unconfigured/failed."""
    global _redis_instance, _redis_initialized
    if _redis_initialized:
        return _redis_instance

    _redis_initialized = True
    url = os.getenv("REDIS_URL", "").strip()
    if not url:
        logger.info("REDIS_URL environment variable is not set — Redis features operating in fallback mode.")
        _redis_instance = None
        return None

    _redis_instance = RedisClient(url)
    if not _redis_instance.is_available():
        logger.warning("Redis client is unserviceable. Falling back to local memory mode.")
    return _redis_instance
