"""Computes a fresh PerformanceSnapshot for a session by querying the DB directly.

No caching — task volume per session is small enough that recomputing on
every call is simpler and cheap enough to not be worth the staleness risk.
"""
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session as DBSession

from app.models.email_decision import EmailDecision
from app.models.enums import TaskStatus
from app.models.interaction_metric import InteractionMetric
from app.models.stress_declaration import StressDeclaration
from app.models.task import Task

DEFAULT_AVG_SCORE = 70.0


@dataclass
class PerformanceSnapshot:
    avg_score: float
    consecutive_errors: int
    declared_stress: Optional[int]
    tasks_completed_in_session: int
    window_size: int
    # Stress Declaration feature: the declaration immediately before the
    # current one, and the deterministic delta between them. Both None
    # until a second declaration exists -- never fabricated (section 11's
    # explicit "do not fabricate a previous value").
    previous_declared_stress: Optional[int] = None
    stress_change: Optional[int] = None


def _last_two_declared_stress(db: DBSession, session_id: uuid.UUID) -> tuple:
    """(latest, previous) stress_level values, most-recent first. No
    decay/expiry -- whatever was last declared stays in effect
    indefinitely, so "current" is just the single most recent row, and
    "previous" is simply the one before it."""
    rows = (
        db.query(StressDeclaration)
        .filter(StressDeclaration.session_id == session_id)
        .order_by(StressDeclaration.declared_at.desc())
        .limit(2)
        .all()
    )
    latest = rows[0].stress_level if len(rows) >= 1 else None
    previous = rows[1].stress_level if len(rows) >= 2 else None
    return latest, previous


def get_performance_snapshot(
    db: DBSession, session_id: uuid.UUID, window_size: int = 4
) -> PerformanceSnapshot:
    completed_filter = (Task.session_id == session_id, Task.status == TaskStatus.completed)

    declared_stress, previous_declared_stress = _last_two_declared_stress(db, session_id)
    stress_change = (
        declared_stress - previous_declared_stress
        if declared_stress is not None and previous_declared_stress is not None
        else None
    )
    tasks_completed_in_session = db.query(Task).filter(*completed_filter).count()

    # Most-recent-first — required for consecutive_errors, which walks
    # backwards from "now" and stops at the first clean task.
    recent_tasks = (
        db.query(Task)
        .filter(*completed_filter)
        .order_by(Task.completed_at.desc())
        .limit(window_size)
        .all()
    )

    if not recent_tasks:
        return PerformanceSnapshot(
            avg_score=DEFAULT_AVG_SCORE,
            consecutive_errors=0,
            declared_stress=declared_stress,
            tasks_completed_in_session=0,
            window_size=0,
            previous_declared_stress=previous_declared_stress,
            stress_change=stress_change,
        )

    # A null content_score means this task's type has no scorer yet (not
    # every family is built out). Excluded from the average entirely —
    # treating a missing score as 0 would unfairly tank it.
    scored_values = [t.content_score for t in recent_tasks if t.content_score is not None]
    avg_score = (sum(scored_values) / len(scored_values)) if scored_values else DEFAULT_AVG_SCORE

    # Walk backwards from the most recent task, counting errors, and STOP at
    # the first task that's actually clean (error_count == 0). This is a
    # streak, not a sum — "how many errors in the window" is a different,
    # less useful signal. A task with a null error_count (unscored) is
    # neither confirmed erroneous nor confirmed clean, so it's skipped
    # without breaking the streak — we just don't know about it either way.
    consecutive_errors = 0
    for task in recent_tasks:
        if task.error_count is None:
            continue
        if task.error_count > 0:
            consecutive_errors += 1
        else:
            break

    return PerformanceSnapshot(
        avg_score=round(avg_score, 1),
        consecutive_errors=consecutive_errors,
        declared_stress=declared_stress,
        tasks_completed_in_session=tasks_completed_in_session,
        window_size=len(recent_tasks),
        previous_declared_stress=previous_declared_stress,
        stress_change=stress_change,
    )


# ── ARIA v2: the fuller metrics set the simulation FSM / trigger engine /
# prompt builder need (section 11). Builds ON TOP of get_performance_
# snapshot above rather than duplicating it -- the two lifetime fields
# (avg_score, declared_stress) come straight from there.
@dataclass
class ExtendedPerformanceMetrics:
    avg_score: float
    accuracy: float  # avg_score / 100, exposed on the 0-1 scale the rest of this dataclass uses
    consecutive_errors: int
    declared_stress: Optional[int]
    # Stress Declaration feature (section 11/13): feeds aria_policy.py's
    # STRESS_INCREASE trigger and app/ai/prompt_builder.py's ARIA context.
    # Both None until a second declaration exists this session.
    previous_declared_stress: Optional[int]
    stress_change: Optional[int]
    tasks_completed_in_session: int
    average_response_time: Optional[float]  # seconds, lifetime (all completed tasks)
    recent_response_time: Optional[float]  # seconds, same recent window as consecutive_errors
    error_rate: float  # fraction (0-1) of the recent window with error_count > 0
    completion_rate: Optional[float]  # completed / (completed + pending) tasks in this session
    # Reconsideration signal is currently only ever populated by
    # EmailDecision rows (Task 02) -- 0 for a session with no email-
    # prioritization task yet, honestly, not fabricated for other types.
    correction_count: int
    reconsideration_rate: float
    idle_time_seconds: float  # sum of gaps between InteractionMetric events, this session
    workload: float  # completions-per-minute across tasks + email decisions
    # Only set when a currently-active task carries a real deadline_seconds
    # -- None (not fabricated) when there's nothing to measure it against.
    remaining_time_ratio: Optional[float]


def _idle_time_seconds(timestamps: List[datetime]) -> float:
    ordered = sorted(timestamps)
    return sum(
        max(0.0, (b - a).total_seconds()) for a, b in zip(ordered, ordered[1:])
    )


def get_extended_performance_metrics(
    db: DBSession, session_id: uuid.UUID, window_size: int = 4
) -> ExtendedPerformanceMetrics:
    snapshot = get_performance_snapshot(db, session_id, window_size=window_size)

    completed_filter = (Task.session_id == session_id, Task.status == TaskStatus.completed)
    all_completed = db.query(Task).filter(*completed_filter).order_by(Task.completed_at.desc()).all()
    recent = all_completed[:window_size]

    def _avg_time(tasks: List[Task]) -> Optional[float]:
        times = [t.time_taken_seconds for t in tasks if t.time_taken_seconds is not None]
        return round(sum(times) / len(times), 1) if times else None

    error_rate = 0.0
    if recent:
        scored = [t for t in recent if t.error_count is not None]
        if scored:
            error_rate = round(sum(1 for t in scored if t.error_count > 0) / len(scored), 3)

    pending_count = (
        db.query(Task).filter(Task.session_id == session_id, Task.status != TaskStatus.completed).count()
    )
    completion_rate = None
    if (snapshot.tasks_completed_in_session + pending_count) > 0:
        completion_rate = round(
            snapshot.tasks_completed_in_session / (snapshot.tasks_completed_in_session + pending_count), 3
        )

    email_decisions = db.query(EmailDecision).filter(EmailDecision.session_id == session_id).all()
    correction_count = sum(d.change_count or 0 for d in email_decisions)
    decided = [d for d in email_decisions if d.decided_at is not None]
    reconsideration_rate = (
        round(sum(1 for d in decided if d.changed_decision) / len(decided), 3) if decided else 0.0
    )

    event_timestamps = [
        row.timestamp
        for row in db.query(InteractionMetric.timestamp).filter(InteractionMetric.session_id == session_id).all()
    ]
    idle_seconds = _idle_time_seconds(event_timestamps)

    elapsed_minutes = None
    if event_timestamps:
        span = (max(event_timestamps) - min(event_timestamps)).total_seconds() / 60
        elapsed_minutes = span if span > 0 else None
    completions = snapshot.tasks_completed_in_session + len(decided)
    workload = round(completions / elapsed_minutes, 2) if elapsed_minutes else 0.0

    # remaining_time_ratio: only meaningful against a currently in-flight
    # task with a real deadline -- computed by the caller (which has the
    # active Task in hand already) and passed through simulation_fsm.py's
    # facts dict instead of re-queried here, to avoid this function needing
    # to guess "which task is current" on its own. Left None here;
    # simulation_fsm.evaluate() fills it in from its own caller-supplied
    # task context when available.
    return ExtendedPerformanceMetrics(
        avg_score=snapshot.avg_score,
        accuracy=round(snapshot.avg_score / 100, 3),
        consecutive_errors=snapshot.consecutive_errors,
        declared_stress=snapshot.declared_stress,
        previous_declared_stress=snapshot.previous_declared_stress,
        stress_change=snapshot.stress_change,
        tasks_completed_in_session=snapshot.tasks_completed_in_session,
        average_response_time=_avg_time(all_completed),
        recent_response_time=_avg_time(recent),
        error_rate=error_rate,
        completion_rate=completion_rate,
        correction_count=correction_count,
        reconsideration_rate=reconsideration_rate,
        idle_time_seconds=round(idle_seconds, 1),
        workload=workload,
        remaining_time_ratio=None,
    )
