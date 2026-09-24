"""Broader unit tests for the generalized AriaTriggerEngine
(app/orchestrators/aria_policy.py) -- covers the full system-wide trigger
set from the ARIA v2 spec, beyond what test_priority_evaluation.py already
covers for Task 02's cooldown/severity-escalation behavior. Same
plain-assert / PASS-FAIL convention (no pytest installed).

Run from backend/ with the venv active:
    python tests/test_aria_policy_v2.py
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.enums import ManagerTone
from app.orchestrators import aria_policy

results = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    results.append(condition)
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))


def decide(facts):
    return aria_policy.decide_aria_reaction(facts, ManagerTone.neutre)


# ── One trigger per spec-listed signal ──────────────────────────────────────
def test_task_started():
    d = decide({"event_type": "task_started"})
    check("TASK_STARTED fires on task_started", d is not None and d.trigger == "TASK_STARTED", f"got {d}")


def test_task_completed():
    d = decide({"event_type": "task_completed"})
    check("TASK_COMPLETED fires on task_completed", d is not None and d.trigger == "TASK_COMPLETED", f"got {d}")


def test_fast_decision():
    d = decide({"event_type": "decision_submitted", "decision_time_ms": 1000})
    check("FAST_DECISION fires when decision_time_ms is below the fast threshold",
          d is not None and d.trigger == "FAST_DECISION", f"got {d}")


def test_slow_decision():
    d = decide({"event_type": "decision_submitted", "decision_time_ms": 30000})
    check("SLOW_DECISION fires when decision_time_ms is above the slow threshold",
          d is not None and d.trigger == "SLOW_DECISION", f"got {d}")


def test_mid_range_decision_time_triggers_neither():
    d = decide({"event_type": "decision_submitted", "decision_time_ms": 15000})
    check("a decision time in the normal mid-range triggers neither FAST_DECISION nor SLOW_DECISION",
          d is None, f"got {d}")


def test_error_detected_single_error():
    d = decide({"consecutive_errors": 1})
    check("ERROR_DETECTED fires on exactly one consecutive error",
          d is not None and d.trigger == "ERROR_DETECTED", f"got {d}")


def test_multiple_errors():
    d = decide({"consecutive_errors": 2})
    check("MULTIPLE_ERRORS fires at/above the multiple-errors threshold",
          d is not None and d.trigger == "MULTIPLE_ERRORS", f"got {d}")


def test_zero_errors_triggers_nothing_error_related():
    d = decide({"consecutive_errors": 0})
    check("zero consecutive_errors triggers neither ERROR_DETECTED nor MULTIPLE_ERRORS", d is None, f"got {d}")


def test_reconsideration():
    d = decide({"event_type": "decision_changed", "total_reconsiderations": 1})
    check("RECONSIDERATION fires on a single reconsideration",
          d is not None and d.trigger == "RECONSIDERATION", f"got {d}")


def test_multiple_reconsiderations():
    d = decide({"event_type": "decision_changed", "total_reconsiderations": 2})
    check("MULTIPLE_RECONSIDERATIONS fires at/above the threshold",
          d is not None and d.trigger == "MULTIPLE_RECONSIDERATIONS", f"got {d}")


def test_low_remaining_time():
    d = decide({"remaining_time_seconds": 10})
    check("LOW_REMAINING_TIME fires when remaining_time_seconds is at/below the floor",
          d is not None and d.trigger == "LOW_REMAINING_TIME", f"got {d}")


def test_high_remaining_time_does_not_trigger():
    d = decide({"remaining_time_seconds": 500})
    check("plenty of remaining time triggers nothing time-related", d is None, f"got {d}")


def test_high_idle_time():
    d = decide({"idle_time_seconds": 200})
    check("HIGH_IDLE_TIME fires above the idle threshold",
          d is not None and d.trigger == "HIGH_IDLE_TIME", f"got {d}")


def test_low_idle_time_does_not_trigger():
    d = decide({"idle_time_seconds": 5})
    check("a short idle gap triggers nothing", d is None, f"got {d}")


def test_stress_increase():
    # Stress Declaration feature: declared_stress is a 1-5 scale (see
    # app/models/stress_declaration.py) -- 2 -> 4 is the spec's own
    # worked example of a meaningful increase.
    d = decide({"declared_stress": 4, "previous_declared_stress": 2})
    check("STRESS_INCREASE fires when declared stress jumps by at least the configured delta",
          d is not None and d.trigger == "STRESS_INCREASE", f"got {d}")


def test_small_stress_change_does_not_trigger():
    d = decide({"declared_stress": 3, "previous_declared_stress": 2})
    check("a small stress delta below the threshold triggers nothing", d is None, f"got {d}")


def test_phase_transition():
    d = decide({"phase_changed": True})
    check("PHASE_TRANSITION fires when phase_changed is True",
          d is not None and d.trigger == "PHASE_TRANSITION", f"got {d}")


def test_no_phase_transition_does_not_trigger():
    d = decide({"phase_changed": False})
    check("phase_changed=False triggers nothing on its own", d is None, f"got {d}")


def test_high_accuracy():
    d = decide({"rolling_accuracy": 0.95, "processed_count": 5})
    check("HIGH_ACCURACY fires above the accuracy threshold with enough samples",
          d is not None and d.trigger == "HIGH_ACCURACY", f"got {d}")


def test_low_accuracy():
    d = decide({"rolling_accuracy": 0.2, "processed_count": 5})
    check("LOW_ACCURACY fires below the accuracy threshold with enough samples",
          d is not None and d.trigger == "LOW_ACCURACY", f"got {d}")


def test_accuracy_ignored_with_too_few_samples():
    d = decide({"rolling_accuracy": 0.95, "processed_count": 1})
    check("HIGH_ACCURACY/LOW_ACCURACY never fire below MIN_DECISIONS_FOR_ACCURACY_TRIGGER "
          "(one lucky/unlucky decision shouldn't move the needle)", d is None, f"got {d}")


def test_slow_progress():
    # 300s elapsed of a 600s budget (50% through), but only 1 of 10 emails
    # processed (10% through) -- actual progress well behind expected.
    d = decide({
        "remaining_time_seconds": 300, "total_time_seconds": 600,
        "total_count": 10, "processed_count": 1,
    })
    check("SLOW_PROGRESS fires when actual progress lags expected progress by more than the margin",
          d is not None and d.trigger == "SLOW_PROGRESS", f"got {d}")


def test_on_pace_progress_does_not_trigger_slow_progress():
    d = decide({
        "remaining_time_seconds": 300, "total_time_seconds": 600,
        "total_count": 10, "processed_count": 5,
    })
    check("on-pace progress does not fire SLOW_PROGRESS", d is None, f"got {d}")


# ── Irrelevant / empty events must not fire anything (no gratuitous LLM calls) ─
def test_irrelevant_event_triggers_nothing():
    d = decide({"event_type": "something_the_engine_does_not_recognize"})
    check("an unrecognized event_type with no other signals triggers nothing "
          "(no unnecessary OpenAI call would be scheduled)", d is None, f"got {d}")


def test_empty_facts_triggers_nothing():
    d = decide({})
    check("a completely empty facts dict triggers nothing", d is None, f"got {d}")


def test_none_values_do_not_crash_or_falsely_trigger():
    d = decide({
        "event_type": None, "decision_time_ms": None, "rolling_accuracy": None,
        "consecutive_errors": None, "idle_time_seconds": None, "declared_stress": None,
        "remaining_time_seconds": None, "phase_changed": None,
    })
    check("an all-None facts dict triggers nothing and does not raise", d is None, f"got {d}")


# ── Tone passthrough: the trigger engine never invents its own tone ────────
def test_trigger_engine_never_overrides_the_supplied_tone():
    for tone in (ManagerTone.bienveillant, ManagerTone.neutre, ManagerTone.exigeant, ManagerTone.intrusif):
        d = aria_policy.decide_aria_reaction({"event_type": "task_started"}, tone)
        check(f"decide_aria_reaction echoes back the exact tone it was given ({tone.value})",
              d is not None and d.tone == tone, f"got {d}")


if __name__ == "__main__":
    test_task_started()
    test_task_completed()
    test_fast_decision()
    test_slow_decision()
    test_mid_range_decision_time_triggers_neither()
    test_error_detected_single_error()
    test_multiple_errors()
    test_zero_errors_triggers_nothing_error_related()
    test_reconsideration()
    test_multiple_reconsiderations()
    test_low_remaining_time()
    test_high_remaining_time_does_not_trigger()
    test_high_idle_time()
    test_low_idle_time_does_not_trigger()
    test_stress_increase()
    test_small_stress_change_does_not_trigger()
    test_phase_transition()
    test_no_phase_transition_does_not_trigger()
    test_high_accuracy()
    test_low_accuracy()
    test_accuracy_ignored_with_too_few_samples()
    test_slow_progress()
    test_on_pace_progress_does_not_trigger_slow_progress()
    test_irrelevant_event_triggers_nothing()
    test_empty_facts_triggers_nothing()
    test_none_values_do_not_crash_or_falsely_trigger()
    test_trigger_engine_never_overrides_the_supplied_tone()

    print()
    passed = sum(1 for r in results if r)
    print(f"{passed}/{len(results)} checks passed")
    if passed != len(results):
        sys.exit(1)
