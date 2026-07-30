import logging
import re
from typing import Optional
from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from pydantic import BaseModel

from app.config import ADMIN_EMAILS, ADMIN_SECRET_KEY
from app.models.waitlist import (
    WaitlistEntry,
    WaitlistStatus,
    WaitlistSubmissionRequest,
    WaitlistSubmissionResponse,
)
from app.services.waitlist_store import waitlist_store

logger = logging.getLogger(__name__)

router = APIRouter(tags=["waitlist"])

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class WaitlistStatusResponse(BaseModel):
    status: str
    email: Optional[str] = None


class AdminApproveResponse(BaseModel):
    status: str
    email: str
    waitlist_status: str
    approved_at: Optional[str] = None


def _extract_caller_email(authorization: Optional[str], x_user_email: Optional[str]) -> Optional[str]:
    email = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.removeprefix("Bearer ")
        try:
            import firebase_admin.auth
            decoded = firebase_admin.auth.verify_id_token(token)
            email = decoded.get("email")
            if not email and decoded.get("uid"):
                try:
                    user_rec = firebase_admin.auth.get_user(decoded["uid"])
                    email = user_rec.email
                except Exception:
                    pass
        except Exception:
            pass

    if not email and x_user_email:
        email = x_user_email.strip().lower()

    return email.strip().lower() if email else None


@router.post(
    "/waitlist",
    response_model=WaitlistSubmissionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_to_waitlist(req: WaitlistSubmissionRequest, request: Request) -> WaitlistSubmissionResponse:
    email = req.email.strip().lower()
    if not email or not EMAIL_REGEX.match(email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid email address.",
        )

    client_ip = request.client.host if request.client else "unknown"
    entry = waitlist_store.add_or_update_submission(
        email=email,
        use_case=req.use_case.strip() if req.use_case else None,
        source=req.source.strip() if req.source else "landing_page",
        client_ip=client_ip,
    )

    return WaitlistSubmissionResponse(
        status="ok",
        message="You're on the list — we'll email you when you're in.",
        email=entry.email,
    )


@router.get("/waitlist/status", response_model=WaitlistStatusResponse)
async def check_waitlist_status(
    email: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    x_user_email: Optional[str] = Header(None),
) -> WaitlistStatusResponse:
    caller_email = email or _extract_caller_email(authorization, x_user_email)
    if not caller_email:
        return WaitlistStatusResponse(status="unlisted", email=None)

    caller_email_clean = caller_email.strip().lower()
    if caller_email_clean in [a.lower() for a in ADMIN_EMAILS]:
        return WaitlistStatusResponse(status="approved", email=caller_email_clean)

    entry = waitlist_store.get_entry_by_email(caller_email_clean)
    if not entry:
        return WaitlistStatusResponse(status="unlisted", email=caller_email_clean)

    return WaitlistStatusResponse(status=entry.status.value, email=entry.email)


@router.post("/admin/waitlist/{identifier}/approve", response_model=AdminApproveResponse)
async def approve_waitlist_entry(
    identifier: str,
    authorization: Optional[str] = Header(None),
    x_admin_key: Optional[str] = Header(None),
    x_admin_email: Optional[str] = Header(None),
) -> AdminApproveResponse:
    """Admin endpoint to approve a waitlist entry by ID or email.

    Authorization check:
    - If `ADMIN_SECRET_KEY` is configured and `X-Admin-Key` matches it, OR
    - If requesting caller's email matches an email in `ADMIN_EMAILS`.
    """
    is_authorized = False

    if ADMIN_SECRET_KEY and x_admin_key and x_admin_key.strip() == ADMIN_SECRET_KEY.strip():
        is_authorized = True

    if not is_authorized:
        caller_email = _extract_caller_email(authorization, x_admin_email)
        if caller_email and caller_email.lower() in [a.lower() for a in ADMIN_EMAILS]:
            is_authorized = True

    if not is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized admin action. Requires valid admin credentials or key.",
        )

    entry = waitlist_store.approve_entry(identifier)
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Waitlist entry '{identifier}' not found.",
        )

    return AdminApproveResponse(
        status="ok",
        email=entry.email,
        waitlist_status=entry.status.value,
        approved_at=entry.approved_at,
    )
