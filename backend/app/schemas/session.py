import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.models.enums import ManagerTone, SessionPhase, SessionStatus


class SessionOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    started_at: datetime
    ended_at: Optional[datetime]
    current_phase: SessionPhase
    status: SessionStatus
    # Additive fields for the simulation-history/resume feature: these
    # already exist on the ORM Session row (see app/models/session.py) and
    # are populated automatically via from_attributes -- exposing them here
    # lets a history list show "N/6 tasks" progress per session without a
    # second endpoint. Both nullable since a legacy/manual session may
    # predate the sequential-flow feature and simply have no sequence.
    task_sequence_position: Optional[int] = None
    task_sequence: Optional[List[str]] = None

    class Config:
        from_attributes = True


class StressDeclarationCreate(BaseModel):
    """Self-reported, observational simulation signal -- 1 (Calm) to 5
    (Extreme pressure). Never a medical/psychological assessment. The
    backend never trusts the frontend beyond this range check."""
    stress_level: int = Field(..., ge=1, le=5)


class StressDeclarationOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    task_id: Optional[uuid.UUID]
    stress_level: int
    declared_at: datetime
    elapsed_seconds: Optional[float]
    simulation_phase: Optional[SessionPhase]
    aria_state: Optional[ManagerTone]
    # Deterministic, backend-computed -- never null-vs-zero ambiguous.
    # None only when this is genuinely the first declaration this session.
    previous_stress_level: Optional[int] = None
    stress_change: Optional[int] = None

    class Config:
        from_attributes = True
