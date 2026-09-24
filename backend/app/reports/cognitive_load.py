"""compute_cognitive_load_estimate: the cahier's explicit "estimation de
la charge cognitive basee sur le ratio temps alloue / temps utilise."

This is a BEHAVIORAL PROXY, not a measurement of actual cognitive load --
labeled "Charge cognitive estimee" wherever surfaced, never "your real
cognitive load." Same deterministic, no-LLM, 0-100, explainable convention
as app/reports/fatigue.py and app/reports/productivity.py.
"""
from typing import List, Optional

from app.reports.aggregation import SessionReportData, TaskTimingSample


def _task_load(sample: TaskTimingSample) -> float:
    """time_used / time_allocated, as a percentage, capped at 100.
    time_used=0 (an edge-case instant completion) scores 0 load, not a
    division-by-zero or a fabricated value -- there was no time pressure
    to experience. Going over the allocated time (a timeout) caps at 100
    rather than growing unbounded, since this is a normalized 0-100
    ESTIMATE, not a literal ratio value -- "at or beyond the deadline"
    is already the maximum meaningful signal this proxy can express.
    """
    if sample.time_taken_seconds <= 0:
        return 0.0
    return min(100.0, 100.0 * sample.time_taken_seconds / sample.deadline_seconds)


def compute_cognitive_load_estimate(report: SessionReportData) -> Optional[float]:
    """Average estimated load across every completed task that had a real
    deadline (deadline_seconds set and > 0 -- see TaskTimingSample's own
    construction in aggregation.py, which already excludes tasks missing
    either value). Returns None -- never 0 -- when no task in the session
    had a real deadline to measure against; a missing deadline is absence
    of evidence, not evidence of zero cognitive load.
    """
    samples: List[TaskTimingSample] = report.task_timing_samples
    if not samples:
        return None
    return round(sum(_task_load(s) for s in samples) / len(samples), 1)
