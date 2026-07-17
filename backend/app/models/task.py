import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, Integer, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.enums import TaskType, TaskStatus, Priority


class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    type = Column(Enum(TaskType), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    deadline = Column(DateTime)
    completed_at = Column(DateTime, nullable=True)
    status = Column(Enum(TaskStatus), default=TaskStatus.pending)
    priority = Column(Enum(Priority), default=Priority.normal)
    error_count = Column(Integer, default=0)

    session = relationship("Session", back_populates="tasks")
    interaction_metrics = relationship("InteractionMetric", back_populates="task")
