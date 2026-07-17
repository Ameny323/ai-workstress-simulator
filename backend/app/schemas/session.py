import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.enums import SessionPhase, SessionStatus


class SessionOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    started_at: datetime
    ended_at: Optional[datetime]
    current_phase: SessionPhase
    status: SessionStatus

    class Config:
        from_attributes = True
