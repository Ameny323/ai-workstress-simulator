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
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session as DBSession

from app.models.enums import TaskStatus
from app.models.interaction_metric import InteractionMetric
from app.models.manager_message import ManagerMessage
from app.models.session import Session as SessionModel
from app.models.stress_declaration import StressDeclaration
from app.models.task import Task
# Reused, not re-tuned: this is the SAME "what counts as a notable
# inactivity gap" line ARIA's own HIGH_IDLE_TIME trigger already uses
# live, during the session (app/orchestrators/aria_policy.py). A report
# defining "pause" differently from what the live simulation already
# treated as notable idle time would be an inconsistent, second
# definition of the same concept -- reuse instead of inventing one.
from app.orchestrators.aria_policy import HIGH_IDLE_SECONDS as PAUSE_THRESHOLD_SECONDS


@dataclass
class StressPoint:
    value: int
    declared_at: datetime


@dataclass
class TaskTimingSample:
    """One completed task's (used, allocated) time pair -- the raw input
    both app/reports/productivity.py's time-efficiency component and
    app/reports/cognitive_load.py's load estimate derive from. Only
    created for tasks where BOTH are real numbers (never fabricated) --
    a task with no deadline_seconds (not every task type sets one) simply
    contributes no sample, rather than a guessed one.
    """
    time_taken_seconds: float
    deadline_seconds: float


@dataclass
class TypingMetricsSummary:
    """Aggregated across every email_writing task in the session that
    captured typing telemetry (app/api/tasks.py persists one
    InteractionMetric(action_type="typing_metrics") row per submitted
    composition -- see TypingMetricsIn in app/schemas/task.py for exactly
    what each row contains: aggregate numbers only, never raw keystrokes
    or the typed text itself).
    """
    typing_sessions_count: int
    total_typing_duration_seconds: float
    total_character_count: int
    average_chars_per_second: float
    average_typing_speed_variation: float
    total_pause_count_during_typing: int


@dataclass
class TaskBreakdownItem:
    """One completed task, exactly as persisted -- no new calculation, a
    plain serialization of a Task row. This is what lets the final-report
    UI show discrete per-task samples (a real chart X-axis of "Task 1,
    Task 2, ...") and a task-level table without ever computing scores/
    times in the frontend -- the backend remains the sole source of truth,
    the UI only renders what's here.
    """
    task_id: uuid.UUID
    task_type: str
    content_score: Optional[float]
    time_taken_seconds: Optional[int]
    error_count: int
    status: str
    completed_at: Optional[datetime]
    # Sequential simulation flow: this task's real position in the
    # session's configured task_sequence (Task.sequence_index) -- None for
    # task types outside the sequence (email_prioritization) or tasks
    # predating this feature. Lets the report show "actual sequence order"
    # explicitly rather than relying on completed_at happening to match it.
    sequence_index: Optional[int] = None


@dataclass
class AriaSupervisionPoint:
    """One ManagerMessage's tone at the moment it was sent -- a real,
    already-persisted history of the FSM's tone decisions over the
    session (see Session.current_manager_tone's own docstring: the tone
    is decided live by simulation_fsm.py and stamped onto every message
    it triggers). Not a new state machine or a new log -- just a read of
    what ManagerMessage already stores, ordered by time.
    """
    tone: str
    at: datetime


@dataclass
class PauseStats:
    """A pause/idle episode is defined here as ANY gap between two
    consecutive InteractionMetric events (for this session, across all
    tasks) of at least PAUSE_THRESHOLD_SECONDS -- a technical proxy for
    "the user stopped interacting for a notable stretch," not a claim
    about psychological state. average_pause_duration_seconds is None
    (not 0) when there were no qualifying pauses -- "no pauses happened"
    and "average pause length is zero seconds" are different statements.
    """
    pause_count: int
    total_pause_duration_seconds: float
    average_pause_duration_seconds: Optional[float]


@dataclass
class SessionReportData:
    session_id: uuid.UUID
    session_started_at: datetime
    session_ended_at: Optional[datetime]
    # SessionPhase value the session's current_phase holds right now. Not a
    # history -- there's no phase-transition log, just the (final) phase.
    phase_reached: str

    total_tasks_completed: int
    # Completed + still pending/in_progress at report time -- needed for a
    # real completion_rate (previously only the completed count existed).
    total_tasks_assigned: int
    tasks_by_type: Dict[str, int]
    # Sum of error_count per task TYPE (completed tasks only) -- the
    # cahier's "nombre d'erreurs par type d'exercice." Never fabricated:
    # a task type with no scorer yet contributes 0, not a guessed value,
    # since Task.error_count defaults to 0 and is only ever set by a real
    # scorer (app/tasks/*.py) or left at that default.
    errors_by_type: Dict[str, int]

    avg_score_overall: Optional[float]
    avg_score_first_half: Optional[float]
    avg_score_second_half: Optional[float]

    avg_time_taken_seconds_overall: Optional[float]
    avg_time_taken_seconds_first_half: Optional[float]
    avg_time_taken_seconds_second_half: Optional[float]

    error_count_trend: List[int]  # one entry per completed task, completed_at order
    stress_declarations: List[StressPoint]
    task_breakdown: List[TaskBreakdownItem] = field(default_factory=list)
    aria_supervision_history: List[AriaSupervisionPoint] = field(default_factory=list)
    task_timing_samples: List[TaskTimingSample] = field(default_factory=list)
    pause_stats: PauseStats = field(
        default_factory=lambda: PauseStats(pause_count=0, total_pause_duration_seconds=0.0, average_pause_duration_seconds=None)
    )
    # None (not zeroed) when this session contains no email_writing task
    # that captured typing telemetry -- never fabricated for a session
    # with no typing interaction at all.
    typing_metrics: Optional[TypingMetricsSummary] = None


def _avg(values: List[float]) -> Optional[float]:
    return round(sum(values) / len(values), 1) if values else None


def compute_stress_summary(report: SessionReportData) -> Optional[Dict[str, object]]:
    """Deterministic, backend-computed stress facts for the future Debrief
    LLM layer (section 20) -- only fields derivable with certainty from
    the declared values themselves. The LLM later receives this as
    authoritative fact to narrate; it never computes any of it. None (not
    an empty/zeroed dict) when nothing was ever declared -- omission, not
    fabrication.
    """
    points = report.stress_declarations
    if not points:
        return None
    values = [p.value for p in points]
    return {
        "latest": values[-1],
        "average": round(sum(values) / len(values), 2),
        "minimum": min(values),
        "maximum": max(values),
        "change_from_first": values[-1] - values[0],
        "declarations_count": len(values),
    }


def compute_typing_metrics_summary(rows: List[InteractionMetric]) -> Optional[TypingMetricsSummary]:
    """Pure function over already-fetched typing_metrics InteractionMetric
    rows -- None when there are none (never a zeroed/fabricated summary).
    Per-row fields are exactly what app/schemas/task.py's TypingMetricsIn
    validated at submission time, so no re-validation is needed here.
    """
    if not rows:
        return None
    payloads = [r.metadata_json or {} for r in rows]
    durations = [p.get("typing_duration_seconds", 0.0) for p in payloads]
    char_counts = [p.get("character_count", 0) for p in payloads]
    speeds = [p.get("average_chars_per_second", 0.0) for p in payloads]
    variations = [p.get("typing_speed_variation", 0.0) for p in payloads]
    pause_counts = [p.get("pause_count_during_typing", 0) for p in payloads]
    n = len(payloads)
    return TypingMetricsSummary(
        typing_sessions_count=n,
        total_typing_duration_seconds=round(sum(durations), 1),
        total_character_count=sum(char_counts),
        average_chars_per_second=round(sum(speeds) / n, 2),
        average_typing_speed_variation=round(sum(variations) / n, 2),
        total_pause_count_during_typing=sum(pause_counts),
    )


def split_half(items: List) -> Tuple[List, List]:
    """First half gets the extra item on an odd count. Generic over any
    ordered list (completed Task rows, StressDeclaration rows, ...) --
    the SAME split algorithm every early/late comparison in this project
    uses (this function, unchanged apart from its name, and the
    first/second-half fields below). app/reports/behavioral_evaluation.py
    reuses this exact function rather than inventing a second split
    convention, per that module's own docstring.
    """
    mid = (len(items) + 1) // 2
    return items[:mid], items[mid:]


def order_completed_tasks(completed_tasks: List[Task]) -> List[Task]:
    """Real, backend-authoritative sequence order: sort by sequence_index
    when the session used the sequential flow (nulls -- e.g. an
    email_prioritization task, outside the sequence -- sort after
    everything that has a real position), falling back to completed_at
    as the tiebreaker/ordering for anything without one. For a purely
    sequential session this matches completed_at anyway (you cannot
    complete task N+1 before task N), but this makes "actual sequence
    order" explicit and correct rather than incidental. Extracted as its
    own pure function so app/reports/behavioral_evaluation.py can reuse
    the exact same ordering instead of re-deriving it.
    """
    return sorted(
        completed_tasks,
        key=lambda t: (t.sequence_index if t.sequence_index is not None else float("inf"), t.completed_at or datetime.min),
    )


def get_completed_tasks_ordered(db: DBSession, session_id: uuid.UUID) -> List[Task]:
    """DB-aware wrapper around order_completed_tasks -- the one place
    outside get_session_report_data that needs the same real, ordered
    completed-task list (behavioral_evaluation.py) queries through here
    rather than re-deriving the ordering itself.
    """
    completed_tasks = (
        db.query(Task)
        .filter(Task.session_id == session_id, Task.status == TaskStatus.completed)
        .order_by(Task.completed_at.asc())
        .all()
    )
    return order_completed_tasks(completed_tasks)


def compute_pause_episodes(timestamps: List[datetime], threshold_seconds: float = PAUSE_THRESHOLD_SECONDS) -> PauseStats:
    """Pure function -- see PauseStats' own docstring for the exact
    definition. 0 or 1 timestamps means there's nothing to have a gap
    between, so pause_count is correctly 0 (a real fact: no pauses could
    have happened), not a missing-data None.
    """
    ordered = sorted(timestamps)
    gaps = [(b - a).total_seconds() for a, b in zip(ordered, ordered[1:])]
    pauses = [g for g in gaps if g >= threshold_seconds]
    if not pauses:
        return PauseStats(pause_count=0, total_pause_duration_seconds=0.0, average_pause_duration_seconds=None)
    total = sum(pauses)
    return PauseStats(
        pause_count=len(pauses),
        total_pause_duration_seconds=round(total, 1),
        average_pause_duration_seconds=round(total / len(pauses), 1),
    )


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

    total_tasks_assigned = db.query(Task).filter(Task.session_id == session_id).count()

    tasks_by_type: Dict[str, int] = {}
    errors_by_type: Dict[str, int] = {}
    for t in completed_tasks:
        tasks_by_type[t.type.value] = tasks_by_type.get(t.type.value, 0) + 1
        errors_by_type[t.type.value] = errors_by_type.get(t.type.value, 0) + (t.error_count or 0)

    task_timing_samples = [
        TaskTimingSample(time_taken_seconds=t.time_taken_seconds, deadline_seconds=t.deadline_seconds)
        for t in completed_tasks
        if t.time_taken_seconds is not None and t.deadline_seconds
    ]

    typing_metric_rows = (
        db.query(InteractionMetric)
        .filter(InteractionMetric.session_id == session_id, InteractionMetric.action_type == "typing_metrics")
        .all()
    )
    typing_metrics = compute_typing_metrics_summary(typing_metric_rows)

    event_timestamps = [
        row.timestamp
        for row in db.query(InteractionMetric.timestamp).filter(InteractionMetric.session_id == session_id).all()
    ]
    pause_stats = compute_pause_episodes(event_timestamps)

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
    first_half_tasks, second_half_tasks = split_half(completed_tasks)

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

    # Real, backend-authoritative sequence order: sort by sequence_index
    # when the session used the sequential flow (nulls -- e.g. an
    # email_prioritization task, outside the sequence -- sort after
    # everything that has a real position), falling back to completed_at
    # as the tiebreaker/ordering for anything without one. For a purely
    # sequential session this matches completed_at anyway (you cannot
    # complete task N+1 before task N), but this makes "actual sequence
    # order" explicit and correct rather than incidental.
    ordered_tasks = order_completed_tasks(completed_tasks)
    task_breakdown = [
        TaskBreakdownItem(
            task_id=t.id,
            task_type=t.type.value,
            content_score=t.content_score,
            time_taken_seconds=t.time_taken_seconds,
            error_count=t.error_count or 0,
            status=t.status.value,
            completed_at=t.completed_at,
            sequence_index=t.sequence_index,
        )
        for t in ordered_tasks
    ]

    manager_message_rows = (
        db.query(ManagerMessage)
        .filter(ManagerMessage.session_id == session_id)
        .order_by(ManagerMessage.sent_at.asc())
        .all()
    )
    aria_supervision_history = [
        AriaSupervisionPoint(tone=m.tone.value, at=m.sent_at) for m in manager_message_rows
    ]

    return SessionReportData(
        session_id=session_id,
        session_started_at=session.started_at,
        session_ended_at=session.ended_at,
        phase_reached=session.current_phase.value,
        total_tasks_completed=len(completed_tasks),
        total_tasks_assigned=total_tasks_assigned,
        tasks_by_type=tasks_by_type,
        errors_by_type=errors_by_type,
        avg_score_overall=_avg(scores),
        avg_score_first_half=half_avg(first_half_tasks, "content_score"),
        avg_score_second_half=half_avg(second_half_tasks, "content_score"),
        avg_time_taken_seconds_overall=_avg(times),
        avg_time_taken_seconds_first_half=half_avg(first_half_tasks, "time_taken_seconds"),
        avg_time_taken_seconds_second_half=half_avg(second_half_tasks, "time_taken_seconds"),
        error_count_trend=error_count_trend,
        stress_declarations=stress_declarations,
        task_breakdown=task_breakdown,
        aria_supervision_history=aria_supervision_history,
        task_timing_samples=task_timing_samples,
        pause_stats=pause_stats,
        typing_metrics=typing_metrics,
    )
