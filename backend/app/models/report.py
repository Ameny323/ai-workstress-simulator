import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(
        UUID(as_uuid=True), ForeignKey("sessions.id"), unique=True, nullable=False
    )
    generated_at = Column(DateTime, default=datetime.utcnow)
    global_stress_score = Column(Float)
    fatigue_score = Column(Float)
    productivity_score = Column(Float)
    pdf_url = Column(String, nullable=True)

    session = relationship("Session", back_populates="report")
    recommendations = relationship(
        "Recommendation", back_populates="report", cascade="all, delete-orphan"
    )
