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
