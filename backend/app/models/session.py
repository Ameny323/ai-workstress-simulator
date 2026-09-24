import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.enums import ManagerTone, SessionPhase, SessionStatus


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    current_phase = Column(Enum(SessionPhase), default=SessionPhase.accueil)
    status = Column(Enum(SessionStatus), default=SessionStatus.in_progress)
    # Difficulty-pool cooldown state (see app/orchestrators/task_engine.py's
    # resolve_difficulty_pool_with_cooldown). Persisted so it survives a
    # server restart mid-session, since the pool is re-evaluated on every
    # single task completion rather than cached in memory.
    last_difficulty_pool = Column(JSON, nullable=True)
    difficulty_pool_set_at_task_count = Column(Integer, nullable=True)

    # ARIA v2 (SimulationStateMachine, app/orchestrators/simulation_fsm.py):
    # the FSM's own persisted state, same "survive a restart, don't cache
    # in memory" rationale as the difficulty-pool fields above.
    # current_manager_tone is the FSM's last-decided tone (distinct from
    # current_phase, which is the simulation phase -- see the spec's own
    # explicit "these are different state machines" framing).
    current_manager_tone = Column(Enum(ManagerTone), nullable=True)
    # A short rolling window of recent raw pressure-band votes (see
    # aria_config.PRESSURE_HISTORY_WINDOW), used to implement asymmetric
    # hysteresis: [{"tone": "exigeant", "at": "<iso timestamp>"}, ...].
    # Same JSON-on-the-session-row pattern as last_difficulty_pool.
    pressure_history = Column(JSON, nullable=True)

    # Sequential simulation flow: the backend-authoritative, ordered list of
    # TaskType VALUES (plain strings, e.g. ["data_validation",
    # "data_validation", "document_organization", ...]) this session must
    # produce, set once at creation from app/core/sequence_config.py's
    # configurable default -- never chosen or reordered by the frontend.
    # Nullable so a session predating this feature (or a legacy/manual
    # session) simply has no sequence and next-task falls back to its old,
    # unrestricted behavior rather than crashing on a missing value.
    task_sequence = Column(JSON, nullable=True)
    # Index into task_sequence of the currently-active task -- advances by
    # exactly 1 on each real completion (app/api/tasks.py's submit_task),
    # never on a duplicate/rejected completion attempt. Same "persist small
    # session-scoped position state as a plain column" pattern as
    # difficulty_pool_set_at_task_count above.
    task_sequence_position = Column(Integer, nullable=False, default=0)
    # Global simulation duration, seconds. Nullable = no global time limit
    # enforced (legacy/manual sessions). Checked against started_at
    # (already existing) -- no separate timer/clock is introduced.
    max_duration_seconds = Column(Integer, nullable=True)

    user = relationship("User", back_populates="sessions")
    tasks = relationship(
        "Task", back_populates="session", cascade="all, delete-orphan"
    )
    manager_messages = relationship(
        "ManagerMessage", back_populates="session", cascade="all, delete-orphan"
    )
    interaction_metrics = relationship(
        "InteractionMetric", back_populates="session", cascade="all, delete-orphan"
    )
    stress_declarations = relationship(
        "StressDeclaration", back_populates="session", cascade="all, delete-orphan"
    )
    performance_indicators = relationship(
        "PerformanceIndicator", back_populates="session", cascade="all, delete-orphan"
    )
    report = relationship(
        "Report", back_populates="session", uselist=False, cascade="all, delete-orphan"
    )
    email_decisions = relationship(
        "EmailDecision", back_populates="session", cascade="all, delete-orphan"
    )
