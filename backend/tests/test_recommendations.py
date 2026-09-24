"""Tests for app/recommendations/engine.py's rule-based recommendation
engine -- previously untested (the calibration review found zero
dedicated unit tests here; every rule was only exercised transitively
through report-integration tests).

This file specifically covers the Rule 4 minimum-evidence guard added by
the final correction pass (n>=2, matching the same convention already
used by aggregation.py's enough_for_trend, fatigue.py's decline/slowdown
component functions, and every behavioral_evaluation.py evolution
function).

Same plain-assert / PASS-FAIL convention as the rest of this suite (no
pytest installed). Pure unit tests -- no DB, no TestClient.

Run from backend/ with the venv active:
    python tests/test_recommendations.py
"""
import os
import sys
import uuid
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.reports.aggregation import SessionReportData  # noqa: E402
from app.reports.fatigue import compute_fatigue_score  # noqa: E402
from app.recommendations.engine import generate_recommendations  # noqa: E402

results = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    results.append(condition)
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))


def _report(**overrides) -> SessionReportData:
    base = dict(
        session_id=uuid.uuid4(), session_started_at=datetime(2026, 1, 1, 9, 0, 0), session_ended_at=None,
        phase_reached="pic_charge", total_tasks_completed=0, total_tasks_assigned=0,
        tasks_by_type={}, errors_by_type={}, avg_score_overall=None, avg_score_first_half=None,
        avg_score_second_half=None, avg_time_taken_seconds_overall=None,
        avg_time_taken_seconds_first_half=None, avg_time_taken_seconds_second_half=None,
        error_count_trend=[], stress_declarations=[],
    )
    base.update(overrides)
    return SessionReportData(**base)


RULE_4_TITLE = "Response accuracy"


# ── Correction 1: Rule 4 minimum-evidence guard ─────────────────────────────
def test_rule4_does_not_fire_with_only_one_completed_task():
    # A single low-scoring task, no half-split possible (decline defaults
    # to 0 -- absence of evidence, not evidence of a sustained pattern).
    report = _report(total_tasks_completed=1, avg_score_overall=20.0, avg_score_first_half=None, avg_score_second_half=None)
    fatigue = compute_fatigue_score(report)
    recs = generate_recommendations(report, fatigue)
    fired = any(r.title == RULE_4_TITLE for r in recs)
    check("Rule 4 does NOT fire from a single completed task (n=1) -- fixed by the calibration review's minimum-evidence guard",
          not fired, f"titles={[r.title for r in recs]}")


def test_rule4_fires_with_two_completed_tasks_when_conditions_are_met():
    report = _report(total_tasks_completed=2, avg_score_overall=20.0, avg_score_first_half=20.0, avg_score_second_half=20.0)
    fatigue = compute_fatigue_score(report)
    recs = generate_recommendations(report, fatigue)
    fired = any(r.title == RULE_4_TITLE for r in recs)
    check("Rule 4 CAN fire at n=2 when its existing score/decline conditions are satisfied", fired, f"titles={[r.title for r in recs]}")


def test_rule4_still_fires_for_a_full_session_low_score_no_decline():
    # Regression: existing behavior for a normal, well-evidenced session
    # (n=6, consistently low score, no real decline) must be unchanged.
    report = _report(
        total_tasks_completed=6, avg_score_overall=30.0,
        avg_score_first_half=30.0, avg_score_second_half=30.0,
    )
    fatigue = compute_fatigue_score(report)
    recs = generate_recommendations(report, fatigue)
    fired = any(r.title == RULE_4_TITLE for r in recs)
    check("Rule 4 still fires for a full 6-task session with a genuinely low, flat score (unchanged behavior)", fired, f"titles={[r.title for r in recs]}")


def test_rule4_does_not_fire_when_score_is_not_low():
    report = _report(total_tasks_completed=6, avg_score_overall=90.0, avg_score_first_half=90.0, avg_score_second_half=90.0)
    fatigue = compute_fatigue_score(report)
    recs = generate_recommendations(report, fatigue)
    fired = any(r.title == RULE_4_TITLE for r in recs)
    check("Rule 4 does not fire when avg_score_overall is not low (unchanged behavior)", not fired, f"titles={[r.title for r in recs]}")


def test_rule4_does_not_fire_when_decline_is_too_large():
    # decline >= 15 means rule 4 (which is specifically about a
    # CONSISTENTLY low score, not a declining one) should not fire --
    # unchanged pre-existing behavior.
    report = _report(total_tasks_completed=6, avg_score_overall=30.0, avg_score_first_half=60.0, avg_score_second_half=10.0)
    fatigue = compute_fatigue_score(report)
    recs = generate_recommendations(report, fatigue)
    fired = any(r.title == RULE_4_TITLE for r in recs)
    check("Rule 4 does not fire when decline >= 15 (this is a decline pattern, not a consistently-low one) -- unchanged behavior",
          not fired, f"titles={[r.title for r in recs]}")


def test_zero_completed_tasks_falls_back_to_insufficient_data_message():
    report = _report(total_tasks_completed=0, avg_score_overall=None)
    fatigue = compute_fatigue_score(report)
    recs = generate_recommendations(report, fatigue)
    check("A session with zero completed tasks gets the honest 'insufficient data' fallback, not a fabricated recommendation",
          len(recs) == 1 and recs[0].title == "Insufficient data", f"titles={[r.title for r in recs]}")


if __name__ == "__main__":
    test_rule4_does_not_fire_with_only_one_completed_task()
    test_rule4_fires_with_two_completed_tasks_when_conditions_are_met()
    test_rule4_still_fires_for_a_full_session_low_score_no_decline()
    test_rule4_does_not_fire_when_score_is_not_low()
    test_rule4_does_not_fire_when_decline_is_too_large()
    test_zero_completed_tasks_falls_back_to_insufficient_data_message()

    print()
    passed = sum(1 for r in results if r)
    print(f"{passed}/{len(results)} checks passed")
    if passed != len(results):
        sys.exit(1)
