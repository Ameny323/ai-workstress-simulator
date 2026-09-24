"""Behavioral Evaluation layer -- the deterministic, additive interpretation
step this project's own Result-Determination Architecture Audit found
missing: turning the SAME already-computed session data (SessionReportData,
completed Task rows, ManagerMessage/StressDeclaration/InteractionMetric
telemetry) into an explicit early-vs-late EVOLUTION per indicator, a small
set of rule-based, descriptive OBSERVATIONS about how those indicators
co-occur, and one deterministic SYNTHESIS (primary observation + confidence).

Architectural position (see this module's own docstring for the full
picture the audit asked for):

    RAW ACTION -> telemetry -> task metrics -> session metrics (aggregation.py)
        -> BEHAVIORAL EVOLUTION (this module) -> SIGNAL INTERPRETATION (this
           module) -> BEHAVIORAL SYNTHESIS (this module) -> recommendations
           (app/recommendations/engine.py, optionally tagged with a
           source_observation code) -> final report

This module NEVER talks to ARIA (app/orchestrators/simulation_fsm.py /
aria_policy.py) and ARIA never reads anything from here -- the two systems
share raw inputs (Task/InteractionMetric/StressDeclaration rows) but make
their decisions completely independently, on purpose (ARIA controls the
simulation environment in real time; this module analyzes participant
behavior after the fact, for the report). No function here writes to the
DB, decides an ARIA trigger/tone/phase, or is called by anything in
app/orchestrators/ or app/ai/.

No LLM call anywhere in this file. Every observation/synthesis is produced
by a plain, inspectable rule over already-computed evolution values --
never delegated to OpenAI, matching the same "LLM phrases, never decides"
boundary already established for ARIA (app/ai/manager_service.py).

METHODOLOGICAL STATUS (read before citing any number from this module):
every band/threshold constant below is a HEURISTIC PROTOTYPE VALUE chosen
for this simulation's current default 6-task sequence -- none of them is
empirically calibrated or scientifically validated, exactly like this
project's pre-existing productivity/fatigue/pressure-score weights (see
those modules' own docstrings, which make the identical disclosure). They
are grouped at the top of this file specifically so they are easy to find
and recalibrate later; changing one changes report wording, not the
underlying real data it is applied to.
"""
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session as DBSession

from app.models.interaction_metric import InteractionMetric
from app.models.task import Task
from app.reports.aggregation import (
    SessionReportData,
    compute_pause_episodes,
    get_completed_tasks_ordered,
    split_half,
)

# ── Heuristic classification bands (see module docstring) ──────────────────
# Each "STABLE_BAND" is the +/- window around zero change that is treated as
# "no meaningful change" rather than a real increase/decrease -- avoids
# labeling normal task-to-task noise as a trend. All are on the same scale
# as the metric they gate (score points, pace-efficiency points 0-100,
# errors/task, pauses/task, stress levels 1-5, seconds).
PERFORMANCE_STABLE_BAND = 5.0
PACE_STABLE_BAND = 15.0
ERROR_STABLE_BAND = 0.5
PAUSE_RATE_STABLE_BAND = 0.5
STRESS_STABLE_BAND = 0.5
TRANSITION_TIME_STABLE_BAND_SECONDS = 20.0
TYPING_SPEED_STABLE_BAND = 1.0
TYPING_VARIATION_STABLE_BAND = 1.0

# "High accuracy" absolute threshold used only by the G (pauses + high
# accuracy) signal below -- deliberately a plain, documented constant
# rather than a relative one, since G is about an absolute quality bar
# ("accuracy remained high"), not a trend.
#
# NOT the same constant as app/orchestrators/aria_policy.py's
# HIGH_ACCURACY_THRESHOLD = 0.8 (80% on a 0-1 scale). The two are
# independently defined, serve different purposes -- this one gates a
# report-time, post-session behavioral OBSERVATION; that one gates a
# live, in-session ARIA supervision TRIGGER -- and are calibrated (or,
# more precisely, left un-calibrated) separately. Their numeric overlap
# (80 here, 0.8 there) is coincidental round-number convergence, not an
# intentional shared reference; changing one must never be assumed to
# imply the other should change too.
HIGH_ACCURACY_ABS_THRESHOLD = 80.0

# Confidence bands: purely a measure of EVIDENCE COVERAGE (how many
# completed tasks the evolution splits are based on), never a statistical
# confidence interval -- no inferential statistics are performed anywhere
# in this module. Heuristic prototype values, same disclosure as above.
CONFIDENCE_LOW_MIN_TASKS = 2
CONFIDENCE_MODERATE_MIN_TASKS = 4
CONFIDENCE_HIGH_MIN_TASKS = 6

INSUFFICIENT_DATA = "INSUFFICIENT_DATA"


# ── Core shapes ──────────────────────────────────────────────────────────
@dataclass
class EvolutionMetric:
    """One indicator's early-vs-late comparison. `evolution` is always one
    of a small, domain-specific vocabulary (documented per compute_*
    function below) -- never a numeric "behavior score." early_value/
    late_value/change are all None, and evolution is INSUFFICIENT_DATA,
    whenever there isn't enough real data for a split -- never a fabricated
    0 or an invented trend from a single data point.
    """
    early_value: Optional[float]
    late_value: Optional[float]
    change: Optional[float]
    evolution: str


@dataclass
class TypingEvolution:
    speed: EvolutionMetric
    variation: EvolutionMetric


@dataclass
class BehavioralObservation:
    """A descriptive, non-diagnostic statement about how two or more
    evolution indicators co-occurred -- see interpret_signals() below for
    the full rule list. `supporting_signals` names the specific per-metric
    evolution codes (e.g. "PACE_SLOWING") that caused this observation to
    fire, so the observation is always traceable back to real computed
    values, never asserted on its own.
    """
    code: str
    title: str
    description: str
    supporting_signals: List[str] = field(default_factory=list)


@dataclass
class BehavioralEvaluationData:
    performance: EvolutionMetric
    pace: EvolutionMetric
    errors: EvolutionMetric
    pauses: EvolutionMetric
    workflow: EvolutionMetric
    stress: EvolutionMetric
    typing: Optional[TypingEvolution]
    observations: List[BehavioralObservation]
    primary_observation: Optional[BehavioralObservation]
    confidence: str


@dataclass
class TaskPaceSample:
    """One completed task's pace_efficiency, plus whether it had to fall
    back to the legacy (assignment-to-completion) time measurement because
    no real engagement timestamp exists for it -- see task_pace_efficiency's
    own docstring for why the two are computed differently and why this
    flag matters (never silently presented as equivalent data)."""
    task_id: uuid.UUID
    sequence_index: Optional[int]
    pace_efficiency: Optional[float]
    is_legacy_fallback: bool


# ── Generic trend classifier ────────────────────────────────────────────
def _classify_trend(change: Optional[float], stable_band: float, up_label: str, down_label: str) -> str:
    if change is None:
        return INSUFFICIENT_DATA
    if change > stable_band:
        return up_label
    if change < -stable_band:
        return down_label
    return "STABLE"


# ── Phase 2/4: task engagement -> active execution time -> pace ────────────
def task_active_execution_seconds(task: Task) -> Optional[float]:
    """(active_execution_seconds, is_legacy_fallback). Prefers REAL
    engagement time (Task.started_at, set only by POST /tasks/{id}/engage's
    first-genuine-interaction call -- see app/api/tasks.py's engage_task)
    over the pre-existing assignment-to-completion measurement
    (Task.time_taken_seconds). Falls back to the legacy measurement, marked
    as such, for any task that completed without ever calling /engage
    (legacy data predating this feature, or a participant who never
    interacted before an auto-submit timeout) -- never fabricates a
    started_at that was never recorded.
    """
    if task.started_at is not None and task.completed_at is not None:
        return max(0.0, (task.completed_at - task.started_at).total_seconds())
    return None


def task_pace_efficiency(task: Task) -> TaskPaceSample:
    """expected_duration_seconds is Task.deadline_seconds -- already the
    project's existing "expected/allocated duration" concept (see
    app/orchestrators/task_engine.py: derived from TaskTemplate.
    estimated_duration, itself authored per TaskTemplate.difficulty, then
    adjusted per the participant's own recent performance by
    app/orchestrators/adaptation.adjust_priority_and_deadline). No new
    "expected duration" field is introduced here.

    pace_efficiency = min(100, 100 * expected_duration / active_time),
    capped the same way productivity.py/cognitive_load.py cap their own
    time-ratio components. DELIBERATELY uses ACTIVE execution time
    (engagement -> completion) rather than Task.time_taken_seconds
    (assignment -> completion, unchanged, still used by productivity.py/
    cognitive_load.py) -- this is what keeps "pace" from being merely a
    rename of the pre-existing execution-time metric. None when the
    expected duration is missing/non-positive, or when NEITHER a real
    engagement time nor the legacy fallback is available -- never guessed.
    """
    expected = task.deadline_seconds
    if not expected or expected <= 0:
        return TaskPaceSample(task.id, task.sequence_index, None, is_legacy_fallback=False)

    active_seconds = task_active_execution_seconds(task)
    is_fallback = False
    if active_seconds is None:
        if task.time_taken_seconds is None:
            return TaskPaceSample(task.id, task.sequence_index, None, is_legacy_fallback=False)
        active_seconds = float(task.time_taken_seconds)
        is_fallback = True

    if active_seconds <= 0:
        return TaskPaceSample(task.id, task.sequence_index, 100.0, is_legacy_fallback=is_fallback)

    efficiency = round(min(100.0, 100.0 * expected / active_seconds), 1)
    return TaskPaceSample(task.id, task.sequence_index, efficiency, is_legacy_fallback=is_fallback)


def compute_pace_evolution(ordered_tasks: List[Task]) -> EvolutionMetric:
    """early/late pace_efficiency, split via the SAME split_half()
    aggregation.py already uses for score/time -- no second split
    algorithm. Only tasks with a computable pace_efficiency participate;
    fewer than 2 such tasks (across the whole session, before splitting)
    means INSUFFICIENT_DATA rather than a trend from one data point.

    Sign convention (documented once, here): pace_efficiency INCREASING
    means the participant got FASTER relative to the expected duration ->
    "ACCELERATING". Decreasing means slower -> "SLOWING". This is the
    opposite orientation from "performance decline" (higher is better
    there too, but a numeric increase in decline is bad) -- worth keeping
    straight when reading interpret_signals() below.
    """
    samples = [s for s in (task_pace_efficiency(t) for t in ordered_tasks) if s.pace_efficiency is not None]
    if len(samples) < 2:
        return EvolutionMetric(None, None, None, INSUFFICIENT_DATA)

    first_half, second_half = split_half(samples)
    if not first_half or not second_half:
        return EvolutionMetric(None, None, None, INSUFFICIENT_DATA)

    early = round(sum(s.pace_efficiency for s in first_half) / len(first_half), 1)
    late = round(sum(s.pace_efficiency for s in second_half) / len(second_half), 1)
    change = round(late - early, 1)
    evolution = _classify_trend(change, PACE_STABLE_BAND, up_label="ACCELERATING", down_label="SLOWING")
    return EvolutionMetric(early, late, change, evolution)


# ── Phase 10: performance evolution (reuses aggregation.py's own split) ────
def compute_performance_evolution(report: SessionReportData) -> EvolutionMetric:
    """Reuses report.avg_score_first_half/avg_score_second_half AS-IS --
    no recomputation, so this can never disagree with the numbers the
    report already shows elsewhere. Only adds the classification label on
    top. Centralizing this classification here (instead of each caller,
    including the frontend, inventing its own diff>5/-5 check) is the
    fix for the audit's finding that the frontend independently decided
    "stable"/"improved"/"declined" with its own, non-centralized threshold.
    """
    early = report.avg_score_first_half
    late = report.avg_score_second_half
    if early is None or late is None:
        return EvolutionMetric(None, None, None, INSUFFICIENT_DATA)
    change = round(late - early, 1)
    evolution = _classify_trend(change, PERFORMANCE_STABLE_BAND, up_label="IMPROVING", down_label="DECLINING")
    return EvolutionMetric(early, late, change, evolution)


# ── Phase 6: error evolution (additive; error_trend_score in fatigue.py is
# untouched and still used there) ───────────────────────────────────────────
def compute_error_evolution(ordered_tasks: List[Task]) -> EvolutionMetric:
    if len(ordered_tasks) < 2:
        return EvolutionMetric(None, None, None, INSUFFICIENT_DATA)
    first_half, second_half = split_half(ordered_tasks)
    early = round(sum((t.error_count or 0) for t in first_half) / len(first_half), 2)
    late = round(sum((t.error_count or 0) for t in second_half) / len(second_half), 2)
    change = round(late - early, 2)
    evolution = _classify_trend(change, ERROR_STABLE_BAND, up_label="INCREASING", down_label="DECREASING")
    return EvolutionMetric(early, late, change, evolution)


# ── Phase 8: pause evolution (reuses compute_pause_episodes UNCHANGED) ──────
def compute_pause_evolution(ordered_tasks: List[Task], event_timestamps: List[datetime]) -> EvolutionMetric:
    """pause_rate = pause_episodes / completed_tasks, computed separately
    for the early and late halves of the session (task-count split, same
    convention as every other evolution metric here). The boundary in TIME
    is the completion timestamp of the first half's last task -- an event
    timestamp before it counts as "early," at/after it counts as "late."

    Known, documented limitation: a single pause whose gap straddles that
    boundary is not double-counted, but it is also not guaranteed to be
    attributed to either half (splitting the raw timestamp list at a point
    can turn one qualifying gap into two shorter, non-qualifying ones).
    This under-counts boundary-straddling pauses rather than risking a
    double-count -- an intentional, documented conservative choice.
    """
    if len(ordered_tasks) < 2:
        return EvolutionMetric(None, None, None, INSUFFICIENT_DATA)
    first_half, second_half = split_half(ordered_tasks)
    if not first_half or not second_half:
        return EvolutionMetric(None, None, None, INSUFFICIENT_DATA)

    boundary = first_half[-1].completed_at
    if boundary is None:
        return EvolutionMetric(None, None, None, INSUFFICIENT_DATA)

    early_timestamps = [t for t in event_timestamps if t < boundary]
    late_timestamps = [t for t in event_timestamps if t >= boundary]

    early_rate = round(compute_pause_episodes(early_timestamps).pause_count / len(first_half), 2)
    late_rate = round(compute_pause_episodes(late_timestamps).pause_count / len(second_half), 2)
    change = round(late_rate - early_rate, 2)
    evolution = _classify_trend(change, PAUSE_RATE_STABLE_BAND, up_label="INCREASING", down_label="DECREASING")
    return EvolutionMetric(early_rate, late_rate, change, evolution)


# ── Phase 5: workflow / transition-time analysis ────────────────────────────
def compute_transition_times(ordered_tasks: List[Task]) -> List[float]:
    """transition_time = next.started_at - previous.completed_at, for each
    consecutive pair in real sequence order. Requires a REAL engagement
    timestamp on the next task -- a pair where the next task never called
    /engage (legacy data, or an auto-submitted task the participant never
    touched) is skipped rather than measured against assigned_at, which
    would silently conflate "time to notice/open the next task" with "time
    the previous task's generation took," per this feature's own
    assignment-vs-engagement distinction. A negative gap (should not occur
    given the sequential flow's own ordering guarantees, but not assumed)
    is also skipped rather than reported as a fabricated negative duration.
    """
    times: List[float] = []
    for prev, nxt in zip(ordered_tasks, ordered_tasks[1:]):
        if prev.completed_at is None or nxt.started_at is None:
            continue
        gap = (nxt.started_at - prev.completed_at).total_seconds()
        if gap >= 0:
            times.append(gap)
    return times


def compute_average_transition_time(ordered_tasks: List[Task]) -> Optional[float]:
    times = compute_transition_times(ordered_tasks)
    return round(sum(times) / len(times), 1) if times else None


def compute_workflow_evolution(ordered_tasks: List[Task]) -> EvolutionMetric:
    """early/late average transition time. Needs at least 2 real
    transition-time samples (i.e. at least 3 tasks with the necessary
    engagement timestamps) to split meaningfully -- INSUFFICIENT_DATA
    otherwise, including for every session created before the /engage
    endpoint existed (no task in it will ever have a real started_at)."""
    transition_times = compute_transition_times(ordered_tasks)
    if len(transition_times) < 2:
        return EvolutionMetric(None, None, None, INSUFFICIENT_DATA)
    first_half, second_half = split_half(transition_times)
    if not first_half or not second_half:
        return EvolutionMetric(None, None, None, INSUFFICIENT_DATA)
    early = round(sum(first_half) / len(first_half), 1)
    late = round(sum(second_half) / len(second_half), 1)
    change = round(late - early, 1)
    # Longer transitions -> the workflow is SLOWING between tasks; shorter
    # -> ACCELERATING. Same vocabulary as pace evolution, applied to a
    # different underlying signal (inter-task gap, not intra-task speed).
    evolution = _classify_trend(change, TRANSITION_TIME_STABLE_BAND_SECONDS, up_label="SLOWING", down_label="ACCELERATING")
    return EvolutionMetric(early, late, change, evolution)


# ── Phase 9: stress evolution (additive; existing peak/latest/average/
# change_from_first framings in fatigue.py and aggregation.py are untouched
# and still used exactly as before) ─────────────────────────────────────────
def compute_stress_evolution(report: SessionReportData) -> EvolutionMetric:
    points = report.stress_declarations
    if len(points) < 2:
        return EvolutionMetric(None, None, None, INSUFFICIENT_DATA)
    first_half, second_half = split_half(points)
    if not first_half or not second_half:
        return EvolutionMetric(None, None, None, INSUFFICIENT_DATA)
    early = round(sum(p.value for p in first_half) / len(first_half), 2)
    late = round(sum(p.value for p in second_half) / len(second_half), 2)
    change = round(late - early, 2)
    evolution = _classify_trend(change, STRESS_STABLE_BAND, up_label="INCREASING", down_label="DECREASING")
    return EvolutionMetric(early, late, change, evolution)


# ── Phase 9 (typing): only for sessions with >=2 typing_metrics rows -- never
# invented for task types with no typing telemetry at all ─────────────────
def compute_typing_evolution(typing_metric_rows: List[InteractionMetric]) -> Optional[TypingEvolution]:
    """None (not INSUFFICIENT_DATA fields) when fewer than 2 typing_metrics
    rows exist for this session -- with the current default sequence
    (exactly one email_writing task) this will be None for essentially
    every session; it only becomes meaningful for a custom sequence with
    multiple email_writing tasks. Never fabricated for data_validation/
    document_organization/urgent_request, which never produce typing
    telemetry at all.
    """
    if len(typing_metric_rows) < 2:
        return None
    ordered = sorted(typing_metric_rows, key=lambda r: r.timestamp)
    first_half, second_half = split_half(ordered)

    def _avg(rows: List[InteractionMetric], key: str) -> Optional[float]:
        vals = [(r.metadata_json or {}).get(key) for r in rows]
        vals = [v for v in vals if v is not None]
        return round(sum(vals) / len(vals), 2) if vals else None

    early_speed, late_speed = _avg(first_half, "average_chars_per_second"), _avg(second_half, "average_chars_per_second")
    early_var, late_var = _avg(first_half, "typing_speed_variation"), _avg(second_half, "typing_speed_variation")

    speed_change = round(late_speed - early_speed, 2) if early_speed is not None and late_speed is not None else None
    var_change = round(late_var - early_var, 2) if early_var is not None and late_var is not None else None

    speed_evo = _classify_trend(speed_change, TYPING_SPEED_STABLE_BAND, up_label="INCREASING", down_label="DECREASING")
    var_evo = _classify_trend(var_change, TYPING_VARIATION_STABLE_BAND, up_label="INCREASING", down_label="DECREASING")

    return TypingEvolution(
        speed=EvolutionMetric(early_speed, late_speed, speed_change, speed_evo),
        variation=EvolutionMetric(early_var, late_var, var_change, var_evo),
    )


# ── Phase 11: signal interpretation (descriptive only -- see module
# docstring; never a diagnosis) ─────────────────────────────────────────────
def interpret_signals(
    performance: EvolutionMetric,
    pace: EvolutionMetric,
    errors: EvolutionMetric,
    pauses: EvolutionMetric,
    stress: EvolutionMetric,
    report: SessionReportData,
) -> List[BehavioralObservation]:
    """Independently evaluated (a session can match more than one pattern
    at once), same philosophy as app/recommendations/engine.py's own 9
    rules. Every condition reads an already-computed `.evolution` label or
    an already-reported field -- nothing here re-derives raw data."""
    observations: List[BehavioralObservation] = []
    accuracy_leaning_up = {"STABLE", "IMPROVING"}
    errors_leaning_down = {"STABLE", "DECREASING"}

    # A. FAST + INACCURATE
    if pace.evolution == "ACCELERATING" and (performance.evolution == "DECLINING" or errors.evolution == "INCREASING"):
        observations.append(BehavioralObservation(
            code="FAST_INACCURATE",
            title="Faster execution, reduced accuracy",
            description="An acceleration in execution pace was observed, accompanied by a reduction in accuracy or an increase in errors.",
            supporting_signals=["PACE_ACCELERATING"] + (["PERFORMANCE_DECLINING"] if performance.evolution == "DECLINING" else []) + (["ERRORS_INCREASING"] if errors.evolution == "INCREASING" else []),
        ))

    # B. SLOW + ACCURATE
    if pace.evolution == "SLOWING" and performance.evolution in accuracy_leaning_up and errors.evolution in errors_leaning_down:
        observations.append(BehavioralObservation(
            code="SLOW_ACCURATE",
            # Wording correction (calibration review finding): this signal is
            # direction-only -- it fires whenever performance is STABLE or
            # IMPROVING, regardless of the ABSOLUTE level (verified live: it
            # fires identically at 0% and at 100% average score). The
            # previous wording ("accuracy maintained") implied a high/good
            # absolute accuracy level that this condition does not actually
            # establish. Rephrased to state only what was actually
            # observed: the absence of a decline, not a claim about
            # accuracy quality.
            title="Slower pace, performance not degraded",
            description="A slowdown in execution pace was observed, without a decline in performance or an increase in errors.",
            supporting_signals=["PACE_SLOWING", f"PERFORMANCE_{performance.evolution}", f"ERRORS_{errors.evolution}"],
        ))

    # C. SLOW + INACCURATE
    if pace.evolution == "SLOWING" and performance.evolution == "DECLINING" and errors.evolution == "INCREASING":
        observations.append(BehavioralObservation(
            code="SLOW_INACCURATE",
            title="Performance decline and slowdown",
            description="A decline in performance was observed together with a slowdown in execution pace.",
            supporting_signals=["PACE_SLOWING", "PERFORMANCE_DECLINING", "ERRORS_INCREASING"],
        ))

    # D. FAST + ACCURATE
    if pace.evolution == "ACCELERATING" and performance.evolution in accuracy_leaning_up and errors.evolution in errors_leaning_down:
        observations.append(BehavioralObservation(
            code="FAST_ACCURATE",
            # Same wording correction as SLOW_ACCURATE above -- "efficient
            # execution" and "accuracy" both implied a quality/accuracy
            # judgment this direction-only condition does not support.
            # Rephrased to state only the absence of decline.
            title="Faster pace, performance not degraded",
            description="An acceleration in execution pace was observed, without a decline in performance or an increase in errors.",
            supporting_signals=["PACE_ACCELERATING", f"PERFORMANCE_{performance.evolution}", f"ERRORS_{errors.evolution}"],
        ))

    # E. HIGH/INCREASING STRESS + STABLE PERFORMANCE
    if stress.evolution == "INCREASING" and performance.evolution in {"STABLE", "IMPROVING"}:
        observations.append(BehavioralObservation(
            code="STRESS_STABLE_PERFORMANCE",
            title="Rising declared pressure, stable performance",
            description="The self-declared pressure level increased without a comparable decline in observed performance.",
            supporting_signals=["STRESS_INCREASING", f"PERFORMANCE_{performance.evolution}"],
        ))

    # F. INCREASING STRESS + PERFORMANCE DECLINE
    if stress.evolution == "INCREASING" and performance.evolution == "DECLINING":
        observations.append(BehavioralObservation(
            code="STRESS_PERFORMANCE_DECLINE",
            title="Rising declared pressure and declining performance",
            description="The rise in self-declared pressure level coincided with a decline in observed performance.",
            supporting_signals=["STRESS_INCREASING", "PERFORMANCE_DECLINING"],
        ))

    # G. MANY PAUSES + HIGH ACCURACY
    if pauses.evolution == "INCREASING" and report.avg_score_overall is not None and report.avg_score_overall >= HIGH_ACCURACY_ABS_THRESHOLD:
        observations.append(BehavioralObservation(
            code="PAUSES_HIGH_ACCURACY",
            title="Frequent interruptions, high accuracy maintained",
            description="An increase in pause frequency was observed while overall task accuracy remained high.",
            supporting_signals=["PAUSES_INCREASING"],
        ))

    # H. INCREASING ERRORS + NORMAL (STABLE) PACE
    if errors.evolution == "INCREASING" and pace.evolution == "STABLE":
        observations.append(BehavioralObservation(
            code="ERRORS_NORMAL_PACE",
            title="Rising errors with no change in pace",
            description="Error frequency increased without a comparable slowdown or acceleration in execution pace.",
            supporting_signals=["ERRORS_INCREASING", "PACE_STABLE"],
        ))

    return observations


# Deterministic priority order for picking ONE primary observation when
# several combination patterns fire at once -- ranks patterns describing a
# quality/accuracy concern above purely positive or neutral ones, since
# those are typically the most actionable to surface first. A documented
# design choice, not a claim that any pattern is more "true" than another.
_OBSERVATION_PRIORITY = [
    "SLOW_INACCURATE", "STRESS_PERFORMANCE_DECLINE", "FAST_INACCURATE", "ERRORS_NORMAL_PACE",
    "SLOW_ACCURATE", "PAUSES_HIGH_ACCURACY", "FAST_ACCURATE", "STRESS_STABLE_PERFORMANCE",
]


def synthesize(
    observations: List[BehavioralObservation], performance: EvolutionMetric, total_tasks_completed: int,
) -> "tuple[Optional[BehavioralObservation], str]":
    """Deterministic only -- no OpenAI call, no subjective judgment. If any
    combination pattern fired (interpret_signals above), the highest-
    priority one becomes primary_observation. Otherwise, falls back to a
    plain observation built directly from the performance evolution alone
    (never fabricated when performance itself is INSUFFICIENT_DATA).
    Confidence is evidence-coverage only (number of completed tasks the
    early/late splits are based on) -- explicitly NOT a statistical
    confidence interval, since no inferential statistics are computed
    anywhere in this module.
    """
    confidence = compute_confidence(total_tasks_completed)

    if observations:
        by_code = {o.code: o for o in observations}
        for code in _OBSERVATION_PRIORITY:
            if code in by_code:
                return by_code[code], confidence

    if performance.evolution == INSUFFICIENT_DATA:
        return None, confidence

    fallback_titles = {
        "DECLINING": ("PERFORMANCE_DECLINE", "Performance decline", "Average accuracy decreased between the first and second half of the session."),
        "IMPROVING": ("PERFORMANCE_IMPROVEMENT", "Performance improvement", "Average accuracy increased between the first and second half of the session."),
        "STABLE": ("STABLE_PERFORMANCE", "Stable performance", "Average accuracy remained comparable between the first and second half of the session."),
    }
    code, title, description = fallback_titles[performance.evolution]
    return BehavioralObservation(code=code, title=title, description=description, supporting_signals=[f"PERFORMANCE_{performance.evolution}"]), confidence


def compute_confidence(total_tasks_completed: int) -> str:
    """Evidence/coverage level, not a statistical confidence interval --
    see module docstring. Heuristic thresholds on the number of completed
    tasks the early/late splits are drawn from."""
    if total_tasks_completed < CONFIDENCE_LOW_MIN_TASKS:
        return INSUFFICIENT_DATA
    if total_tasks_completed < CONFIDENCE_MODERATE_MIN_TASKS:
        return "LOW"
    if total_tasks_completed < CONFIDENCE_HIGH_MIN_TASKS:
        return "MODERATE"
    return "HIGH"


# ── Orchestration ────────────────────────────────────────────────────────
def compute_behavioral_evaluation(db: DBSession, session_id: uuid.UUID, report: SessionReportData) -> BehavioralEvaluationData:
    """The single entry point app/api/sessions.py's get_session_report
    calls. Reuses report (already computed by
    aggregation.get_session_report_data -- no recomputation of scores/
    times/stress) plus one additional query for the real, sequence-ordered
    completed Task rows (get_completed_tasks_ordered) and the session's
    typing_metrics InteractionMetric rows.
    """
    ordered_tasks = get_completed_tasks_ordered(db, session_id)
    event_timestamps = [
        row.timestamp
        for row in db.query(InteractionMetric.timestamp).filter(InteractionMetric.session_id == session_id).all()
    ]
    typing_metric_rows = (
        db.query(InteractionMetric)
        .filter(InteractionMetric.session_id == session_id, InteractionMetric.action_type == "typing_metrics")
        .all()
    )

    performance = compute_performance_evolution(report)
    pace = compute_pace_evolution(ordered_tasks)
    errors = compute_error_evolution(ordered_tasks)
    pauses = compute_pause_evolution(ordered_tasks, event_timestamps)
    workflow = compute_workflow_evolution(ordered_tasks)
    stress = compute_stress_evolution(report)
    typing = compute_typing_evolution(typing_metric_rows)

    observations = interpret_signals(performance, pace, errors, pauses, stress, report)
    primary_observation, confidence = synthesize(observations, performance, report.total_tasks_completed)

    return BehavioralEvaluationData(
        performance=performance, pace=pace, errors=errors, pauses=pauses,
        workflow=workflow, stress=stress, typing=typing,
        observations=observations, primary_observation=primary_observation, confidence=confidence,
    )
