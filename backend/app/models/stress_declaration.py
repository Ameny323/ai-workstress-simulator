import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class StressDeclaration(Base):
    __tablename__ = "stress_declarations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    declared_at = Column(DateTime, default=datetime.utcnow)
    stress_level = Column(Integer, nullable=False)

    session = relationship("Session", back_populates="stress_declarations")
