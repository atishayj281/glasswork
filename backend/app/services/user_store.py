from datetime import datetime, timedelta, timezone
import logging
import uuid
from typing import Any

from app.billing.tiers import TierName, get_tier_config
from app.models.user import UsageEvent, UserSubscription
from app.services.firestore import get_firestore_client

logger = logging.getLogger(__name__)


def serialize_subscription(sub: UserSubscription) -> dict[str, Any]:
    return {
        "uid": sub.uid,
        "tier": sub.tier.value if isinstance(sub.tier, TierName) else str(sub.tier),
        "stripe_customer_id": sub.stripe_customer_id,
        "stripe_subscription_id": sub.stripe_subscription_id,
        "stripe_status": sub.stripe_status,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "updated_at": sub.updated_at.isoformat() if sub.updated_at else datetime.now(timezone.utc).isoformat(),
    }


def deserialize_subscription(data: dict[str, Any]) -> UserSubscription:
    period_end_val = data.get("current_period_end")
    period_end = datetime.fromisoformat(period_end_val) if isinstance(period_end_val, str) else None

    updated_at_val = data.get("updated_at")
    updated_at = datetime.fromisoformat(updated_at_val) if isinstance(updated_at_val, str) else datetime.now(timezone.utc)

    raw_tier = data.get("tier", "explorer")
    try:
        tier_enum = TierName(raw_tier)
    except ValueError:
        tier_enum = TierName.EXPLORER

    return UserSubscription(
        uid=data["uid"],
        tier=tier_enum,
        stripe_customer_id=data.get("stripe_customer_id"),
        stripe_subscription_id=data.get("stripe_subscription_id"),
        stripe_status=data.get("stripe_status"),
        current_period_end=period_end,
        updated_at=updated_at,
    )


class UserStore:
    def __init__(self) -> None:
        self._local_subscriptions: dict[str, UserSubscription] = {}
        self._local_usage_events: list[UsageEvent] = []

    def _get_firestore(self):
        return get_firestore_client()

    def get_subscription(self, uid: str) -> UserSubscription:
        """Fetch user's subscription state. Defaults to Explorer tier if not found.

        Checks local in-memory cache first to honour test pre-seedings and avoid
        a Firestore round-trip for the common case where the subscription was
        recently written (same process lifetime).
        """
        if not uid:
            return UserSubscription(uid="anonymous", tier=TierName.EXPLORER)

        # Check local cache first — matches pattern used in SessionStore.get()
        local_sub = self._local_subscriptions.get(uid)

        firestore_db = self._get_firestore()
        if firestore_db and not local_sub:
            # Only go to Firestore when we don't have a local hit
            try:
                doc_ref = firestore_db.collection("user_subscriptions").document(uid)
                doc_snap = doc_ref.get()
                if doc_snap.exists:
                    sub = deserialize_subscription(doc_snap.to_dict())
                    self._local_subscriptions[uid] = sub
                    return sub
            except Exception as e:
                logger.error("Failed to fetch user_subscription for %s from Firestore: %s", uid, e)

        if local_sub:
            return local_sub

        # Default to Explorer
        sub = UserSubscription(uid=uid, tier=TierName.EXPLORER)
        self._local_subscriptions[uid] = sub
        return sub

    def save_subscription(self, sub: UserSubscription) -> None:
        sub.updated_at = datetime.now(timezone.utc)
        self._local_subscriptions[sub.uid] = sub

        firestore_db = self._get_firestore()
        if firestore_db:
            try:
                doc_ref = firestore_db.collection("user_subscriptions").document(sub.uid)
                doc_ref.set(serialize_subscription(sub))
            except Exception as e:
                logger.error("Failed to save user_subscription for %s to Firestore: %s", sub.uid, e)

    def get_by_stripe_customer_id(self, customer_id: str) -> UserSubscription | None:
        if not customer_id:
            return None

        firestore_db = self._get_firestore()
        if firestore_db:
            try:
                docs = firestore_db.collection("user_subscriptions").where("stripe_customer_id", "==", customer_id).stream()
                for doc in docs:
                    sub = deserialize_subscription(doc.to_dict())
                    self._local_subscriptions[sub.uid] = sub
                    return sub
            except Exception as e:
                logger.error("Failed to find subscription for stripe customer %s in Firestore: %s", customer_id, e)

        for sub in self._local_subscriptions.values():
            if sub.stripe_customer_id == customer_id:
                return sub
        return None

    def record_usage(self, uid: str, metric: str) -> UsageEvent:
        event = UsageEvent(
            event_id=str(uuid.uuid4()),
            uid=uid,
            metric=metric,
            timestamp=datetime.now(timezone.utc),
        )
        self._local_usage_events.append(event)

        firestore_db = self._get_firestore()
        if firestore_db:
            try:
                doc_ref = firestore_db.collection("usage_events").document(event.event_id)
                doc_ref.set({
                    "event_id": event.event_id,
                    "uid": event.uid,
                    "metric": event.metric,
                    "timestamp": event.timestamp.isoformat(),
                })
            except Exception as e:
                logger.error("Failed to record usage_event for %s to Firestore: %s", uid, e)

        return event

    def get_usage_count(self, uid: str, metric: str, days: int = 30) -> int:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        firestore_db = self._get_firestore()
        if firestore_db:
            try:
                # Filter by uid only to avoid multi-field composite index requirements
                docs = firestore_db.collection("usage_events").where("uid", "==", uid).stream()
                count = 0
                cutoff_iso = cutoff.isoformat()
                for doc in docs:
                    d = doc.to_dict()
                    if d.get("metric") == metric and d.get("timestamp", "") >= cutoff_iso:
                        count += 1
                return count
            except Exception as e:
                logger.error("Failed to count usage_events for %s from Firestore: %s", uid, e)

        count = sum(
            1 for ev in self._local_usage_events
            if ev.uid == uid and ev.metric == metric and ev.timestamp >= cutoff
        )
        return count



user_store = UserStore()
