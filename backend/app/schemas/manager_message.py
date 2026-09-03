import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel

from app.models.enums import ManagerTone


class ManagerMessageOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    content: str
    tone: ManagerTone
    sent_at: datetime
    trigger_context: Optional[Dict[str, Any]]
    was_fallback: bool
    is_read: bool

    class Config:
        from_attributes = True
