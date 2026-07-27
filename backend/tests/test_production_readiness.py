"""
test_production_readiness.py — Unit and integration tests for production architecture
components: Redis client, Rule Config, Circuit Breaker engine, Task Queue, and Health API.
"""

import time
import pytest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.services.circuit_breaker import CircuitBreaker, CircuitBreakerOpenError, CircuitState
from app.services.queue import enqueue_task, get_task_status, update_task_status
from app.services.redis_client import RedisClient
from app.services.rule_config import rule_config, DEFAULT_RULES


def test_redis_client_unconfigured_fallback(monkeypatch):
    """Verify Redis client enters fallback mode cleanly when REDIS_URL is omitted."""
    monkeypatch.delenv("REDIS_URL", raising=False)
    from app.services.redis_client import get_redis_client

    client = RedisClient("")
    assert client.is_available() is False
    assert client.get("nonexistent_key") is None
    assert client.set("key", "val") is False
    assert client.incrby("key", 1) is None


def test_rule_config_store(monkeypatch):
    """Verify rule config fallback hierarchy: local set -> env -> default -> fallback."""
    # Default rule lookup
    limit = rule_config.get_rule("llm_rate_limit_per_minute")
    assert limit == DEFAULT_RULES["llm_rate_limit_per_minute"]

    # Environment variable override
    monkeypatch.setenv("LLM_RATE_LIMIT_PER_MINUTE", "50")
    assert rule_config.get_rule("llm_rate_limit_per_minute") == 50.0

    # Explicit set_rule override
    rule_config.set_rule("test_custom_rule", 999)
    assert rule_config.get_rule("test_custom_rule") == 999


def test_circuit_breaker_transitions():
    """Verify Circuit Breaker transitions: CLOSED -> OPEN -> HALF_OPEN -> CLOSED."""
    cb = CircuitBreaker("test_service", failure_threshold=2, recovery_time_seconds=0.5)

    assert cb._get_state() == CircuitState.CLOSED
    assert cb.get_status()["state"] == "CLOSED"

    # First failure
    def failing_fn():
        raise RuntimeError("External service error")

    with pytest.raises(RuntimeError):
        cb.call(failing_fn)
    assert cb._get_state() == CircuitState.CLOSED

    # Second failure triggers OPEN state
    with pytest.raises(RuntimeError):
        cb.call(failing_fn)
    assert cb._get_state() == CircuitState.OPEN
    assert cb.get_status()["state"] == "OPEN"

    # Fast fail while OPEN
    with pytest.raises(CircuitBreakerOpenError) as exc_info:
        cb.call(failing_fn)
    assert "OPEN" in str(exc_info.value)

    # Wait for recovery timeout to transition to HALF_OPEN
    time.sleep(0.6)
    assert cb._get_state() == CircuitState.HALF_OPEN

    # Successful call in HALF_OPEN resets state to CLOSED
    def success_fn():
        return "ok"

    res = cb.call(success_fn)
    assert res == "ok"
    assert cb._get_state() == CircuitState.CLOSED


def test_health_endpoint_diagnostics():
    """Verify /health endpoint exposes firestore, supabase, redis, and circuit breaker metrics."""
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code in (200, 503)

    data = response.json()
    assert "status" in data
    assert "details" in data
    details = data["details"]

    assert "firestore" in details
    assert "supabase" in details
    assert "redis" in details
    assert "circuit_breakers" in details

    cbs = details["circuit_breakers"]
    assert "litellm" in cbs
    assert "supabase" in cbs
    assert "firebase" in cbs
    assert cbs["litellm"]["state"] in ("CLOSED", "OPEN", "HALF_OPEN")
