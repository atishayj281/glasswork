"""
test_budget.py — Unit tests for the per-uid daily LLM budget service.

These tests use fakeredis so no real Redis instance is required in CI.
"""

from __future__ import annotations

import importlib
import sys
from unittest.mock import patch


# ---------------------------------------------------------------------------
# Helpers to reset the lazy singleton in budget.py between tests
# ---------------------------------------------------------------------------

def _reset_budget_module():
    """Force budget.py to re-initialise its module-level singletons."""
    if "app.services.budget" in sys.modules:
        del sys.modules["app.services.budget"]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestBudgetNoRedis:
    """When REDIS_URL is absent budget functions must be permissive (no-op)."""

    def test_check_budget_allows_when_no_redis(self, monkeypatch):
        _reset_budget_module()
        monkeypatch.delenv("REDIS_URL", raising=False)
        from app.services.budget import check_budget
        # Should NOT raise even at limit 0
        check_budget("uid-noredis", max_calls=0, max_tokens=0)

    def test_record_llm_call_noop_when_no_redis(self, monkeypatch):
        _reset_budget_module()
        monkeypatch.delenv("REDIS_URL", raising=False)
        from app.services.budget import record_llm_call
        record_llm_call("uid-noredis", tokens_used=99999)  # must not raise

    def test_get_usage_returns_zeros_when_no_redis(self, monkeypatch):
        _reset_budget_module()
        monkeypatch.delenv("REDIS_URL", raising=False)
        from app.services.budget import get_usage
        result = get_usage("uid-noredis")
        assert result["calls"] == 0
        assert result["tokens"] == 0
        assert result["redis_available"] is False


class TestBudgetWithFakeRedis:
    """Tests that use fakeredis to simulate a real Redis server in-process."""

    @staticmethod
    def _make_fake_redis():
        try:
            import fakeredis
            return fakeredis.FakeRedis(decode_responses=True)
        except ImportError:
            import pytest
            pytest.skip("fakeredis not installed — skipping Redis-backed budget tests")

    def _patch_get_redis(self, monkeypatch, fake_r):
        """Patch budget._get_redis() to return our fake Redis and bypass lazy init."""
        _reset_budget_module()
        import app.services.budget as bmod
        monkeypatch.setattr(bmod, "_redis_client", fake_r)
        monkeypatch.setattr(bmod, "_redis_init_attempted", True)

    def test_check_budget_below_limit_passes(self, monkeypatch):
        fake_r = self._make_fake_redis()
        _reset_budget_module()
        import app.services.budget as bmod
        monkeypatch.setattr(bmod, "_redis_client", fake_r)
        monkeypatch.setattr(bmod, "_redis_init_attempted", True)
        # No prior usage recorded — should pass
        bmod.check_budget("uid-a", max_calls=100, max_tokens=200_000)

    def test_check_budget_at_call_limit_raises_429_detail(self, monkeypatch):
        fake_r = self._make_fake_redis()
        _reset_budget_module()
        import app.services.budget as bmod
        monkeypatch.setattr(bmod, "_redis_client", fake_r)
        monkeypatch.setattr(bmod, "_redis_init_attempted", True)

        day = bmod._day_key_suffix()
        # Manually set counter at exactly the limit
        fake_r.set(f"budget:calls:uid-b:{day}", "100")

        import pytest
        with pytest.raises(ValueError, match="Daily LLM call limit reached"):
            bmod.check_budget("uid-b", max_calls=100, max_tokens=200_000)

    def test_check_budget_at_token_limit_raises(self, monkeypatch):
        fake_r = self._make_fake_redis()
        _reset_budget_module()
        import app.services.budget as bmod
        monkeypatch.setattr(bmod, "_redis_client", fake_r)
        monkeypatch.setattr(bmod, "_redis_init_attempted", True)

        day = bmod._day_key_suffix()
        fake_r.set(f"budget:tokens:uid-c:{day}", "200000")

        import pytest
        with pytest.raises(ValueError, match="Daily token limit reached"):
            bmod.check_budget("uid-c", max_calls=100, max_tokens=200_000)

    def test_record_llm_call_increments_both_counters(self, monkeypatch):
        fake_r = self._make_fake_redis()
        _reset_budget_module()
        import app.services.budget as bmod
        monkeypatch.setattr(bmod, "_redis_client", fake_r)
        monkeypatch.setattr(bmod, "_redis_init_attempted", True)

        day = bmod._day_key_suffix()
        bmod.record_llm_call("uid-d", tokens_used=500)
        bmod.record_llm_call("uid-d", tokens_used=300)

        calls = int(fake_r.get(f"budget:calls:uid-d:{day}") or 0)
        tokens = int(fake_r.get(f"budget:tokens:uid-d:{day}") or 0)
        assert calls == 2
        assert tokens == 800

    def test_get_usage_returns_correct_values(self, monkeypatch):
        fake_r = self._make_fake_redis()
        _reset_budget_module()
        import app.services.budget as bmod
        monkeypatch.setattr(bmod, "_redis_client", fake_r)
        monkeypatch.setattr(bmod, "_redis_init_attempted", True)

        bmod.record_llm_call("uid-e", tokens_used=1000)
        bmod.record_llm_call("uid-e", tokens_used=2000)

        usage = bmod.get_usage("uid-e")
        assert usage["calls"] == 2
        assert usage["tokens"] == 3000
        assert usage["redis_available"] is True

    def test_budget_enforcement_blocks_after_limit(self, monkeypatch):
        """
        Simulate a uid exhausting the daily call limit and verify that the
        (N+1)th call raises ValueError while the Nth passes.
        """
        fake_r = self._make_fake_redis()
        _reset_budget_module()
        import app.services.budget as bmod
        import pytest
        monkeypatch.setattr(bmod, "_redis_client", fake_r)
        monkeypatch.setattr(bmod, "_redis_init_attempted", True)

        MAX_CALLS = 3
        uid = "uid-f"

        for _ in range(MAX_CALLS):
            bmod.check_budget(uid, max_calls=MAX_CALLS, max_tokens=1_000_000)
            bmod.record_llm_call(uid, tokens_used=10)

        # The (N+1)th call must be rejected
        with pytest.raises(ValueError, match="Daily LLM call limit reached"):
            bmod.check_budget(uid, max_calls=MAX_CALLS, max_tokens=1_000_000)
