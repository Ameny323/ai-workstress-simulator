import uuid
from datetime import datetime

from sqlalchemy import Column, Text, DateTime, Enum, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.enums import GenerationType, ManagerTone


class ManagerMessage(Base):
    __tablename__ = "manager_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    content = Column(Text, nullable=False)
    tone = Column(Enum(ManagerTone), default=ManagerTone.bienveillant)
    sent_at = Column(DateTime, default=datetime.utcnow)
    trigger_context = Column(JSON, nullable=True)
    is_read = Column(Boolean, default=False)
    # True when this message came from the hardcoded fallback templates
    # (OpenAI call failed, timed out, or no key configured) rather than a
    # real model response. Kept for backward compatibility with existing
    # readers; generation_type below is the richer, preferred field.
    was_fallback = Column(Boolean, default=False)
    # ARIA v2 (section 33): LLM / FALLBACK / SYSTEM -- lets the debrief
    # answer "how much of this session's supervision was real AI-generated
    # text vs. template fallback". Always kept consistent with was_fallback
    # (generation_type=FALLBACK iff was_fallback=True), written by the two
    # event pipelines (email_event_pipeline.py, aria_pipeline.py) at
    # reservation time (FALLBACK) and upgraded to LLM in their respective
    # background jobs if OpenAI succeeds.
    generation_type = Column(Enum(GenerationType), default=GenerationType.FALLBACK, nullable=False)

    session = relationship("Session", back_populates="manager_messages")
