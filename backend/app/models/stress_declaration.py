import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, Column, DateTime, Enum, Float, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.enums import ManagerTone, SessionPhase


class StressDeclaration(Base):
    """A single self-reported stress declaration (1-5 scale). Purely
    observational simulation telemetry -- never a medical/psychological
    assessment, and never the sole determinant of ARIA behavior (see
    app/orchestrators/aria_policy.py's STRESS_INCREASE trigger, which
    treats this as one signal among several, wording-only, tone
    unaffected).

    task_id/simulation_phase/aria_state are captured AT DECLARATION TIME
    (not read live later) so a later debrief can reconstruct "what was
    happening when this was declared" even after the session has moved on
    -- same reasoning as EmailDecision.aria_supervision_level.
    """

    __tablename__ = "stress_declarations"
    __table_args__ = (
        CheckConstraint("stress_level >= 1 AND stress_level <= 5", name="ck_stress_level_range"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey("sessions.id"), nullable=False)
    # Nullable -- stress may be declared between tasks, with none active.
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True)
    declared_at = Column(DateTime, default=datetime.utcnow)
    stress_level = Column(Integer, nullable=False)
    # Seconds since session.started_at at declaration time -- for
    # longitudinal analysis (a debrief plotting stress over the session's
    # timeline needs this even after the session has ended).
    elapsed_seconds = Column(Float, nullable=True)
    # Simulation phase / ARIA tone active AT THIS MOMENT -- captured, not
    # derived later, since both can advance past this point before a
    # debrief is generated. Nullable: a session that predates this column
    # (or one where the FSM hadn't evaluated yet) simply has no value here.
    simulation_phase = Column(Enum(SessionPhase), nullable=True)
    aria_state = Column(Enum(ManagerTone), nullable=True)

    session = relationship("Session", back_populates="stress_declarations")
    task = relationship("Task")
