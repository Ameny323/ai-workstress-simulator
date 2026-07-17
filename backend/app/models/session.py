import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base
from app.models.enums import SessionPhase, SessionStatus


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    current_phase = Column(Enum(SessionPhase), default=SessionPhase.accueil)
    status = Column(Enum(SessionStatus), default=SessionStatus.in_progress)

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
