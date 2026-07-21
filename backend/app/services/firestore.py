import logging
from typing import Any

logger = logging.getLogger(__name__)

_firestore_db: Any = None
_firestore_checked: bool = False


def get_firestore_client() -> Any:
    """Retrieve shared Firestore DB client, falling back to None if unavailable."""
    global _firestore_db, _firestore_checked
    if _firestore_checked:
        return _firestore_db

    _firestore_checked = True
    try:
        import firebase_admin
        from firebase_admin import firestore
        firebase_admin.get_app()
        _firestore_db = firestore.client()
        logger.info("Firestore client initialized successfully")
    except Exception as e:
        logger.warning(f"Firestore could not be initialized, falling back to local memory: {e}")
    return _firestore_db
