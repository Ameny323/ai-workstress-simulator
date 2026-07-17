import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship

from app.database import Base


class InteractionMetric(Base):
    __tablename__ = "interaction_metrics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
    response_time_seconds = Column(Float)
    action_type = Column(String)
    # "metadata" is reserved on the declarative Base, so the Python attribute
    # is named metadata_json while the actual database column stays "metadata".
    metadata_json = Column("metadata", JSON, nullable=True)

    session = relationship("Session", back_populates="interaction_metrics")
    task = relationship("Task", back_populates="interaction_metrics")
