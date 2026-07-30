import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.config import DATA_DIR
from app.models.waitlist import WaitlistEntry, WaitlistStatus
from app.services.email import send_approval_email
from app.services.firestore import get_firestore_client

logger = logging.getLogger(__name__)


class WaitlistStore:
    def __init__(self) -> None:
        self._entries_by_email: Dict[str, WaitlistEntry] = {}
        self._entries_by_id: Dict[str, WaitlistEntry] = {}
        self._load_local_entries()

    def _get_firestore(self):
        return get_firestore_client()

    def _load_local_entries(self) -> None:
        """Load local JSONL file entries into in-memory cache on startup."""
        try:
            waitlist_file = DATA_DIR / "waitlist.jsonl"
            if waitlist_file.exists():
                with open(waitlist_file, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                            entry = self._dict_to_entry(data)
                            self._cache_entry(entry)
                        except Exception as e:
                            logger.warning("Failed to parse waitlist line from JSONL: %s", e)
        except Exception as exc:
            logger.warning("Failed to load local waitlist JSONL: %s", exc)

    def _cache_entry(self, entry: WaitlistEntry) -> None:
        self._entries_by_email[entry.email.lower()] = entry
        self._entries_by_id[entry.id] = entry

    def _entry_to_dict(self, entry: WaitlistEntry) -> dict:
        return {
            "id": entry.id,
            "email": entry.email.lower(),
            "use_case": entry.use_case,
            "source": entry.source,
            "status": entry.status.value if isinstance(entry.status, WaitlistStatus) else str(entry.status),
            "created_at": entry.created_at,
            "approved_at": entry.approved_at,
            "client_ip": entry.client_ip,
        }

    def _dict_to_entry(self, data: dict) -> WaitlistEntry:
        raw_status = data.get("status", "pending")
        try:
            status_enum = WaitlistStatus(raw_status)
        except ValueError:
            status_enum = WaitlistStatus.PENDING

        entry_id = data.get("id") or uuid.uuid4().hex
        return WaitlistEntry(
            id=entry_id,
            email=data["email"].lower(),
            use_case=data.get("use_case"),
            source=data.get("source", "landing_page"),
            status=status_enum,
            created_at=data.get("created_at") or datetime.now(timezone.utc).isoformat(),
            approved_at=data.get("approved_at"),
            client_ip=data.get("client_ip", "unknown"),
        )

    def _persist_entry(self, entry: WaitlistEntry) -> None:
        """Persist entry to Firestore (if available) and append/sync to local JSONL file."""
        entry_dict = self._entry_to_dict(entry)
        self._cache_entry(entry)

        # 1. Firestore
        db = self._get_firestore()
        if db:
            try:
                db.collection("waitlist").document(entry.id).set(entry_dict)
                logger.info("Persisted waitlist entry for %s to Firestore", entry.email)
            except Exception as e:
                logger.warning("Firestore write failed for waitlist (%s): %s", entry.email, e)

        # 2. Local JSONL append / sync
        try:
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            waitlist_file = DATA_DIR / "waitlist.jsonl"
            with open(waitlist_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry_dict) + "\n")
        except Exception as exc:
            logger.error("Failed to append waitlist entry to JSONL: %s", exc)

    def add_or_update_submission(
        self,
        email: str,
        use_case: Optional[str] = None,
        source: str = "landing_page",
        client_ip: str = "unknown",
    ) -> WaitlistEntry:
        email_clean = email.strip().lower()
        existing = self.get_entry_by_email(email_clean)

        if existing:
            # Preserve status if already approved, update use_case if provided
            if use_case:
                existing.use_case = use_case
            if source:
                existing.source = source
            self._persist_entry(existing)
            return existing

        new_entry = WaitlistEntry(
            id=uuid.uuid4().hex,
            email=email_clean,
            use_case=use_case,
            source=source,
            status=WaitlistStatus.PENDING,
            created_at=datetime.now(timezone.utc).isoformat(),
            client_ip=client_ip,
        )
        self._persist_entry(new_entry)
        return new_entry

    def get_entry_by_email(self, email: str) -> Optional[WaitlistEntry]:
        if not email:
            return None

        email_clean = email.strip().lower()
        if email_clean in self._entries_by_email:
            return self._entries_by_email[email_clean]

        db = self._get_firestore()
        if db:
            try:
                docs = db.collection("waitlist").where("email", "==", email_clean).limit(1).stream()
                for doc in docs:
                    entry = self._dict_to_entry(doc.to_dict())
                    self._cache_entry(entry)
                    return entry
            except Exception as e:
                logger.error("Failed to fetch waitlist entry for %s from Firestore: %s", email, e)

        return None

    def get_entry_by_id_or_email(self, identifier: str) -> Optional[WaitlistEntry]:
        if not identifier:
            return None

        ident_clean = identifier.strip()
        if ident_clean in self._entries_by_id:
            return self._entries_by_id[ident_clean]

        by_email = self.get_entry_by_email(ident_clean)
        if by_email:
            return by_email

        db = self._get_firestore()
        if db:
            try:
                doc = db.collection("waitlist").document(ident_clean).get()
                if doc.exists:
                    entry = self._dict_to_entry(doc.to_dict())
                    self._cache_entry(entry)
                    return entry
            except Exception as e:
                logger.error("Failed to get waitlist entry by ID %s: %s", ident_clean, e)

        return None

    def approve_entry(self, identifier: str) -> Optional[WaitlistEntry]:
        entry = self.get_entry_by_id_or_email(identifier)
        if not entry:
            return None

        entry.status = WaitlistStatus.APPROVED
        entry.approved_at = datetime.now(timezone.utc).isoformat()
        self._persist_entry(entry)

        # Trigger approval email
        send_approval_email(entry.email)
        return entry

    def list_entries(self) -> List[WaitlistEntry]:
        return list(self._entries_by_email.values())


waitlist_store = WaitlistStore()
