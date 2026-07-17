import uuid
from datetime import datetime

from sqlalchemy import Column, Text, DateTime, Enum, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.enums import ManagerTone


class ManagerMessage(Base):
    __tablename__ = "manager_messages"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    content = Column(Text, nullable=False)
    tone = Column(Enum(ManagerTone), default=ManagerTone.bienveillant)
    sent_at = Column(DateTime, default=datetime.utcnow)
    trigger_context = Column(JSON, nullable=True)
    is_read = Column(Boolean, default=False)

    session = relationship("Session", back_populates="manager_messages")
