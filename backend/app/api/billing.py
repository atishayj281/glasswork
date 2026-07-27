from datetime import datetime, timezone
import logging
import os
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
try:
    import stripe
except ImportError:
    stripe = None


from app.billing.tiers import TierName, get_tier_config
from app.middleware.auth import get_current_user
from app.services.user_store import user_store

router = APIRouter(prefix="/billing", tags=["billing"])
logger = logging.getLogger(__name__)


def _get_stripe_key() -> str:
    key = os.getenv("STRIPE_SECRET_KEY", "")
    if key:
        stripe.api_key = key
    return key


class CheckoutRequest(BaseModel):
    tier: TierName
    success_url: str | None = None
    cancel_url: str | None = None


class CheckoutResponse(BaseModel):
    checkout_url: str
    session_id: str


class PortalResponse(BaseModel):
    portal_url: str


class SubscriptionInfoResponse(BaseModel):
    uid: str
    tier: str
    tier_label: str
    stripe_status: str | None = None
    current_period_end: datetime | None = None
    limits: dict
    usage_this_period: dict


@router.get("/me", response_model=SubscriptionInfoResponse)
async def get_my_subscription(session_id: str | None = None, uid: str = Depends(get_current_user)):
    """Return the authenticated user's current subscription, tier limits, and 30-day usage.

    If session_id is provided (e.g. returning from Stripe Checkout), verifies the session
    directly with Stripe to ensure instant tier upgrade even without local webhooks.
    """
    sub = user_store.get_subscription(uid)

    if session_id:
        stripe_key = _get_stripe_key()
        if stripe_key:
            try:
                session = stripe.checkout.Session.retrieve(session_id)
                pay_status = getattr(session, "payment_status", None) or (session.get("payment_status") if hasattr(session, "get") else None)
                sess_status = getattr(session, "status", None) or (session.get("status") if hasattr(session, "get") else None)

                if pay_status == "paid" or sess_status == "complete":
                    raw_meta = getattr(session, "metadata", None) or (session.get("metadata") if hasattr(session, "get") else None)
                    tier_str = None
                    if raw_meta:
                        tier_str = raw_meta.get("tier") if hasattr(raw_meta, "get") else getattr(raw_meta, "tier", None)

                    if tier_str:
                        try:
                            sub.tier = TierName(tier_str)
                        except ValueError:
                            pass

                    cust = getattr(session, "customer", None) or (session.get("customer") if hasattr(session, "get") else None)
                    sub_id = getattr(session, "subscription", None) or (session.get("subscription") if hasattr(session, "get") else None)

                    if cust and isinstance(cust, str):
                        sub.stripe_customer_id = cust
                    if sub_id and isinstance(sub_id, str):
                        sub.stripe_subscription_id = sub_id

                    sub.stripe_status = "active"
                    user_store.save_subscription(sub)
                    logger.info("[billing fallback] successfully upgraded uid=%s to tier=%s via checkout session %s", uid, sub.tier.value, session_id)
            except Exception as e:
                logger.error("Failed to verify stripe checkout session %s: %s", session_id, e, exc_info=True)


    tier_cfg = get_tier_config(sub.tier)

    uploads_used = user_store.get_usage_count(uid, "uploads", days=30)
    runs_used = user_store.get_usage_count(uid, "pipeline_runs", days=30)
    generations_used = user_store.get_usage_count(uid, "pipeline_generations", days=30)


    from app.services.budget import get_usage
    llm_usage = get_usage(uid)

    return SubscriptionInfoResponse(
        uid=uid,
        tier=tier_cfg.name.value,
        tier_label=tier_cfg.label,
        stripe_status=sub.stripe_status,
        current_period_end=sub.current_period_end,
        limits={
            "max_uploads_per_month": tier_cfg.max_uploads_per_month,
            "max_file_size_mb": tier_cfg.max_file_size_mb,
            "max_pipeline_runs_per_month": tier_cfg.max_pipeline_runs_per_month,
            "max_pipeline_generations_per_month": tier_cfg.max_pipeline_generations_per_month,
            "max_daily_tokens": tier_cfg.max_daily_tokens,
            "max_daily_llm_calls": tier_cfg.max_daily_llm_calls,
            "session_retention_days": tier_cfg.session_retention_days,
            "allowed_llm_providers": tier_cfg.allowed_llm_providers,
            "max_saved_pipelines": tier_cfg.max_saved_pipelines,
            "max_seats": tier_cfg.max_seats,
            "export_formats": tier_cfg.export_formats,
            "priority_queue": tier_cfg.priority_queue,
        },
        usage_this_period={
            "uploads": uploads_used,
            "pipeline_runs": runs_used,
            "pipeline_generations": generations_used,
            "daily_tokens": llm_usage.get("tokens", 0),
            "daily_llm_calls": llm_usage.get("calls", 0),
        },
    )


@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout_session(
    req: CheckoutRequest,
    uid: str = Depends(get_current_user),
):
    """Create a Stripe Checkout session for upgrading to Analyst or Studio tier."""
    stripe_key = _get_stripe_key()
    if not stripe_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe integration is not configured (STRIPE_SECRET_KEY is missing).",
        )

    if req.tier == TierName.EXPLORER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Explorer tier is free. No checkout session needed.",
        )

    tier_cfg = get_tier_config(req.tier)
    price_id = tier_cfg.stripe_price_id
    if not price_id:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stripe Price ID for tier {req.tier.value} is not configured ({tier_cfg.stripe_price_id_env_var}).",
        )

    sub = user_store.get_subscription(uid)

    # Ensure Stripe Customer ID exists
    customer_id = sub.stripe_customer_id
    if not customer_id:
        try:
            customer = stripe.Customer.create(
                metadata={"uid": uid},
                description=f"Aegis User {uid}",
            )
            customer_id = customer.id
            sub.stripe_customer_id = customer_id
            user_store.save_subscription(sub)
        except Exception as e:
            logger.error("Failed to create Stripe Customer for uid=%s: %s", uid, e)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Stripe Customer creation failed: {e}",
            ) from e

    frontend_base = os.getenv("CORS_ORIGIN", "http://localhost:5173")
    default_success = f"{frontend_base}/billing?session_id={{CHECKOUT_SESSION_ID}}&status=success"
    default_cancel = f"{frontend_base}/pricing?status=cancelled"

    try:
        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            success_url=req.success_url or default_success,
            cancel_url=req.cancel_url or default_cancel,
            metadata={"uid": uid, "tier": req.tier.value},
            subscription_data={"metadata": {"uid": uid, "tier": req.tier.value}},
        )
        return CheckoutResponse(checkout_url=session.url, session_id=session.id)
    except Exception as e:
        logger.error("Stripe Checkout creation failed for uid=%s: %s", uid, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stripe Checkout creation failed: {e}",
        ) from e


@router.post("/portal", response_model=PortalResponse)
async def create_portal_session(uid: str = Depends(get_current_user)):
    """Create a Stripe Customer Portal session for managing billing/subscriptions."""
    stripe_key = _get_stripe_key()
    if not stripe_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe integration is not configured (STRIPE_SECRET_KEY is missing).",
        )

    sub = user_store.get_subscription(uid)
    if not sub.stripe_customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active Stripe customer found for your account.",
        )

    frontend_base = os.getenv("CORS_ORIGIN", "http://localhost:5173")
    return_url = f"{frontend_base}/billing"

    try:
        portal = stripe.billing_portal.Session.create(
            customer=sub.stripe_customer_id,
            return_url=return_url,
        )
        return PortalResponse(portal_url=portal.url)
    except Exception as e:
        logger.error("Stripe Customer Portal creation failed for uid=%s: %s", uid, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stripe Portal creation failed: {e}",
        ) from e


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events (checkout, subscription updates, cancellations)."""
    stripe_key = _get_stripe_key()
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")

    payload = await request.body()
    sig_header = request.headers.get("Stripe-Signature", "")

    if webhook_secret:
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
        except (ValueError, stripe.error.SignatureVerificationError) as e:
            logger.warning("Stripe webhook signature verification failed: %s", e)
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid webhook signature: {e}")
    else:
        # If no secret configured, parse event directly (useful for local dev/testing)
        import json
        try:
            event_data = json.loads(payload)
            event = stripe.Event.construct_from(event_data, stripe.api_key)
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid webhook payload: {e}")

    event_type = event["type"]
    data_object = event["data"]["object"]
    logger.info("[stripe webhook] received event type=%s", event_type)

    if event_type == "checkout.session.completed":
        metadata = data_object.get("metadata") or {}
        uid = metadata.get("uid")
        target_tier_str = metadata.get("tier")

        customer_id = data_object.get("customer")
        subscription_id = data_object.get("subscription")

        if uid and target_tier_str:
            sub = user_store.get_subscription(uid)
            try:
                sub.tier = TierName(target_tier_str)
            except ValueError:
                sub.tier = TierName.ANALYST
            sub.stripe_customer_id = customer_id
            sub.stripe_subscription_id = subscription_id
            sub.stripe_status = "active"
            user_store.save_subscription(sub)
            logger.info("[stripe webhook] upgraded uid=%s to tier=%s", uid, sub.tier.value)

    elif event_type in ("customer.subscription.updated", "customer.subscription.created"):
        customer_id = data_object.get("customer")
        subscription_id = data_object.get("id")
        status_val = data_object.get("status")
        metadata = data_object.get("metadata") or {}
        uid = metadata.get("uid")

        sub = None
        if uid:
            sub = user_store.get_subscription(uid)
        elif customer_id:
            sub = user_store.get_by_stripe_customer_id(customer_id)

        if sub:
            sub.stripe_subscription_id = subscription_id
            sub.stripe_status = status_val
            period_end_ts = data_object.get("current_period_end")
            if period_end_ts:
                sub.current_period_end = datetime.fromtimestamp(period_end_ts, tz=timezone.utc)

            # If metadata specifies tier, update it
            tier_str = metadata.get("tier")
            if tier_str:
                try:
                    sub.tier = TierName(tier_str)
                except ValueError:
                    pass
            user_store.save_subscription(sub)
            logger.info("[stripe webhook] updated subscription for uid=%s status=%s tier=%s", sub.uid, status_val, sub.tier.value)

    elif event_type == "customer.subscription.deleted":
        customer_id = data_object.get("customer")
        sub = user_store.get_by_stripe_customer_id(customer_id) if customer_id else None
        if sub:
            # Downgrade user to Explorer
            sub.tier = TierName.EXPLORER
            sub.stripe_status = "canceled"
            user_store.save_subscription(sub)
            logger.info("[stripe webhook] downgraded cancelled user uid=%s to Explorer tier", sub.uid)

    elif event_type == "invoice.payment_failed":
        customer_id = data_object.get("customer")
        sub = user_store.get_by_stripe_customer_id(customer_id) if customer_id else None
        if sub:
            sub.stripe_status = "past_due"
            user_store.save_subscription(sub)
            logger.warning("[stripe webhook] payment failed for uid=%s status set to past_due", sub.uid)

    return {"status": "success", "event": event_type}
