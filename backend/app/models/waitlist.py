from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class WaitlistStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class WaitlistSubmissionRequest(BaseModel):
    email: str
    use_case: Optional[str] = None
    source: str = "landing_page"


class WaitlistSubmissionResponse(BaseModel):
    status: str
    message: str
    email: str


class WaitlistEntry(BaseModel):
    id: str
    email: str
    use_case: Optional[str] = None
    source: str = "landing_page"
    status: WaitlistStatus = WaitlistStatus.PENDING
    created_at: str
    approved_at: Optional[str] = None
    client_ip: str = "unknown"
