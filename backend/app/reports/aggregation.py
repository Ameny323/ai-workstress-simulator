"""Pulls every completed Task and the full StressDeclaration history for a
session and assembles it into a plain data structure.

Pure data assembly + basic aggregate math (averages, a first/second-half
split) -- no fatigue scoring (that's fatigue.py) and no recommendation
logic (that's app/recommendations/engine.py). Deliberately not persisted:
the report is fully derivable from data that's already stored (Task,
StressDeclaration), so recomputing costs nothing and avoids old reports
silently reflecting a since-retuned fatigue formula with no way to tell
which version produced which number.
"""
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session as DBSession

from app.models.enums import TaskStatus
from app.models.session import Session as SessionModel
from app.models.stress_declaration import StressDeclaration
from app.models.task import Task


@dataclass
class StressPoint:
    value: int
    declared_at: datetime


@dataclass
class SessionReportData:
    session_id: uuid.UUID
    session_started_at: datetime
    session_ended_at: Optional[datetime]
    # SessionPhase value the session's current_phase holds right now. Not a
    # history -- there's no phase-transition log, just the (final) phase.
    phase_reached: str

    total_tasks_completed: int
    tasks_by_type: Dict[str, int]

    avg_score_overall: Optional[float]
    avg_score_first_half: Optional[float]
    avg_score_second_half: Optional[float]

    avg_time_taken_seconds_overall: Optional[float]
    avg_time_taken_seconds_first_half: Optional[float]
    avg_time_taken_seconds_second_half: Optional[float]

    error_count_trend: List[int]  # one entry per completed task, completed_at order
    stress_declarations: List[StressPoint]


def _avg(values: List[float]) -> Optional[float]:
    return round(sum(values) / len(values), 1) if values else None


def _split_half(items: List[Task]) -> Tuple[List[Task], List[Task]]:
    """First half gets the extra task on an odd count."""
    mid = (len(items) + 1) // 2
    return items[:mid], items[mid:]


def get_session_report_data(db: DBSession, session_id: uuid.UUID) -> SessionReportData:
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if session is None:
        raise ValueError(f"Session '{session_id}' not found")

    completed_tasks = (
        db.query(Task)
        .filter(Task.session_id == session_id, Task.status == TaskStatus.completed)
        .order_by(Task.completed_at.asc())
        .all()
    )

    tasks_by_type: Dict[str, int] = {}
    for t in completed_tasks:
        tasks_by_type[t.type.value] = tasks_by_type.get(t.type.value, 0) + 1

    # Excludes null content_score/time_taken_seconds from averages rather
    # than treating a missing value as 0 -- same convention as
    # performance_tracker.get_performance_snapshot, for the same reason: a
    # task type with no scorer yet (document_organization, still) having
    # content_score=None must not silently tank the average.
    scores = [t.content_score for t in completed_tasks if t.content_score is not None]
    times = [t.time_taken_seconds for t in completed_tasks if t.time_taken_seconds is not None]

    # Fewer than 2 completed tasks can't show a first-half/second-half
    # trend -- both halves report None rather than two copies of one data
    # point, which would misleadingly imply "no change" instead of "no
    # data yet."
    enough_for_trend = len(completed_tasks) >= 2
    first_half_tasks, second_half_tasks = _split_half(completed_tasks)

    def half_avg(tasks: List[Task], field_name: str) -> Optional[float]:
        if not enough_for_trend:
            return None
        vals = [getattr(t, field_name) for t in tasks if getattr(t, field_name) is not None]
        return _avg(vals)

    error_count_trend = [t.error_count or 0 for t in completed_tasks]

    stress_rows = (
        db.query(StressDeclaration)
        .filter(StressDeclaration.session_id == session_id)
        .order_by(StressDeclaration.declared_at.asc())
        .all()
    )
    stress_declarations = [
        StressPoint(value=s.stress_level, declared_at=s.declared_at) for s in stress_rows
    ]

    return SessionReportData(
        session_id=session_id,
        session_started_at=session.started_at,
        session_ended_at=session.ended_at,
        phase_reached=session.current_phase.value,
        total_tasks_completed=len(completed_tasks),
        tasks_by_type=tasks_by_type,
        avg_score_overall=_avg(scores),
        avg_score_first_half=half_avg(first_half_tasks, "content_score"),
        avg_score_second_half=half_avg(second_half_tasks, "content_score"),
        avg_time_taken_seconds_overall=_avg(times),
        avg_time_taken_seconds_first_half=half_avg(first_half_tasks, "time_taken_seconds"),
        avg_time_taken_seconds_second_half=half_avg(second_half_tasks, "time_taken_seconds"),
        error_count_trend=error_count_trend,
        stress_declarations=stress_declarations,
    )
