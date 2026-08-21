import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, Integer, Enum, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.enums import TaskType, TaskDifficulty, SessionPhase, Priority


class TaskTemplate(Base):
    __tablename__ = "task_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    description = Column(Text)
    task_type = Column(Enum(TaskType), nullable=False)
    difficulty = Column(Enum(TaskDifficulty), nullable=False)
    phase = Column(Enum(SessionPhase), nullable=False)
    estimated_duration = Column(Integer, nullable=False)
    default_priority = Column(Enum(Priority), default=Priority.medium)
    instructions = Column(Text)
    # "metadata" is reserved on the declarative Base, so the Python attribute
    # is named metadata_json while the actual database column stays "metadata".
    metadata_json = Column("metadata", JSON, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    tasks = relationship("Task", back_populates="template")
