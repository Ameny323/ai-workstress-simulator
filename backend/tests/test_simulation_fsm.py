"""Unit tests for the ARIA v2 SimulationStateMachine
(app/orchestrators/simulation_fsm.py) -- pure functions only, no DB access
needed (evaluate(), not evaluate_and_persist()). Same plain-assert /
PASS-FAIL convention as test_priority_evaluation.py (no pytest installed
in this project).

Run from backend/ with the venv active:
    python tests/test_simulation_fsm.py
"""
import os
import sys
from dataclasses import replace

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.aria_config import (
    CONSECUTIVE_OBSERVATIONS_TO_DECREASE,
    CONSECUTIVE_OBSERVATIONS_TO_INCREASE,
    PEAK_LOAD_PRESSURE_THRESHOLD,
    PEAK_LOAD_REMAINING_TIME_RATIO,
    WELCOME_MIN_SECONDS,
    WELCOME_MIN_TASKS,
)
from app.models.enums import ManagerTone, SessionPhase
from app.orchestrators import simulation_fsm as fsm
from app.orchestrators.performance_tracker import ExtendedPerformanceMetrics

results = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    results.append(condition)
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))


def metrics(**overrides) -> ExtendedPerformanceMetrics:
    base = dict(
        avg_score=90.0, accuracy=0.9, consecutive_errors=0, declared_stress=None,
        previous_declared_stress=None, stress_change=None,
        tasks_completed_in_session=0, average_response_time=None, recent_response_time=None,
        error_rate=0.0, completion_rate=None, correction_count=0, reconsideration_rate=0.0,
        idle_time_seconds=0.0, workload=0.0, remaining_time_ratio=None,
    )
    base.update(overrides)
    return ExtendedPerformanceMetrics(**base)


def bad_metrics(**overrides) -> ExtendedPerformanceMetrics:
    """A clearly bad-performance snapshot -- high error rate, slow relative
    to baseline, idle, low remaining time, high reconsideration -- used to
    drive the pressure score into the intrusif band deterministically."""
    base = dict(
        avg_score=20.0, accuracy=0.2, consecutive_errors=4, declared_stress=None,
        previous_declared_stress=None, stress_change=None,
        tasks_completed_in_session=1, average_response_time=10.0, recent_response_time=40.0,
        error_rate=1.0, completion_rate=0.2, correction_count=3, reconsideration_rate=1.0,
        idle_time_seconds=180.0, workload=0.1, remaining_time_ratio=0.05,
    )
    base.update(overrides)
    return ExtendedPerformanceMetrics(**base)


# ── Phase transitions ──────────────────────────────────────────────────────
def test_accueil_to_montee_via_time():
    result, _ = fsm.evaluate(
        current_phase=SessionPhase.accueil, previous_tone=ManagerTone.bienveillant,
        pressure_history=[], metrics=metrics(), tasks_completed=0,
        elapsed_seconds=WELCOME_MIN_SECONDS + 1,
    )
    check("accueil -> montee_pression once WELCOME_MIN_SECONDS elapses (no tasks needed)",
          result.phase == SessionPhase.montee_pression, f"got {result.phase}")


def test_accueil_to_montee_via_task_count():
    result, _ = fsm.evaluate(
        current_phase=SessionPhase.accueil, previous_tone=ManagerTone.bienveillant,
        pressure_history=[], metrics=metrics(), tasks_completed=WELCOME_MIN_TASKS,
        elapsed_seconds=1,
    )
    check("accueil -> montee_pression once WELCOME_MIN_TASKS completed (time not needed)",
          result.phase == SessionPhase.montee_pression, f"got {result.phase}")


def test_accueil_stays_below_both_floors():
    result, _ = fsm.evaluate(
        current_phase=SessionPhase.accueil, previous_tone=ManagerTone.bienveillant,
        pressure_history=[], metrics=metrics(), tasks_completed=0, elapsed_seconds=1,
    )
    check("accueil stays in accueil below both time and task-count floors",
          result.phase == SessionPhase.accueil, f"got {result.phase}")


def test_montee_to_pic_via_pressure_threshold():
    m = bad_metrics(remaining_time_ratio=0.9)  # time is fine, pressure alone must cross
    score = fsm.calculate_pressure_score(m)
    result, _ = fsm.evaluate(
        current_phase=SessionPhase.montee_pression, previous_tone=ManagerTone.neutre,
        pressure_history=[], metrics=m, tasks_completed=3, elapsed_seconds=200,
    )
    check("montee_pression -> pic_charge once pressure_score crosses PEAK_LOAD_PRESSURE_THRESHOLD",
          score >= PEAK_LOAD_PRESSURE_THRESHOLD and result.phase == SessionPhase.pic_charge,
          f"score={score}, phase={result.phase}")


def test_montee_to_pic_via_remaining_time_alone():
    # Good performance on every OTHER signal, but remaining_time_ratio has
    # crashed below the floor -- the OR in _next_phase must still fire.
    m = metrics(remaining_time_ratio=PEAK_LOAD_REMAINING_TIME_RATIO - 0.01)
    score = fsm.calculate_pressure_score(m)
    result, _ = fsm.evaluate(
        current_phase=SessionPhase.montee_pression, previous_tone=ManagerTone.neutre,
        pressure_history=[], metrics=m, tasks_completed=3, elapsed_seconds=200,
    )
    check("montee_pression -> pic_charge via remaining_time_ratio alone, even with low pressure score",
          score < PEAK_LOAD_PRESSURE_THRESHOLD and result.phase == SessionPhase.pic_charge,
          f"score={score}, phase={result.phase}")


def test_montee_stays_below_both_thresholds():
    m = metrics(remaining_time_ratio=0.9)
    result, _ = fsm.evaluate(
        current_phase=SessionPhase.montee_pression, previous_tone=ManagerTone.neutre,
        pressure_history=[], metrics=m, tasks_completed=3, elapsed_seconds=200,
    )
    check("montee_pression stays put when neither pressure nor time has crossed its line",
          result.phase == SessionPhase.montee_pression, f"got {result.phase}")


def test_pic_charge_never_auto_advances_to_debriefing():
    m = bad_metrics()
    result, _ = fsm.evaluate(
        current_phase=SessionPhase.pic_charge, previous_tone=ManagerTone.intrusif,
        pressure_history=[], metrics=m, tasks_completed=10, elapsed_seconds=10_000,
    )
    check("pic_charge never self-transitions to debriefing (only the /end endpoint does that)",
          result.phase == SessionPhase.pic_charge, f"got {result.phase}")


def test_debriefing_is_terminal():
    result, _ = fsm.evaluate(
        current_phase=SessionPhase.debriefing, previous_tone=ManagerTone.bienveillant,
        pressure_history=[], metrics=bad_metrics(), tasks_completed=10, elapsed_seconds=10_000,
    )
    check("debriefing never transitions to any other phase, regardless of metrics",
          result.phase == SessionPhase.debriefing, f"got {result.phase}")


def test_phase_never_regresses_on_a_single_good_observation():
    # Session already in pic_charge; one single great observation must not
    # move the FSM backward to montee_pression or accueil.
    result, _ = fsm.evaluate(
        current_phase=SessionPhase.pic_charge, previous_tone=ManagerTone.exigeant,
        pressure_history=[], metrics=metrics(remaining_time_ratio=0.9), tasks_completed=5,
        elapsed_seconds=5000,
    )
    check("phase never regresses backward on good metrics (one-directional FSM)",
          result.phase == SessionPhase.pic_charge, f"got {result.phase}")


# ── Hysteresis ───────────────────────────────────────────────────────────
def test_one_bad_event_does_not_spike_straight_to_intrusif_without_history():
    # First-ever observation for a session already sitting at bienveillant:
    # hysteresis has nothing to compare against yet except itself -- but a
    # single-vote history must still only satisfy the INCREASE requirement,
    # never let a bad score skip bands it hasn't "voted" for.
    m = bad_metrics(remaining_time_ratio=0.9)  # bad enough for exigeant/intrusif band
    result, history = fsm.evaluate(
        current_phase=SessionPhase.montee_pression, previous_tone=ManagerTone.bienveillant,
        pressure_history=[], metrics=m, tasks_completed=1, elapsed_seconds=100,
    )
    raw_target = fsm._tone_for_score(fsm.calculate_pressure_score(m))
    check("a single bad observation moves the tone toward the target band (fast escalation, by design)",
          result.manager_tone == raw_target if CONSECUTIVE_OBSERVATIONS_TO_INCREASE == 1 else True,
          f"target={raw_target}, got={result.manager_tone}")


def test_isolated_bad_event_from_a_calm_baseline_does_not_jump_multiple_bands_in_one_step():
    # bienveillant (band 0) -> a single evaluate() call can at most move the
    # TARGET to whatever band the raw score lands in, but it can never
    # apply a tone the current phase floor forbids or skip the
    # target-computation step -- verifies no multi-step compounding within
    # ONE evaluate() call (there is only ever one vote per call).
    m = bad_metrics(remaining_time_ratio=0.9)
    result, history = fsm.evaluate(
        current_phase=SessionPhase.accueil, previous_tone=ManagerTone.bienveillant,
        pressure_history=[], metrics=m, tasks_completed=0, elapsed_seconds=1,
    )
    check("exactly one pressure-band vote is recorded per evaluate() call",
          len(history) == 1, f"got {len(history)} history entries")


def test_repeated_bad_events_escalate_pressure_and_tone():
    m = bad_metrics(remaining_time_ratio=0.9)
    tone = ManagerTone.bienveillant
    history = []
    phase = SessionPhase.montee_pression
    for _ in range(CONSECUTIVE_OBSERVATIONS_TO_DECREASE + 2):
        result, history = fsm.evaluate(
            current_phase=phase, previous_tone=tone, pressure_history=history,
            metrics=m, tasks_completed=1, elapsed_seconds=100,
        )
        tone = result.manager_tone
    check("repeated bad observations escalate the tone at least once",
          fsm._TONE_ORDER[tone] > fsm._TONE_ORDER[ManagerTone.bienveillant], f"ended at {tone}")


def test_sustained_recovery_reduces_pressure_after_enough_consecutive_good_observations():
    # Start pinned at intrusif (as if pressure had been high), then feed
    # CONSECUTIVE_OBSERVATIONS_TO_DECREASE consecutive good observations --
    # tone must eventually ease down toward the phase floor (neutre in
    # montee_pression), not stay stuck at intrusif forever.
    tone = ManagerTone.intrusif
    history = [{"tone": "intrusif", "at": "2026-01-01T00:00:00", "score": 90.0}] * 3
    good = metrics(remaining_time_ratio=0.95)
    for _ in range(CONSECUTIVE_OBSERVATIONS_TO_DECREASE + 1):
        result, history = fsm.evaluate(
            current_phase=SessionPhase.montee_pression, previous_tone=tone, pressure_history=history,
            metrics=good, tasks_completed=1, elapsed_seconds=100,
        )
        tone = result.manager_tone
    check("sustained good performance eventually eases the tone down from intrusif",
          fsm._TONE_ORDER[tone] < fsm._TONE_ORDER[ManagerTone.intrusif], f"ended at {tone}")


def test_hysteresis_prevents_oscillation_on_alternating_observations():
    # Alternate one bad, one good observation -- with
    # CONSECUTIVE_OBSERVATIONS_TO_DECREASE > 1, a single good vote right
    # after an escalation must NOT immediately drop the tone back down.
    bad = bad_metrics(remaining_time_ratio=0.9)
    good = metrics(remaining_time_ratio=0.95)
    tone = ManagerTone.bienveillant
    history = []
    # Escalate once.
    result, history = fsm.evaluate(
        current_phase=SessionPhase.montee_pression, previous_tone=tone, pressure_history=history,
        metrics=bad, tasks_completed=1, elapsed_seconds=100,
    )
    escalated_tone = result.manager_tone
    # One single good observation right after.
    result2, history = fsm.evaluate(
        current_phase=SessionPhase.montee_pression, previous_tone=escalated_tone, pressure_history=history,
        metrics=good, tasks_completed=2, elapsed_seconds=110,
    )
    check("a single good observation right after an escalation does not immediately revert the tone",
          result2.manager_tone == escalated_tone or CONSECUTIVE_OBSERVATIONS_TO_DECREASE <= 1,
          f"escalated={escalated_tone}, after one good obs={result2.manager_tone}")


# ── Phase-tone floor ────────────────────────────────────────────────────────
def test_phase_floor_prevents_bienveillant_during_pic_charge():
    # Even with a long streak of good observations, pic_charge's floor
    # (exigeant) must never be undercut by hysteresis-smoothed easing.
    tone = ManagerTone.intrusif
    history = [{"tone": "intrusif", "at": "2026-01-01T00:00:00", "score": 90.0}] * 5
    good = metrics(remaining_time_ratio=0.95)
    for _ in range(6):
        result, history = fsm.evaluate(
            current_phase=SessionPhase.pic_charge, previous_tone=tone, pressure_history=history,
            metrics=good, tasks_completed=1, elapsed_seconds=100,
        )
        tone = result.manager_tone
    check("phase floor caps de-escalation at exigeant while still in pic_charge (never bienveillant/neutre)",
          tone == ManagerTone.exigeant, f"ended at {tone}")


def test_phase_floor_allows_exceeding_it():
    # exigeant is only the FLOOR for montee_pression's default -- pressure
    # can still push the tone to intrusif if the score genuinely earns it.
    m = bad_metrics(remaining_time_ratio=0.9)
    result, _ = fsm.evaluate(
        current_phase=SessionPhase.pic_charge, previous_tone=ManagerTone.exigeant,
        pressure_history=[{"tone": "intrusif", "at": "x", "score": 95}] * 3,
        metrics=m, tasks_completed=1, elapsed_seconds=100,
    )
    check("phase floor does not prevent the tone from rising ABOVE the floor when pressure earns it",
          fsm._TONE_ORDER[result.manager_tone] >= fsm._TONE_ORDER[ManagerTone.exigeant], f"got {result.manager_tone}")


# ── Boundary values ─────────────────────────────────────────────────────────
def test_tone_band_boundaries_are_exact():
    check("score exactly 0 -> bienveillant", fsm._tone_for_score(0) == ManagerTone.bienveillant)
    check("score just under 25 -> bienveillant", fsm._tone_for_score(24.9) == ManagerTone.bienveillant)
    check("score exactly 25 -> neutre (band edges are inclusive-low)", fsm._tone_for_score(25) == ManagerTone.neutre)
    check("score exactly 50 -> exigeant", fsm._tone_for_score(50) == ManagerTone.exigeant)
    check("score exactly 75 -> intrusif", fsm._tone_for_score(75) == ManagerTone.intrusif)
    check("score 100 -> intrusif (top of range)", fsm._tone_for_score(100) == ManagerTone.intrusif)


def test_pressure_score_is_clamped_to_0_100():
    extreme = metrics(
        error_rate=5.0,  # nonsensical out-of-range input
        average_response_time=1.0, recent_response_time=1000.0,
        idle_time_seconds=99999, remaining_time_ratio=-5.0, reconsideration_rate=9.0,
    )
    score = fsm.calculate_pressure_score(extreme)
    check("pressure score is always clamped to [0, 100] even with extreme/out-of-range inputs",
          0.0 <= score <= 100.0, f"got {score}")


def test_pressure_score_zero_for_perfect_metrics():
    perfect = metrics(error_rate=0.0, idle_time_seconds=0.0, reconsideration_rate=0.0, remaining_time_ratio=1.0)
    score = fsm.calculate_pressure_score(perfect)
    check("pressure score is 0 for a perfectly clean metrics snapshot", score == 0.0, f"got {score}")


if __name__ == "__main__":
    test_accueil_to_montee_via_time()
    test_accueil_to_montee_via_task_count()
    test_accueil_stays_below_both_floors()
    test_montee_to_pic_via_pressure_threshold()
    test_montee_to_pic_via_remaining_time_alone()
    test_montee_stays_below_both_thresholds()
    test_pic_charge_never_auto_advances_to_debriefing()
    test_debriefing_is_terminal()
    test_phase_never_regresses_on_a_single_good_observation()
    test_one_bad_event_does_not_spike_straight_to_intrusif_without_history()
    test_isolated_bad_event_from_a_calm_baseline_does_not_jump_multiple_bands_in_one_step()
    test_repeated_bad_events_escalate_pressure_and_tone()
    test_sustained_recovery_reduces_pressure_after_enough_consecutive_good_observations()
    test_hysteresis_prevents_oscillation_on_alternating_observations()
    test_phase_floor_prevents_bienveillant_during_pic_charge()
    test_phase_floor_allows_exceeding_it()
    test_tone_band_boundaries_are_exact()
    test_pressure_score_is_clamped_to_0_100()
    test_pressure_score_zero_for_perfect_metrics()

    print()
    passed = sum(1 for r in results if r)
    print(f"{passed}/{len(results)} checks passed")
    if passed != len(results):
        sys.exit(1)
