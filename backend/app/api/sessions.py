import uuid
from dataclasses import asdict
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.api.deps import get_current_user
from app.models.enums import SessionPhase, SessionStatus
from app.models.manager_message import ManagerMessage
from app.models.user import User
from app.models.session import Session as SessionModel
from app.models.stress_declaration import StressDeclaration
from app.orchestrators.performance_tracker import get_performance_snapshot
from app.recommendations.engine import generate_recommendations
from app.reports.aggregation import get_session_report_data
from app.reports.fatigue import compute_fatigue_score
from app.schemas.manager_message import ManagerMessageOut
from app.schemas.performance_snapshot import PerformanceSnapshotOut
from app.schemas.session import SessionOut, StressOut, StressUpdate

router = APIRouter()


def get_owned_session(
    session_id: uuid.UUID, db: DBSession, current_user: User
) -> SessionModel:
    """Fetch a session and make sure it belongs to the current user."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this session",
        )
    return session


@router.post("/", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def start_session(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = SessionModel(user_id=current_user.id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/", response_model=List[SessionOut])
def list_my_sessions(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(SessionModel)
        .filter(SessionModel.user_id == current_user.id)
        .order_by(SessionModel.started_at.desc())
        .all()
    )


@router.post("/{session_id}/stress", response_model=StressOut, status_code=status.HTTP_201_CREATED)
def declare_stress(
    session_id: uuid.UUID,
    payload: StressUpdate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Insert a new stress declaration. Never overwrites — the "current"
    value is whichever row is most recent, read fresh by
    get_performance_snapshot. No decay/expiry: the last value reported
    stays in effect indefinitely.
    """
    get_owned_session(session_id, db, current_user)

    declaration = StressDeclaration(session_id=session_id, stress_level=payload.stress)
    db.add(declaration)
    db.commit()
    db.refresh(declaration)

    return {"stress": declaration.stress_level, "declared_at": declaration.declared_at}


@router.post("/{session_id}/end", response_model=SessionOut)
def end_session(
    session_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Marks a session ended: status -> completed, current_phase ->
    debriefing, ended_at -> now. Nothing else in this codebase writes to
    any of these three columns, so this is the only place a session can
    ever leave `in_progress`/`accueil` -- task_engine.generate_next_task
    already refuses to serve tasks once current_phase is debriefing, and
    the /report endpoint gates on status == completed, so both existing
    and new consumers of these fields agree on what "ended" means.

    409, not a silent no-op, on a session that's already ended -- calling
    /end twice most likely means a client-side bug (e.g. a double-fired
    button), and it's more useful to surface that than to hide it.
    """
    session = get_owned_session(session_id, db, current_user)

    if session.status != SessionStatus.in_progress:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session has already ended",
        )

    session.status = SessionStatus.completed
    session.current_phase = SessionPhase.debriefing
    session.ended_at = datetime.utcnow()
    db.add(session)
    db.commit()
    db.refresh(session)

    return session


@router.get("/{session_id}/report")
def get_session_report(
    session_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Gated on status == completed, not current_phase == debriefing --
    status is the field /end sets and never unsets, so it's the more
    durable of the two signals to check (current_phase could in principle
    be reused for other transitions later; status completed specifically
    means "this session is over"). Requested mid-session, the
    first/second-half split in report_data would just be "the last couple
    tasks vs everything before" -- not a meaningful trend -- so this
    blocks the report entirely rather than serving a misleading one.

    409, not 403: this isn't an authorization failure (get_owned_session
    already handles that, above, with 403/404) -- the requester is
    entitled to this session's report, it's just not ready yet. 409
    Conflict matches /end's own guard just above, for the same reason:
    the request conflicts with the session's current state, not with who's
    asking.
    """
    session = get_owned_session(session_id, db, current_user)

    if session.status != SessionStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session has not ended yet; report is not available until the session ends",
        )

    report_data = get_session_report_data(db, session_id)
    fatigue_score = compute_fatigue_score(report_data)
    recommendations = generate_recommendations(report_data, fatigue_score)

    return {
        "report_data": asdict(report_data),
        "fatigue_score": fatigue_score,
        "recommendations": recommendations,
    }


@router.get("/{session_id}/manager-messages", response_model=List[ManagerMessageOut])
def list_manager_messages(
    session_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read-only: returns ARIA's persisted messages for this session. Pure
    read of what app/ai/manager_service.py already writes -- no new
    business logic, no scoring. Ordered oldest-first, matching how a
    conversation log reads.

    Note for callers: GET /sessions/{id}/next-task schedules message
    generation as a BackgroundTasks job that runs *after* that request's
    response is sent, so a message triggered by a given task-fetch is not
    guaranteed to be here yet immediately afterward -- poll or delay-refetch
    rather than assuming synchronicity.
    """
    get_owned_session(session_id, db, current_user)

    return (
        db.query(ManagerMessage)
        .filter(ManagerMessage.session_id == session_id)
        .order_by(ManagerMessage.sent_at.asc())
        .all()
    )


@router.get("/{session_id}/performance-snapshot", response_model=PerformanceSnapshotOut)
def get_session_performance_snapshot(
    session_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Read-only: serializes the same PerformanceSnapshot the adaptive
    difficulty engine and ARIA's own prompt-building already compute
    internally (app/orchestrators/performance_tracker.py) -- calls the
    existing function, doesn't reimplement it.
    """
    get_owned_session(session_id, db, current_user)

    snapshot = get_performance_snapshot(db, session_id, window_size=4)
    return PerformanceSnapshotOut(**asdict(snapshot))
