"""
circuit_breaker.py — Universal Circuit Breaker pattern service for external integrations
(LiteLLM, Supabase Storage, Firebase Admin). Prevents cascading backend failures.
"""

from __future__ import annotations

import enum
import functools
import logging
import time
from typing import Any, Callable, Dict, Optional, TypeVar, cast

from app.services.redis_client import get_redis_client
from app.services.rule_config import rule_config

logger = logging.getLogger(__name__)


class CircuitState(str, enum.Enum):
    CLOSED = "CLOSED"      # Normal operation
    OPEN = "OPEN"          # Fast failing requests
    HALF_OPEN = "HALF_OPEN"# Trial testing recovery


class CircuitBreakerOpenError(Exception):
    def __init__(self, name: str, reset_in_seconds: float) -> None:
        self.name = name
        self.reset_in_seconds = max(0.0, reset_in_seconds)
        super().__init__(
            f"Circuit breaker '{name}' is OPEN. Requests blocked to prevent cascading failure. "
            f"Retry in {self.reset_in_seconds:.1f}s."
        )


class CircuitBreaker:
    def __init__(
        self,
        name: str,
        failure_threshold: Optional[int] = None,
        recovery_time_seconds: Optional[float] = None,
    ) -> None:
        self.name = name
        self._override_threshold = failure_threshold
        self._override_recovery = recovery_time_seconds

        # Local fallback state
        self._state: CircuitState = CircuitState.CLOSED
        self._failure_count: int = 0
        self._last_state_change: float = time.time()

    @property
    def failure_threshold(self) -> int:
        if self._override_threshold is not None:
            return self._override_threshold
        return int(rule_config.get_rule("circuit_breaker_failure_threshold", 5))

    @property
    def recovery_time_seconds(self) -> float:
        if self._override_recovery is not None:
            return self._override_recovery
        return float(rule_config.get_rule("circuit_breaker_recovery_time_seconds", 30.0))

    def _get_state(self) -> CircuitState:
        redis = get_redis_client()
        if redis:
            raw = redis.get(f"circuit:{self.name}:state")
            if raw and raw in CircuitState.__members__:
                state = CircuitState(raw)
                last_change = float(redis.get(f"circuit:{self.name}:timestamp") or 0)
                if state == CircuitState.OPEN and (time.time() - last_change) >= self.recovery_time_seconds:
                    self._set_state(CircuitState.HALF_OPEN)
                    return CircuitState.HALF_OPEN
                return state

        if self._state == CircuitState.OPEN and (time.time() - self._last_state_change) >= self.recovery_time_seconds:
            self._set_state(CircuitState.HALF_OPEN)

        return self._state

    def _set_state(self, new_state: CircuitState) -> None:
        now = time.time()
        old_state = self._state
        self._state = new_state
        self._last_state_change = now

        if old_state != new_state:
            logger.warning(
                "Circuit Breaker '%s' state transition: %s -> %s",
                self.name, old_state, new_state
            )

        redis = get_redis_client()
        if redis:
            redis.set(f"circuit:{self.name}:state", new_state.value)
            redis.set(f"circuit:{self.name}:timestamp", str(now))

    def _on_success(self) -> None:
        self._failure_count = 0
        if self._get_state() == CircuitState.HALF_OPEN:
            self._set_state(CircuitState.CLOSED)

        redis = get_redis_client()
        if redis:
            redis.set(f"circuit:{self.name}:failures", "0")

    def _on_failure(self, exc: Exception) -> None:
        self._failure_count += 1
        logger.warning(
            "Circuit Breaker '%s' failure recorded (%d/%d): %s",
            self.name, self._failure_count, self.failure_threshold, exc
        )

        redis = get_redis_client()
        if redis:
            fail_count = redis.incrby(f"circuit:{self.name}:failures", 1) or self._failure_count
        else:
            fail_count = self._failure_count

        state = self._get_state()
        if state == CircuitState.HALF_OPEN or fail_count >= self.failure_threshold:
            self._set_state(CircuitState.OPEN)

    def call(self, func: Callable, *args: Any, **kwargs: Any) -> Any:
        state = self._get_state()

        if state == CircuitState.OPEN:
            elapsed = time.time() - self._last_state_change
            remaining = max(0.0, self.recovery_time_seconds - elapsed)
            raise CircuitBreakerOpenError(self.name, remaining)

        try:
            result = func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure(e)
            raise

    async def call_async(self, func: Callable, *args: Any, **kwargs: Any) -> Any:
        state = self._get_state()

        if state == CircuitState.OPEN:
            elapsed = time.time() - self._last_state_change
            remaining = max(0.0, self.recovery_time_seconds - elapsed)
            raise CircuitBreakerOpenError(self.name, remaining)

        try:
            result = await func(*args, **kwargs)
            self._on_success()
            return result
        except Exception as e:
            self._on_failure(e)
            raise

    def get_status(self) -> Dict[str, Any]:
        state = self._get_state()
        elapsed = time.time() - self._last_state_change
        remaining = max(0.0, self.recovery_time_seconds - elapsed) if state == CircuitState.OPEN else 0.0
        return {
            "name": self.name,
            "state": state.value,
            "failure_count": self._failure_count,
            "failure_threshold": self.failure_threshold,
            "reset_in_seconds": round(remaining, 1),
        }


# Pre-defined Circuit Breakers for core external dependencies
litellm_circuit_breaker = CircuitBreaker("litellm", failure_threshold=3, recovery_time_seconds=30.0)
supabase_circuit_breaker = CircuitBreaker("supabase", failure_threshold=5, recovery_time_seconds=20.0)
firebase_circuit_breaker = CircuitBreaker("firebase", failure_threshold=5, recovery_time_seconds=20.0)
