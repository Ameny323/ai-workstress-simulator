"""Report-ready DTO for GET /sessions/{id}/report -- formalizes the shape
that endpoint has always returned (previously an untyped dict built from
dataclasses.asdict()) into a documented Pydantic contract, and adds the
newly-implemented behavioral-analytics fields (productivity, cognitive
load, pause/idle, error-by-type) alongside the existing fatigue/
recommendations/stress fields.

Backend remains the sole source of truth for every number here: nothing
in this file is computed by an LLM, and every field is either a real
persisted value or an explicitly-optional None when the underlying data
doesn't exist -- never fabricated. A future Debrief LLM layer receives
this DTO as authoritative fact and only ever narrates it.

Terminology follows the cahier's own explicit safety framing (section 3):
these are simulation indicators and behavioral proxies, not medical or
psychological measurements. See each field's description.
"""
import uuid
from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class StressPointOut(BaseModel):
    value: int
    declared_at: datetime


class StressSummaryOut(BaseModel):
    """User-DECLARED stress only (1-5 self-report) -- kept structurally
    separate from every behavioral proxy below, per the cahier's explicit
    requirement never to silently blend self-report with inferred
    metrics."""
    latest: int
    average: float
    minimum: int
    maximum: int
    change_from_first: int
    declarations_count: int


class BehavioralMetricsOut(BaseModel):
    """Observable behavioral PROXIES -- not self-reported, not a
    diagnosis. pause/idle definition: a continuous gap of at least the
    configured threshold between two recorded interactions (see
    app/reports/aggregation.py's PauseStats docstring for the exact
    technical definition)."""
    pause_count: int
    total_pause_duration_seconds: float
    average_pause_duration_seconds: Optional[float] = Field(
        default=None, description="None when pause_count is 0 -- never fabricated as 0."
    )
    errors_by_type: Dict[str, int] = Field(description="Sum of Task.error_count per task type, completed tasks only.")


class TypingMetricsSummaryOut(BaseModel):
    """Aggregate-only typing telemetry (cahier: "variations de vitesse de
    frappe"), never raw keystrokes or typed text. None on the parent DTO
    (not this shape zeroed out) when the session contains no email_writing
    task that captured typing data."""
    typing_sessions_count: int
    total_typing_duration_seconds: float
    total_character_count: int
    average_chars_per_second: float
    average_typing_speed_variation: float
    total_pause_count_during_typing: int


class TaskBreakdownOut(BaseModel):
    """One completed task, exactly as persisted -- see
    app/reports/aggregation.py's TaskBreakdownItem docstring. Lets the
    report UI show a real per-task table/chart without any frontend-side
    recomputation."""
    task_id: uuid.UUID
    task_type: str
    content_score: Optional[float]
    time_taken_seconds: Optional[int]
    error_count: int
    status: str
    completed_at: Optional[datetime]
    sequence_index: Optional[int] = Field(
        default=None, description="This task's real position in the session's configured sequence, if any."
    )


class AriaSupervisionPointOut(BaseModel):
    """One ManagerMessage's tone at the moment it was sent -- the FSM's
    already-persisted tone history for this session, not a new state
    machine or a new log (see AriaSupervisionPoint's own docstring)."""
    tone: str
    at: datetime


class RecommendationOut(BaseModel):
    """A structured (title, observation, advice) triple -- see
    app/recommendations/engine.py's own docstring for why this replaced a
    single opaque sentence. Deterministic, rule-based; never LLM-authored,
    never diagnostic."""
    title: str
    observation: str
    advice: str
    source_observation: Optional[str] = Field(
        default=None,
        description="The behavioral_evaluation observation code (if any) this recommendation traces back to -- "
        "None where no clean 1:1 mapping exists yet (partial traceability, not exhaustive).",
    )


class EvolutionMetricOut(BaseModel):
    """One indicator's early-vs-late comparison -- see
    app/reports/behavioral_evaluation.py's EvolutionMetric docstring.
    early_value/late_value/change are None and evolution is
    'INSUFFICIENT_DATA' whenever there isn't enough real data for a split
    -- never fabricated."""
    early_value: Optional[float] = None
    late_value: Optional[float] = None
    change: Optional[float] = None
    evolution: str


class TypingEvolutionOut(BaseModel):
    speed: EvolutionMetricOut
    variation: EvolutionMetricOut


class BehavioralObservationOut(BaseModel):
    """A descriptive, non-diagnostic statement about how evolution
    indicators co-occurred -- never a psychological/medical label. See
    app/reports/behavioral_evaluation.py's interpret_signals()."""
    code: str
    title: str
    description: str
    supporting_signals: List[str] = Field(default_factory=list)


class BehavioralEvaluationOut(BaseModel):
    """Additive analytical layer -- see app/reports/behavioral_evaluation.py's
    module docstring for the full architecture. Backend-authoritative:
    the frontend renders these fields, it does not independently classify
    stable/improved/declined or invent its own thresholds.
    """
    performance: EvolutionMetricOut
    pace: EvolutionMetricOut
    errors: EvolutionMetricOut
    pauses: EvolutionMetricOut
    workflow: EvolutionMetricOut
    stress: EvolutionMetricOut
    typing: Optional[TypingEvolutionOut] = None
    observations: List[BehavioralObservationOut] = Field(default_factory=list)
    primary_observation: Optional[BehavioralObservationOut] = None
    confidence: str = Field(description="Evidence/coverage level (HIGH/MODERATE/LOW/INSUFFICIENT_DATA) -- NOT a statistical confidence interval.")
    disclaimer: str = Field(
        default="This interpretation describes the behaviors observed during the simulation. "
        "It does not constitute a medical or psychological evaluation.",
        description="Fixed methodological disclaimer shown alongside this section wherever it is rendered.",
    )


class SessionReportDataOut(BaseModel):
    session_id: uuid.UUID
    session_started_at: datetime
    session_ended_at: Optional[datetime]
    phase_reached: str
    total_tasks_completed: int
    total_tasks_assigned: int
    tasks_by_type: Dict[str, int]
    avg_score_overall: Optional[float]
    avg_score_first_half: Optional[float]
    avg_score_second_half: Optional[float]
    avg_time_taken_seconds_overall: Optional[float]
    avg_time_taken_seconds_first_half: Optional[float]
    avg_time_taken_seconds_second_half: Optional[float]
    error_count_trend: List[int]
    stress_declarations: List[StressPointOut]
    task_breakdown: List[TaskBreakdownOut] = Field(default_factory=list)
    aria_supervision_history: List[AriaSupervisionPointOut] = Field(default_factory=list)


class SessionAnalyticsOut(BaseModel):
    """The full report-ready contract. report_data/fatigue_score/
    recommendations/stress preserve the existing endpoint's shape exactly
    (no breaking change for the already-wired SessionReportPage.tsx);
    productivity_index/cognitive_load_estimate/behavioral_metrics are the
    newly-implemented fields this audit phase adds.
    """
    report_data: SessionReportDataOut
    fatigue_score: int = Field(description="\"Indice de fatigue simulee\" (behavioral, degradation-based) -- not a medical fatigue measurement.")
    recommendations: List[RecommendationOut]
    stress: Optional[StressSummaryOut] = Field(default=None, description="None when the user never declared stress this session.")
    productivity_index: Optional[float] = Field(
        default=None, description="\"Indice de productivite\" (0-100, simulation indicator). None only when zero tasks were ever assigned."
    )
    cognitive_load_estimate: Optional[float] = Field(
        default=None,
        description="\"Charge cognitive estimee\" (0-100, behavioral proxy based on used/allocated time). None when no completed task had a real deadline.",
    )
    behavioral_metrics: BehavioralMetricsOut
    typing_metrics: Optional[TypingMetricsSummaryOut] = Field(
        default=None, description="None when this session contains no email_writing task with captured typing telemetry."
    )
    behavioral_evaluation: Optional[BehavioralEvaluationOut] = Field(
        default=None,
        description="Deterministic early-vs-late behavioral evolution + rule-based observations (see "
        "app/reports/behavioral_evaluation.py). Additive field -- existing consumers of this DTO are unaffected.",
    )
