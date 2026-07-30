import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from app.config import DATA_DIR

logger = logging.getLogger(__name__)

router = APIRouter(tags=["waitlist"])

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class WaitlistSubmissionRequest(BaseModel):
    email: str
    source: str = "pricing_page"


class WaitlistSubmissionResponse(BaseModel):
    status: str
    message: str
    email: str


def _persist_to_local_file(entry: dict) -> None:
    """Fallback / dual-write helper: append waitlist submission to local file."""
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        waitlist_file = DATA_DIR / "waitlist.jsonl"
        with open(waitlist_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception as exc:
        logger.error("Failed to write waitlist entry to local JSONL: %s", exc)


def _persist_to_firestore(entry: dict) -> bool:
    """Primary storage helper: write waitlist entry to Firestore collection `waitlist`."""
    try:
        import firebase_admin
        from firebase_admin import firestore

        app = firebase_admin.get_app()
        if not app:
            return False

        db = firestore.client()
        db.collection("waitlist").add(entry)
        logger.info("Saved waitlist email %s to Firestore", entry["email"])
        return True
    except Exception as exc:
        logger.warning("Firestore unavailable for waitlist write (using local file fallback): %s", exc)
        return False


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

    entry = {
        "email": email,
        "source": req.source.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "client_ip": request.client.host if request.client else "unknown",
    }

    # Dual persistence: Firestore (if configured) + local jsonl file
    _persist_to_firestore(entry)
    _persist_to_local_file(entry)

    return WaitlistSubmissionResponse(
        status="ok",
        message="Successfully registered for waitlist notification.",
        email=email,
    )
