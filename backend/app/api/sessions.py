import logging
import uuid
from dataclasses import asdict
from datetime import datetime
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.api.deps import get_current_user
from app.core.config import STRESS_DECLARATION_MIN_INTERVAL_SECONDS
from app.core.sequence_config import DEFAULT_MAX_DURATION_SECONDS, DEFAULT_TASK_SEQUENCE
from app.models.enums import SessionPhase, SessionStatus, TaskStatus
from app.models.manager_message import ManagerMessage
from app.models.task import Task
from app.models.user import User
from app.models.session import Session as SessionModel
from app.models.stress_declaration import StressDeclaration
from app.orchestrators import aria_pipeline
from app.orchestrators.performance_tracker import get_performance_snapshot
from app.orchestrators.email_event_pipeline import _broadcast_sync_safe
from app.recommendations.engine import generate_recommendations
from app.reports.aggregation import compute_stress_summary, get_session_report_data
from app.reports.behavioral_evaluation import compute_behavioral_evaluation
from app.reports.cognitive_load import compute_cognitive_load_estimate
from app.reports.fatigue import compute_fatigue_score
from app.reports.productivity import compute_productivity_index
from app.schemas.manager_message import ManagerMessageOut
from app.schemas.performance_snapshot import PerformanceSnapshotOut
from app.schemas.session import SessionOut, StressDeclarationCreate, StressDeclarationOut
from app.schemas.session_report import BehavioralMetricsOut, SessionAnalyticsOut, TypingMetricsSummaryOut

logger = logging.getLogger(__name__)

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
    # Sequential simulation flow: the ordered task list and global time
    # ceiling are stamped onto the session ONCE, here, from the backend's
    # own configurable defaults (sequence_config.py) -- never chosen or
    # sent by the frontend, and never mutated after creation.
    session = SessionModel(
        user_id=current_user.id,
        task_sequence=list(DEFAULT_TASK_SEQUENCE),
        task_sequence_position=0,
        max_duration_seconds=DEFAULT_MAX_DURATION_SECONDS,
    )
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


@router.post("/{session_id}/stress", response_model=StressDeclarationOut, status_code=status.HTTP_201_CREATED)
def declare_stress(
    session_id: uuid.UUID,
    payload: StressDeclarationCreate,
    background_tasks: BackgroundTasks,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Insert a new self-reported stress declaration (1-5 scale). Never
    overwrites -- the "current" value is whichever row is most recent,
    read fresh by get_performance_snapshot. No decay/expiry: the last
    value reported stays in effect indefinitely.

    This is observational simulation telemetry, not a medical assessment:
    it never determines task correctness, never directly sets an ARIA
    state, and never touches FSM phase. It enters the SAME telemetry ->
    performance-metrics -> ARIA-trigger-engine pipeline every other event
    in this system already goes through (see app/orchestrators/
    aria_pipeline.py) -- a stress increase can surface the existing
    STRESS_INCREASE trigger, but the FSM's own tone decision, made first
    and independently, is never overridden by it.
    """
    session = get_owned_session(session_id, db, current_user)

    # Fixed gap (Result-Determination audit, Part P #1): current_phase can
    # already be `debriefing` -- the sequential flow's own next-task 409
    # (sequence complete / global timeout) sets it -- well before /end sets
    # status=completed. Checking status alone left a window where a
    # participant whose simulation had already finished could still declare
    # stress. Both checks are needed: status catches an ended/abandoned
    # session, current_phase catches a still-in_progress session whose
    # simulation content is already over.
    if session.status != SessionStatus.in_progress or session.current_phase == SessionPhase.debriefing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session is not active; stress can only be declared during an active session",
        )

    last = (
        db.query(StressDeclaration)
        .filter(StressDeclaration.session_id == session_id)
        .order_by(StressDeclaration.declared_at.desc())
        .first()
    )
    now = datetime.utcnow()
    if last is not None:
        seconds_since_last = (now - last.declared_at).total_seconds()
        if seconds_since_last < STRESS_DECLARATION_MIN_INTERVAL_SECONDS:
            retry_in = int(STRESS_DECLARATION_MIN_INTERVAL_SECONDS - seconds_since_last)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Your previous stress level was recorded recently. You can update it again in {retry_in} seconds.",
            )

    # Stress may be declared between tasks -- task_id is nullable by
    # design (section 6). Reuses the exact "currently active task" notion
    # app/api/tasks.py already uses (pending/in_progress).
    active_task = (
        db.query(Task)
        .filter(Task.session_id == session_id, Task.status.in_([TaskStatus.pending, TaskStatus.in_progress]))
        .order_by(Task.assigned_at.desc())
        .first()
    )
    elapsed_seconds = max(0.0, (now - session.started_at).total_seconds())

    declaration = StressDeclaration(
        session_id=session_id,
        task_id=active_task.id if active_task else None,
        stress_level=payload.stress_level,
        declared_at=now,
        elapsed_seconds=elapsed_seconds,
        simulation_phase=session.current_phase,
        aria_state=session.current_manager_tone,
    )
    db.add(declaration)
    db.commit()
    db.refresh(declaration)

    previous_stress_level = last.stress_level if last is not None else None
    stress_change = (
        declaration.stress_level - previous_stress_level if previous_stress_level is not None else None
    )

    logger.info("Stress declaration recorded: session=%s level=%s", session_id, declaration.stress_level)

    _broadcast_sync_safe(session_id, {
        "type": "stress_declared",
        "session_id": str(session_id),
        "stress_level": declaration.stress_level,
        "timestamp": declaration.declared_at.isoformat(),
        "previous_stress_level": previous_stress_level,
        "stress_change": stress_change,
    })

    # Routes through the EXISTING generic ARIA pipeline -- telemetry
    # (InteractionMetric), FSM re-evaluation, the trigger engine (which can
    # now see declared_stress/previous_declared_stress -- see
    # performance_tracker.py and aria_pipeline.py's own facts dict), and
    # the same fallback-safe OpenAI upgrade every other event uses. task
    # may legitimately be None (stress declared between tasks) -- already
    # a supported case (mercy_rule_activated/difficulty_changed do this
    # too). If OpenAI is slow/unavailable, this still returns a fallback
    # message synchronously and upgrades it in the background -- the
    # stress declaration itself is already committed above regardless.
    aria_pipeline.emit_aria_reaction(
        db, background_tasks, session, active_task, "stress_declared",
        telemetry_metadata={"stress_level": declaration.stress_level},
    )

    return StressDeclarationOut(
        id=declaration.id,
        session_id=declaration.session_id,
        task_id=declaration.task_id,
        stress_level=declaration.stress_level,
        declared_at=declaration.declared_at,
        elapsed_seconds=declaration.elapsed_seconds,
        simulation_phase=declaration.simulation_phase,
        aria_state=declaration.aria_state,
        previous_stress_level=previous_stress_level,
        stress_change=stress_change,
    )


@router.post("/{session_id}/end", response_model=SessionOut)
def end_session(
    session_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Marks a session ended: status -> completed, current_phase ->
    debriefing, ended_at -> now. task_engine.generate_next_task already
    refuses to serve tasks once current_phase is debriefing, and the
    /report endpoint gates on status == completed, so both existing and
    new consumers of these fields agree on what "ended" means. (/abandon
    below is the other way a session can leave in_progress -- deliberately
    doesn't touch current_phase, since abandoning isn't "wrapping up for a
    report".)

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


@router.post("/{session_id}/abandon", response_model=SessionOut)
def abandon_session(
    session_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Marks a session abandoned: status -> abandoned, ended_at -> now.
    current_phase is left untouched, unlike /end -- an abandoned session
    was never wrapped up for a report, and /report already gates on
    status == completed, so it correctly stays unreachable regardless of
    phase. Session/task rows aren't physically deleted, just marked --
    consistent with this project's existing soft-status-transition-only
    approach to ending a session.

    Used by the front-office cockpit's exit prompt: choosing not to keep
    an in-progress session for later calls this instead of /end.

    Same 409-not-silent-no-op behavior as /end for a session that's
    already left in_progress.
    """
    session = get_owned_session(session_id, db, current_user)

    if session.status != SessionStatus.in_progress:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Session has already ended",
        )

    session.status = SessionStatus.abandoned
    session.ended_at = datetime.utcnow()
    db.add(session)
    db.commit()
    db.refresh(session)

    return session


@router.get("/{session_id}/report", response_model=SessionAnalyticsOut)
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
    behavioral_evaluation = compute_behavioral_evaluation(db, session_id, report_data)
    recommendations = generate_recommendations(report_data, fatigue_score, behavioral_evaluation=behavioral_evaluation)

    return {
        "report_data": asdict(report_data),
        "fatigue_score": fatigue_score,
        "recommendations": [asdict(r) for r in recommendations],
        "behavioral_evaluation": asdict(behavioral_evaluation),
        "stress": compute_stress_summary(report_data),
        "productivity_index": compute_productivity_index(report_data),
        "cognitive_load_estimate": compute_cognitive_load_estimate(report_data),
        "behavioral_metrics": BehavioralMetricsOut(
            pause_count=report_data.pause_stats.pause_count,
            total_pause_duration_seconds=report_data.pause_stats.total_pause_duration_seconds,
            average_pause_duration_seconds=report_data.pause_stats.average_pause_duration_seconds,
            errors_by_type=report_data.errors_by_type,
        ),
        "typing_metrics": (
            TypingMetricsSummaryOut(
                typing_sessions_count=report_data.typing_metrics.typing_sessions_count,
                total_typing_duration_seconds=report_data.typing_metrics.total_typing_duration_seconds,
                total_character_count=report_data.typing_metrics.total_character_count,
                average_chars_per_second=report_data.typing_metrics.average_chars_per_second,
                average_typing_speed_variation=report_data.typing_metrics.average_typing_speed_variation,
                total_pause_count_during_typing=report_data.typing_metrics.total_pause_count_during_typing,
            )
            if report_data.typing_metrics is not None
            else None
        ),
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
    session = get_owned_session(session_id, db, current_user)

    snapshot = get_performance_snapshot(db, session_id, window_size=4)
    return PerformanceSnapshotOut(**asdict(snapshot), current_phase=session.current_phase)
