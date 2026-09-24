"""compute_productivity_index: a transparent, weighted formula over
SessionReportData, following the exact same convention already
established by app/reports/fatigue.py (deterministic, explainable,
0-100, no LLM).

Cahier requirement: "un indice de productivite" -- explicitly a
simulation indicator, not a scientifically authoritative measurement.
Labeled "Indice de productivite" wherever surfaced -- never "your real
productivity."
"""
from typing import Dict, List, Optional

from app.reports.aggregation import SessionReportData, TaskTimingSample

# Weights need not sum to 1 -- same normalize-by-sum-of-weights convention
# already used throughout this project (priority_evaluation.
# calculate_weighted_score, simulation_fsm.calculate_pressure_score).
# Accuracy and completion are weighted equally and higher than time
# efficiency on purpose: a fast-but-wrong session must not out-score a
# slower-but-correct one just because it finished quickly.
PRODUCTIVITY_WEIGHTS = {
    "completion": 0.35,
    "accuracy": 0.35,
    "time_efficiency": 0.30,
}


def _time_efficiency_component(samples: List[TaskTimingSample]) -> Optional[float]:
    """Average, across every completed task with a real deadline, of how
    efficiently its allotted time was used -- capped at 100 so finishing
    in HALF the allotted time scores the same as finishing in 99% of it
    (efficient), never rewarded further for going faster still. A task
    that ran over its deadline scores proportionally below 100. An
    (edge-case) 0-second completion scores the max, 100, rather than
    dividing by zero or fabricating a negative/undefined result.
    """
    if not samples:
        return None
    scores = [
        100.0 if s.time_taken_seconds <= 0 else min(100.0, 100.0 * s.deadline_seconds / s.time_taken_seconds)
        for s in samples
    ]
    return sum(scores) / len(scores)


def compute_productivity_index(report: SessionReportData) -> Optional[float]:
    """Weighted blend of completion rate, accuracy, and time efficiency,
    each independently normalized to 0-100 before weighting. Any
    component whose inputs are unavailable is EXCLUDED (not defaulted to
    0 or 100) and the remaining weights are re-normalized against each
    other -- a session with no scored task type yet still gets a
    completion+time-efficiency-only productivity figure instead of None
    or a silently wrong one. Returns None only when NOT ONE component can
    be computed (e.g. a session with zero assigned tasks) -- never
    fabricated.
    """
    components: Dict[str, float] = {}

    if report.total_tasks_assigned > 0:
        components["completion"] = 100.0 * report.total_tasks_completed / report.total_tasks_assigned

    if report.avg_score_overall is not None:
        components["accuracy"] = report.avg_score_overall

    time_efficiency = _time_efficiency_component(report.task_timing_samples)
    if time_efficiency is not None:
        components["time_efficiency"] = time_efficiency

    if not components:
        return None

    total_weight = sum(PRODUCTIVITY_WEIGHTS[key] for key in components)
    raw = sum(components[key] * PRODUCTIVITY_WEIGHTS[key] for key in components) / total_weight
    return round(max(0.0, min(100.0, raw)), 1)
