import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, Float, Boolean, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base
from app.models.enums import PriorityLevel, AccuracyLevel, ManagerTone
from sqlalchemy.orm import relationship


class EmailDecision(Base):
    """One participant's decision on one email within one task.

    The row is actually created when the email is first OPENED (GET
    .../emails/{id}), with only id/session_id/task_id/email_id/opened_at/
    expected_priority set -- selected_priority/score/accuracy_level/
    was_correct/decided_at/decision_time_ms all start out None. POST
    .../decision fills those in (first decision, 409 if already decided);
    PATCH updates them again in place on a reconsideration (change_count/
    changed_decision track that history). There is never more than one row
    per (task_id, email_id), enforced at the DB level below as the
    idempotency backstop for the API's own create-only-if-absent /
    update-only-if-present split.
    """

    __tablename__ = "email_decisions"
    __table_args__ = (UniqueConstraint("task_id", "email_id", name="uq_email_decision_task_email"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Correlation id shared across this action's InteractionMetric row,
    # ManagerMessage.trigger_context, and the WebSocket broadcast payload --
    # see app/orchestrators/email_event_pipeline.py. Debugging/research aid,
    # not load-bearing for any functionality.
    event_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False, index=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False, index=True)
    email_id = Column(UUID(as_uuid=True), ForeignKey("email_task_items.id"), nullable=False, index=True)

    initial_priority = Column(Enum(PriorityLevel), nullable=True)
    selected_priority = Column(Enum(PriorityLevel), nullable=True)
    # Copied from EmailTaskItem.expected_priority when the row is created
    # (at open time) for this row's own audit trail -- not scenario
    # duplication (the scenario/email data itself is never copied here,
    # only the one enum value this decision will be scored against).
    expected_priority = Column(Enum(PriorityLevel), nullable=False)
    score = Column(Float, nullable=True)

    opened_at = Column(DateTime, nullable=False)
    decided_at = Column(DateTime, nullable=True)
    # Server-computed from decided_at - opened_at. Never trust a
    # client-supplied duration (see app/api/email_prioritization.py).
    decision_time_ms = Column(Integer, nullable=True)

    changed_decision = Column(Boolean, default=False)
    change_count = Column(Integer, default=0)

    was_correct = Column(Boolean, nullable=True)
    accuracy_level = Column(Enum(AccuracyLevel), nullable=True)

    aria_messages_before_decision = Column(Integer, default=0)
    # The ARIA tone/state that was active immediately BEFORE this decision
    # was made (not a state ARIA moved to afterward) -- what makes a later
    # NEUTRAL -> DEMANDING before/after comparison meaningful, since each
    # decision is tagged with the regime it was made under.
    aria_supervision_level = Column(Enum(ManagerTone), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="email_decisions")
    task = relationship("Task", back_populates="email_decisions")
    email = relationship("EmailTaskItem", back_populates="decisions")
