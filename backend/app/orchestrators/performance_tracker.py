"""Computes a fresh PerformanceSnapshot for a session by querying the DB directly.

No caching — task volume per session is small enough that recomputing on
every call is simpler and cheap enough to not be worth the staleness risk.
"""
import uuid
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session as DBSession

from app.models.enums import TaskStatus
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


def _latest_declared_stress(db: DBSession, session_id: uuid.UUID) -> Optional[int]:
    # No decay/expiry — whatever was last declared stays in effect
    # indefinitely, so "current" is just the single most recent row.
    declaration = (
        db.query(StressDeclaration)
        .filter(StressDeclaration.session_id == session_id)
        .order_by(StressDeclaration.declared_at.desc())
        .first()
    )
    return declaration.stress_level if declaration else None


def get_performance_snapshot(
    db: DBSession, session_id: uuid.UUID, window_size: int = 4
) -> PerformanceSnapshot:
    completed_filter = (Task.session_id == session_id, Task.status == TaskStatus.completed)

    declared_stress = _latest_declared_stress(db, session_id)
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
    )
