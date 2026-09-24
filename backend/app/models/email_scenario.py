import uuid
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, Boolean, Enum
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.enums import ScenarioSource


class EmailScenario(Base):
    """A full email-prioritization narrative: role, operational context, and
    the priority-evaluation config (weights + rules) that governs every
    email in it. Folds the spec's separate "TaskScenario" and
    "OperationalContext" entities into one table -- they're 1:1 with each
    other, so a second table would only add a join for no benefit.
    """

    __tablename__ = "email_scenarios"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    context_description = Column(Text, nullable=False)
    # Operational context tags, e.g. ["active_deployment", "financial_closing"].
    context_tags = Column(JSON, nullable=False, default=list)
    # Scenario-wide facts the rule engine can reference directly, e.g.
    # {"active_deployment": true}. Merged with each email's own context_tags
    # (each becoming a {tag: true} fact) at evaluation time -- see
    # app/orchestrators/priority_evaluation.py's build_facts().
    context_attributes = Column(JSON, nullable=False, default=dict)
    # {"urgency": w, "business_impact": w, "operational_relevance": w,
    #  "deadline_pressure": w, "security_risk": w} -- configurable per
    # scenario, never a single global weighting.
    priority_weights = Column(JSON, nullable=False)
    # List of {"id": str, "when": {...}, "then": "CRITICAL"} rule dicts --
    # data, not code. See priority_evaluation.py's rule evaluator.
    priority_rules = Column(JSON, nullable=False, default=list)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Reproducibility (section 48): SEED for the hand-authored JSON file,
    # GENERATED for one produced by app/orchestrators/task_generation.py.
    # Either way, expected_priority/priority_score are always computed by
    # PriorityEvaluationService -- this is provenance only, never a
    # correctness signal.
    source = Column(Enum(ScenarioSource), default=ScenarioSource.SEED, nullable=False)
    # Free-text version tag for whichever content produced this scenario
    # (e.g. the seed file's own version, or the OpenAI model+prompt version
    # for a generated one) -- section 48's "scenario version" field.
    scenario_version = Column(String, nullable=True)

    email_items = relationship(
        "EmailTaskItem", back_populates="scenario", cascade="all, delete-orphan"
    )
    tasks = relationship("Task", back_populates="scenario")
