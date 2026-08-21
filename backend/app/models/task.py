import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, Integer, Float, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.enums import TaskType, TaskStatus, TaskDifficulty, Priority


class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    template_id = Column(UUID(as_uuid=True), ForeignKey("task_templates.id"), nullable=True)
    type = Column(Enum(TaskType), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text)
    difficulty = Column(Enum(TaskDifficulty), nullable=True)
    # Generated content for template-driven tasks (e.g. the record list for a
    # data_validation task), populated by the task engine at creation time.
    instance_data = Column(JSON, nullable=True)
    # The user's raw answers as submitted to POST /tasks/{id}/complete
    # (e.g. {"flagged_ids": [3, 8]}). No scoring yet — persisted as-is.
    submission_data = Column(JSON, nullable=True)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    deadline = Column(DateTime)
    deadline_seconds = Column(Integer, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    time_taken_seconds = Column(Integer, nullable=True)
    status = Column(Enum(TaskStatus), default=TaskStatus.pending)
    priority = Column(Enum(Priority), default=Priority.medium)
    error_count = Column(Integer, default=0)
    content_score = Column(Float, nullable=True)

    session = relationship("Session", back_populates="tasks")
    template = relationship("TaskTemplate", back_populates="tasks")
    interaction_metrics = relationship("InteractionMetric", back_populates="task")
