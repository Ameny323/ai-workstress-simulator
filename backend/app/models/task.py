import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, Integer, Float, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.enums import TaskType, TaskStatus, TaskDifficulty, Priority, GenerationType


class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    template_id = Column(UUID(as_uuid=True), ForeignKey("task_templates.id"), nullable=True)
    # Email-prioritization tasks point at their EmailScenario here (a real
    # FK, mirroring how template_id already does this for template-driven
    # types) rather than burying the pointer in instance_data JSON.
    scenario_id = Column(UUID(as_uuid=True), ForeignKey("email_scenarios.id"), nullable=True)
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
    # Task-generation reproducibility (Task 03): how THIS instance's
    # content was produced. STATIC = the original deterministic generator,
    # no LLM attempted (data_validation/image_matching, and
    # document_organization tasks predating this feature). LLM = a
    # controlled OpenAI generation succeeded and passed validation.
    # FALLBACK = LLM generation was attempted but failed (timeout/
    # malformed/invalid) and the deterministic generator was used instead.
    generation_type = Column(Enum(GenerationType), default=GenerationType.STATIC, nullable=False)
    # The ARIA_PROMPT_VERSION-style tag for whichever prompt produced this
    # instance -- only set when generation_type is LLM or FALLBACK (an LLM
    # call was actually attempted); None for STATIC.
    generation_prompt_version = Column(String, nullable=True)
    # Sequential simulation flow: this task's position in its session's
    # task_sequence (Session.task_sequence_position at the moment this Task
    # was generated) -- None for task types outside the sequence
    # (email_prioritization) or for tasks created before this feature.
    # Lets app/api/tasks.py's submit_task verify "is this still the active
    # task" without re-deriving it, and lets the report show real executed
    # order directly instead of only inferring it from completed_at.
    sequence_index = Column(Integer, nullable=True)

    session = relationship("Session", back_populates="tasks")
    template = relationship("TaskTemplate", back_populates="tasks")
    scenario = relationship("EmailScenario", back_populates="tasks")
    interaction_metrics = relationship("InteractionMetric", back_populates="task")
    email_decisions = relationship("EmailDecision", back_populates="task", cascade="all, delete-orphan")
