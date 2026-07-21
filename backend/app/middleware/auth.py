from fastapi import Header, HTTPException, status
import firebase_admin.auth


async def get_current_user(authorization: str | None = Header(None)) -> str:
    """FastAPI dependency — verifies Firebase ID token and returns uid."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid Authorization header")
    token = authorization.removeprefix("Bearer ")
    try:
        decoded = firebase_admin.auth.verify_id_token(token)
        return decoded["uid"]
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


async def get_current_user_optional(authorization: str | None = Header(None)) -> str | None:
    """FastAPI dependency — like get_current_user but returns None instead of raising.

    Used on session-scoped routes where the session may be anonymous (uid=None).
    The downstream require_session_access() call decides whether access is allowed.
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ")
    try:
        decoded = firebase_admin.auth.verify_id_token(token)
        return decoded["uid"]
    except Exception:
        return None


def require_session_access(session_id: str, uid: str | None):
    """Load a session and enforce ownership.

    Always returns 404 (never 403) to avoid leaking session existence to
    callers who do not own it.

    Policy for anonymous sessions (session.uid is None):
        Allow access — the session has not been claimed yet.
        Any caller with the session_id UUID may read/modify it until they
        call POST /api/sessions/{id}/claim to associate it with their account.

    TODO: Revisit this policy.  Fully anonymous sessions remain world-accessible
    to anyone who obtains the session_id UUID until claimed.  Consider issuing a
    short-lived signed token at upload time and requiring that token here instead.

    Parameters
    ----------
    session_id:
        The UUID from the URL path parameter.
    uid:
        The caller's Firebase uid, or None if unauthenticated.

    Returns
    -------
    SessionState
        The loaded session, for use by the route handler.

    Raises
    ------
    HTTPException(404)
        If the session does not exist, is expired, or is owned by a different uid.
    """
    # Import here to avoid circular imports at module level.
    from app.services.session import session_store

    session = session_store.get(session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    # Ownership check: if the session is claimed, only the owner may access it.
    # We return 404 rather than 403 so the response is identical to a missing
    # session — a non-owner learns nothing about whether the session exists.
    if session.uid is not None and session.uid != uid:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    return session

