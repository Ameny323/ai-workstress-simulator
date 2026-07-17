import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class PerformanceIndicator(Base):
    __tablename__ = "performance_indicators"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    computed_at = Column(DateTime, default=datetime.utcnow)
    productivity_index = Column(Float)
    cognitive_load = Column(Float)
    fatigue_score = Column(Float)
    average_response_time = Column(Float)
    error_rate = Column(Float)

    session = relationship("Session", back_populates="performance_indicators")
