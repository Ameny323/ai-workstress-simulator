import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, Integer, Float, Boolean, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.enums import PriorityLevel


class EmailTaskItem(Base):
    """One email within an EmailScenario.

    priority_score / expected_priority / triggered_rules /
    evaluation_rationale / priority_boundary_proximity are computed ONCE,
    deterministically, by PriorityEvaluationService at seed time (see
    backend/seeds/load_email_scenarios.py) -- they are the answer key, and
    are therefore never included in any schema returned to a participant
    (EmailSummaryOut / EmailDetailOut). Only exposed via the internal
    results/analysis path once a task is complete.
    """

    __tablename__ = "email_task_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scenario_id = Column(UUID(as_uuid=True), ForeignKey("email_scenarios.id"), nullable=False, index=True)

    sender = Column(String, nullable=False)
    sender_role = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    received_at = Column(DateTime, nullable=True)
    # Descriptive, not a strict timestamp -- e.g. "17:00 today -- regulatory
    # deadline". There's no real absolute deadline concept needed for a
    # scenario-day narrative; deadline_pressure (below) is the numeric factor
    # actually used for scoring.
    deadline = Column(Text, nullable=True)
    has_attachment = Column(Boolean, default=False)
    attachments = Column(JSON, nullable=False, default=list)

    # Each 0-5, assigned directly at seed time (not derived from tags).
    urgency = Column(Integer, nullable=False)
    business_impact = Column(Integer, nullable=False)
    operational_relevance = Column(Integer, nullable=False)
    deadline_pressure = Column(Integer, nullable=False)
    security_risk = Column(Integer, nullable=False)

    # e.g. ["production_outage", "client", "active_deployment"] -- merged
    # into the rule engine's per-email facts dict as {tag: true}.
    context_tags = Column(JSON, nullable=False, default=list)

    # --- Answer key (internal-only, see class docstring) ---
    priority_score = Column(Float, nullable=True)
    expected_priority = Column(Enum(PriorityLevel), nullable=True)
    triggered_rules = Column(JSON, nullable=True)
    evaluation_rationale = Column(Text, nullable=True)
    # How close priority_score sits to a scoring-band edge (25/50/75), 0-1.
    # Named for what it measures (boundary proximity), not a claim that the
    # email itself is "ambiguous". See priority_evaluation.py for the exact
    # formula.
    priority_boundary_proximity = Column(Float, nullable=True)

    scenario = relationship("EmailScenario", back_populates="email_items")
    decisions = relationship("EmailDecision", back_populates="email", cascade="all, delete-orphan")
