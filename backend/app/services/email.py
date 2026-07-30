import logging
import smtplib
from email.message import EmailMessage

from app.config import (
    SMTP_FROM_EMAIL,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USER,
)

logger = logging.getLogger(__name__)


def send_approval_email(to_email: str) -> bool:
    """Send a transactional approval email to a user who has been granted waitlist access.

    If SMTP credentials are configured, sends an email via SMTP.
    Otherwise, logs the email content for dev/testing without raising an error.
    """
    subject = "You're in! Welcome to Glasswork"
    body = (
        f"Hi there,\n\n"
        f"Great news — your access to Glasswork has been approved!\n\n"
        f"You can log in now and start building pipelines: https://app.glasswork.ai\n\n"
        f"Best,\n"
        f"The Glasswork Team"
    )

    if not SMTP_HOST:
        logger.info(
            "[EMAIL FALLBACK] Waitlist approval email for %s:\nSubject: %s\nBody:\n%s",
            to_email,
            subject,
            body,
        )
        return True

    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM_EMAIL
        msg["To"] = to_email
        msg.set_content(body)

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.starttls()
            if SMTP_USER and SMTP_PASSWORD:
                server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)

        logger.info("Sent waitlist approval email via SMTP to %s", to_email)
        return True
    except Exception as exc:
        logger.error("Failed to send approval email via SMTP to %s: %s", to_email, exc)
        return False
