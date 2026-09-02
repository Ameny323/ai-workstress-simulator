"""compute_fatigue_score: a transparent, weighted formula over
SessionReportData. Every component is explainable in one sentence and
capped to 0-100 before weighting -- this is deliberately not a black box,
since it's the headline number of a report someone may need to defend.

IMPORTANT FRAMING, worth restating whenever this number gets questioned:
this formula measures DECLINE, not absolute badness. Someone who scores
30/100 consistently for an entire session -- never improving, never
worsening -- gets performance_decline_score = 0, identical to someone who
improved. That's intentional: fatigue specifically means "got worse over
time," not "was never good." A consistently low performer is a skill or
task-difficulty-calibration signal, which this system tracks separately
(PerformanceTracker's avg_score, the adaptive difficulty engine) -- it is
deliberately NOT folded into the fatigue number itself.

Weights (30/20/20/30) are a defensible starting point, not empirically
tuned -- that tuning is expected to happen after watching real sessions,
not pre-emptively here.
"""
from typing import List, Optional

from app.reports.aggregation import SessionReportData

WEIGHT_PERFORMANCE_DECLINE = 0.30
WEIGHT_SLOWDOWN = 0.20
WEIGHT_ERROR_TREND = 0.20
WEIGHT_DECLARED_STRESS = 0.30


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def performance_decline_score(report: SessionReportData) -> float:
    """Points the average task score dropped from the session's first half
    to its second half. Negative decline (they got better) clamps to 0,
    not a negative contribution. 0 if there isn't enough data for a split
    (fewer than 2 completed tasks -- both halves are None from Step 1).
    """
    if report.avg_score_first_half is None or report.avg_score_second_half is None:
        return 0.0
    return _clamp(report.avg_score_first_half - report.avg_score_second_half)


def slowdown_score(report: SessionReportData) -> float:
    """Percentage increase in average time-per-task from first half to
    second half, capped at 100% (a 2x-or-worse slowdown maxes this out).
    0 if there isn't enough data (fewer than 2 tasks -- inherits None from
    Step 1) or if the first-half average is exactly 0 (can't compute a
    percentage increase from a zero baseline).
    """
    first = report.avg_time_taken_seconds_first_half
    second = report.avg_time_taken_seconds_second_half
    if first is None or second is None or first == 0:
        return 0.0
    return _clamp((second - first) / first * 100)


def error_trend_score(error_count_trend: List[int]) -> float:
    """Average position in the session (0 = first task, 100 = last task)
    where errors occurred, weighted by how many errors happened at each
    task -- so 5 errors on the last task pulls this higher than 1 error
    would. Errors concentrated at the end score near 100, concentrated at
    the start score near 0, evenly-spread errors land near 50.

    0 if there are no errors at all (no evidence of error-based fatigue).
    0 if there are fewer than 2 completed tasks -- unlike slowdown_score,
    error_count_trend is a raw per-task list from Step 1, not gated to
    None, so this guard has to be explicit here: with n=1, the position
    term i/(n-1) is 0/0 even after confirming total_errors > 0.
    """
    n = len(error_count_trend)
    if n < 2:
        return 0.0
    total_errors = sum(error_count_trend)
    if total_errors == 0:
        return 0.0
    weighted_position = sum(count * (i / (n - 1)) for i, count in enumerate(error_count_trend))
    return _clamp((weighted_position / total_errors) * 100)


def declared_stress_score(report: SessionReportData) -> float:
    """The highest stress level self-reported at any point in the session
    (peak, not latest) -- a fatigue report should capture how bad it got,
    not just how they felt in the final moment, which could understate
    things if they'd calmed down by the end. 0 if nothing was declared.

    Trade-off worth being ready to explain: at 30% weight, a single brief
    stress-slider drag to 100 contributes a flat 30 points regardless of
    anything else in the session. Deliberate, not a bug -- self-reported
    peak distress is treated as a strong signal by design, since
    underreacting to a stated crisis point is worse than overreacting to
    a possibly-impulsive one.
    """
    if not report.stress_declarations:
        return 0.0
    return _clamp(float(max(point.value for point in report.stress_declarations)))


def compute_fatigue_score(report: SessionReportData) -> int:
    """The blended headline number. app/recommendations/engine.py calls the
    four component functions above directly (not this), so recommendations
    can cite the specific signal that justifies each one rather than just
    "the fatigue score was high" -- both paths use the exact same component
    functions, so there's no risk of the two drifting out of sync.
    """
    decline = performance_decline_score(report)
    slowdown = slowdown_score(report)
    error_trend = error_trend_score(report.error_count_trend)
    stress = declared_stress_score(report)

    fatigue_score = (
        WEIGHT_PERFORMANCE_DECLINE * decline
        + WEIGHT_SLOWDOWN * slowdown
        + WEIGHT_ERROR_TREND * error_trend
        + WEIGHT_DECLARED_STRESS * stress
    )
    return round(_clamp(fatigue_score))
