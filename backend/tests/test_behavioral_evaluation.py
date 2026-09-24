"""Tests for the Behavioral Evaluation layer (app/reports/behavioral_evaluation.py)
added by the "Behavioral Evaluation Layer" implementation task -- the
deterministic early-vs-late evolution + signal interpretation + synthesis
this project's own Result-Determination Architecture Audit found missing.

Mix of pure unit tests (constructing plain, un-persisted Task/StressPoint
objects -- same convention as test_behavioral_analytics.py's `_base_report`
helper for productivity/cognitive_load/fatigue) and real-DB/TestClient
integration tests for the new /tasks/{id}/engage endpoint and the report
endpoint's additive behavioral_evaluation field.

Same plain-assert / PASS-FAIL convention as the rest of this suite (no
pytest installed).

Run from backend/ with the venv active:
    python tests/test_behavioral_evaluation.py
"""
import os
import sys
import time
import uuid
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models.enums import TaskDifficulty, TaskStatus, TaskType, Priority
from app.models.task import Task
from app.reports.aggregation import SessionReportData, StressPoint
from app.reports.behavioral_evaluation import (
    BehavioralObservation,
    EvolutionMetric,
    compute_average_transition_time,
    compute_behavioral_evaluation,
    compute_confidence,
    compute_error_evolution,
    compute_pace_evolution,
    compute_pause_evolution,
    compute_performance_evolution,
    compute_stress_evolution,
    compute_transition_times,
    compute_typing_evolution,
    compute_workflow_evolution,
    interpret_signals,
    synthesize,
    task_active_execution_seconds,
    task_pace_efficiency,
)

results = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    results.append(condition)
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))


def _task(**overrides) -> Task:
    base = dict(
        id=uuid.uuid4(), session_id=uuid.uuid4(), type=TaskType.data_validation, title="t",
        status=TaskStatus.completed, priority=Priority.medium, difficulty=None,
        assigned_at=datetime(2026, 1, 1, 9, 0, 0), deadline_seconds=None,
        started_at=None, completed_at=None, time_taken_seconds=None, error_count=0,
        sequence_index=None,
    )
    base.update(overrides)
    return Task(**base)


def _base_report(**overrides) -> SessionReportData:
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


# ── A/B. Task engagement + active execution time (real DB) ─────────────────
client = TestClient(app)


def register_and_login(suffix: str) -> dict:
    email = f"behaveval.{suffix}.{int(time.time() * 1000)}@example.com"
    r = client.post("/auth/register", json={"full_name": "Behav Eval", "email": email, "password": "TestPass123!"})
    assert r.status_code == 201, r.text
    r = client.post("/auth/login", data={"username": email, "password": "TestPass123!"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_engage_sets_started_at_and_is_idempotent_and_ownership_safe():
    headers = register_and_login("engage")
    r = client.post("/sessions/", headers=headers)
    session_id = r.json()["id"]
    r = client.get(f"/sessions/{session_id}/next-task", headers=headers)
    task = r.json()
    check("fetching next-task does NOT set started_at", task["started_at"] is None)

    r = client.post(f"/tasks/{task['id']}/engage", headers=headers)
    check("engage returns 200", r.status_code == 200, r.text)
    first_started_at = r.json()["started_at"]
    check("first engage call sets a real started_at", first_started_at is not None)

    time.sleep(0.05)
    r = client.post(f"/tasks/{task['id']}/engage", headers=headers)
    check("second engage call does NOT overwrite started_at", r.json()["started_at"] == first_started_at)

    other_headers = register_and_login("engage_other")
    r = client.post(f"/tasks/{task['id']}/engage", headers=other_headers)
    check("another user cannot engage this task (403)", r.status_code == 403, r.text)


def test_active_execution_time_uses_started_at_when_present():
    t = _task(started_at=datetime(2026, 1, 1, 9, 0, 0), completed_at=datetime(2026, 1, 1, 9, 2, 0), time_taken_seconds=999)
    active = task_active_execution_seconds(t)
    check("active execution time is completed_at - started_at, NOT time_taken_seconds", active == 120.0, f"got {active}")


def test_active_execution_time_none_without_started_at():
    t = _task(started_at=None, completed_at=datetime(2026, 1, 1, 9, 2, 0), time_taken_seconds=999)
    check("active execution time is None (not a guess) when started_at was never set", task_active_execution_seconds(t) is None)


# ── C. Pace (task-level) ────────────────────────────────────────────────────
def test_pace_faster_than_expected_caps_at_100():
    t = _task(deadline_seconds=120, started_at=datetime(2026, 1, 1, 9, 0, 0), completed_at=datetime(2026, 1, 1, 9, 1, 30))
    sample = task_pace_efficiency(t)
    check("expected=120s actual=90s -> pace_efficiency=100 (capped, matches spec example)", sample.pace_efficiency == 100.0, f"got {sample.pace_efficiency}")
    check("real engagement time used -> not a legacy fallback", sample.is_legacy_fallback is False)


def test_pace_exactly_expected():
    t = _task(deadline_seconds=120, started_at=datetime(2026, 1, 1, 9, 0, 0), completed_at=datetime(2026, 1, 1, 9, 2, 0))
    check("expected=120s actual=120s -> pace_efficiency=100", task_pace_efficiency(t).pace_efficiency == 100.0)


def test_pace_slower_than_expected():
    t = _task(deadline_seconds=120, started_at=datetime(2026, 1, 1, 9, 0, 0), completed_at=datetime(2026, 1, 1, 9, 2, 30))
    sample = task_pace_efficiency(t)
    check("expected=120s actual=150s -> pace_efficiency=80 (matches spec example)", sample.pace_efficiency == 80.0, f"got {sample.pace_efficiency}")


def test_pace_missing_expected_duration_returns_none():
    t = _task(deadline_seconds=None, started_at=datetime(2026, 1, 1, 9, 0, 0), completed_at=datetime(2026, 1, 1, 9, 1, 0))
    check("missing expected duration -> None, never a fabricated value", task_pace_efficiency(t).pace_efficiency is None)


def test_pace_zero_active_time_does_not_crash():
    t = _task(deadline_seconds=60, started_at=datetime(2026, 1, 1, 9, 0, 0), completed_at=datetime(2026, 1, 1, 9, 0, 0))
    sample = task_pace_efficiency(t)
    check("a genuine 0-second active time scores 100, no division-by-zero crash", sample.pace_efficiency == 100.0)


def test_pace_legacy_fallback_uses_time_taken_seconds_and_is_flagged():
    t = _task(deadline_seconds=120, started_at=None, completed_at=datetime(2026, 1, 1, 9, 2, 0), time_taken_seconds=150)
    sample = task_pace_efficiency(t)
    check("legacy task (no started_at) falls back to time_taken_seconds", sample.pace_efficiency == 80.0, f"got {sample.pace_efficiency}")
    check("legacy fallback is explicitly flagged, never silently presented as real engagement data", sample.is_legacy_fallback is True)


# ── D. Pace evolution ────────────────────────────────────────────────────
def _paced_task(seq, deadline, active_seconds):
    start = datetime(2026, 1, 1, 9, 0, 0)
    return _task(sequence_index=seq, deadline_seconds=deadline, started_at=start, completed_at=start + timedelta(seconds=active_seconds))


def test_pace_evolution_accelerating():
    # Efficiencies capped at 100 above the expected duration, so the early
    # samples must stay BELOW it (slower-than-expected) to leave room for a
    # real upward change once the late samples hit/approach the cap.
    tasks = [_paced_task(0, 100, 150), _paced_task(1, 100, 150), _paced_task(2, 100, 100), _paced_task(3, 100, 100)]
    evo = compute_pace_evolution(tasks)
    check("consistently faster completions in the second half -> ACCELERATING", evo.evolution == "ACCELERATING", f"got {evo}")


def test_pace_evolution_slowing():
    tasks = [_paced_task(0, 100, 50), _paced_task(1, 100, 50), _paced_task(2, 100, 150), _paced_task(3, 100, 150)]
    evo = compute_pace_evolution(tasks)
    check("consistently slower completions in the second half -> SLOWING", evo.evolution == "SLOWING", f"got {evo}")


def test_pace_evolution_stable():
    tasks = [_paced_task(i, 100, 100) for i in range(4)]
    evo = compute_pace_evolution(tasks)
    check("no meaningful change in pace -> STABLE", evo.evolution == "STABLE", f"got {evo}")


def test_pace_evolution_insufficient_data():
    evo = compute_pace_evolution([_paced_task(0, 100, 100)])
    check("fewer than 2 pace samples -> INSUFFICIENT_DATA, never a fabricated trend", evo.evolution == "INSUFFICIENT_DATA")
    check("INSUFFICIENT_DATA carries no early/late/change values", evo.early_value is None and evo.late_value is None and evo.change is None)


# ── E. Workflow / transition time ───────────────────────────────────────────
def test_transition_time_single_pair():
    prev = _task(completed_at=datetime(2026, 1, 1, 9, 0, 0))
    nxt = _task(started_at=datetime(2026, 1, 1, 9, 0, 30))
    times = compute_transition_times([prev, nxt])
    check("one consecutive pair with real timestamps produces one transition time", times == [30.0], f"got {times}")


def test_transition_time_missing_started_at_is_skipped():
    prev = _task(completed_at=datetime(2026, 1, 1, 9, 0, 0))
    nxt = _task(started_at=None)  # never engaged
    times = compute_transition_times([prev, nxt])
    check("a pair missing a real started_at contributes no transition time (never measured against assigned_at)", times == [])


def test_workflow_evolution_early_late_split():
    base = datetime(2026, 1, 1, 9, 0, 0)
    tasks = [
        _task(completed_at=base, started_at=base),
        _task(completed_at=base + timedelta(seconds=10), started_at=base + timedelta(seconds=15)),   # transition 5s
        _task(completed_at=base + timedelta(seconds=25), started_at=base + timedelta(seconds=35)),    # transition 10s
        _task(completed_at=base + timedelta(seconds=45), started_at=base + timedelta(seconds=100)),   # transition 55s
        _task(completed_at=base + timedelta(seconds=160), started_at=base + timedelta(seconds=260)),  # transition 100s
    ]
    evo = compute_workflow_evolution(tasks)
    check("transition times lengthening across the session -> SLOWING", evo.evolution == "SLOWING", f"got {evo}")
    avg = compute_average_transition_time(tasks)
    check("average_transition_time is a real, computable number", avg is not None and avg > 0)


def test_workflow_evolution_insufficient_data_for_legacy_session():
    tasks = [_task(completed_at=datetime(2026, 1, 1, 9, 0, 0), started_at=None) for _ in range(4)]
    evo = compute_workflow_evolution(tasks)
    check("a session with no real started_at anywhere (legacy) -> workflow INSUFFICIENT_DATA", evo.evolution == "INSUFFICIENT_DATA")


# ── F. Error evolution ───────────────────────────────────────────────────
def test_error_evolution_increasing():
    tasks = [_task(error_count=0), _task(error_count=0), _task(error_count=3), _task(error_count=4)]
    check("errors concentrated in the second half -> INCREASING", compute_error_evolution(tasks).evolution == "INCREASING")


def test_error_evolution_decreasing():
    tasks = [_task(error_count=4), _task(error_count=3), _task(error_count=0), _task(error_count=0)]
    check("errors concentrated in the first half -> DECREASING", compute_error_evolution(tasks).evolution == "DECREASING")


def test_error_evolution_stable():
    tasks = [_task(error_count=1) for _ in range(4)]
    check("uniform error rate -> STABLE", compute_error_evolution(tasks).evolution == "STABLE")


# ── G. Pause evolution ───────────────────────────────────────────────────
def test_pause_evolution_increasing():
    base = datetime(2026, 1, 1, 9, 0, 0)
    tasks = [
        _task(completed_at=base + timedelta(seconds=100)),
        _task(completed_at=base + timedelta(seconds=200)),
        _task(completed_at=base + timedelta(seconds=500)),
        _task(completed_at=base + timedelta(seconds=800)),
    ]
    # No pauses (gaps < 90s) in the early window; two large gaps in the late window.
    timestamps = [
        base, base + timedelta(seconds=50), base + timedelta(seconds=100), base + timedelta(seconds=150),
        base + timedelta(seconds=200),
        base + timedelta(seconds=400), base + timedelta(seconds=500),
        base + timedelta(seconds=700), base + timedelta(seconds=800),
    ]
    evo = compute_pause_evolution(tasks, timestamps)
    check("pause rate rising in the second half -> INCREASING", evo.evolution == "INCREASING", f"got {evo}")


def test_pause_evolution_insufficient_data():
    evo = compute_pause_evolution([_task(completed_at=datetime(2026, 1, 1, 9, 0, 0))], [])
    check("fewer than 2 completed tasks -> pause evolution INSUFFICIENT_DATA", evo.evolution == "INSUFFICIENT_DATA")


# ── H. Stress evolution ───────────────────────────────────────────────────
def test_stress_evolution_increasing():
    report = _base_report(stress_declarations=[
        StressPoint(value=1, declared_at=datetime(2026, 1, 1, 9, 0)),
        StressPoint(value=2, declared_at=datetime(2026, 1, 1, 9, 5)),
        StressPoint(value=4, declared_at=datetime(2026, 1, 1, 9, 10)),
        StressPoint(value=5, declared_at=datetime(2026, 1, 1, 9, 15)),
    ])
    check("stress rising across the session -> INCREASING", compute_stress_evolution(report).evolution == "INCREASING")


def test_stress_evolution_stable():
    report = _base_report(stress_declarations=[
        StressPoint(value=3, declared_at=datetime(2026, 1, 1, 9, 0)),
        StressPoint(value=3, declared_at=datetime(2026, 1, 1, 9, 10)),
    ])
    check("unchanged declared stress -> STABLE", compute_stress_evolution(report).evolution == "STABLE")


def test_stress_evolution_insufficient_declarations():
    report = _base_report(stress_declarations=[StressPoint(value=3, declared_at=datetime(2026, 1, 1, 9, 0))])
    check("a single declaration -> INSUFFICIENT_DATA, never a fabricated trend", compute_stress_evolution(report).evolution == "INSUFFICIENT_DATA")


# ── Performance evolution (reuses aggregation.py's own halves) ─────────────
def test_performance_evolution_declining():
    report = _base_report(avg_score_first_half=90.0, avg_score_second_half=40.0)
    check("score drop > band -> DECLINING", compute_performance_evolution(report).evolution == "DECLINING")


def test_performance_evolution_insufficient_data():
    report = _base_report(avg_score_first_half=None, avg_score_second_half=None)
    check("no half-split available -> INSUFFICIENT_DATA", compute_performance_evolution(report).evolution == "INSUFFICIENT_DATA")


# ── Typing evolution ────────────────────────────────────────────────────
class _FakeMetricRow:
    def __init__(self, timestamp, metadata_json):
        self.timestamp = timestamp
        self.metadata_json = metadata_json


def test_typing_evolution_none_with_fewer_than_two_rows():
    check("a session with only one typing_metrics row -> None (never fabricated)", compute_typing_evolution([_FakeMetricRow(datetime.utcnow(), {})]) is None)
    check("a session with zero typing_metrics rows -> None", compute_typing_evolution([]) is None)


def test_typing_evolution_computes_when_enough_rows_exist():
    rows = [
        _FakeMetricRow(datetime(2026, 1, 1, 9, 0), {"average_chars_per_second": 2.0, "typing_speed_variation": 1.0}),
        _FakeMetricRow(datetime(2026, 1, 1, 9, 5), {"average_chars_per_second": 4.0, "typing_speed_variation": 3.0}),
    ]
    evo = compute_typing_evolution(rows)
    check("with 2 real typing rows, speed/variation evolution is actually computed", evo is not None and evo.speed.evolution != "INSUFFICIENT_DATA")


# ── I. Signal interpretation (8 named patterns) ─────────────────────────────
def _metric(evolution, early=10.0, late=20.0):
    return EvolutionMetric(early, late, late - early, evolution)


def test_signal_fast_inaccurate():
    obs = interpret_signals(_metric("DECLINING"), _metric("ACCELERATING"), _metric("STABLE"), _metric("STABLE"), _metric("STABLE"), _base_report())
    check("A: fast + inaccurate fires FAST_INACCURATE", any(o.code == "FAST_INACCURATE" for o in obs))


def test_signal_slow_accurate():
    obs = interpret_signals(_metric("STABLE"), _metric("SLOWING"), _metric("STABLE"), _metric("STABLE"), _metric("STABLE"), _base_report())
    check("B: slow + accurate fires SLOW_ACCURATE", any(o.code == "SLOW_ACCURATE" for o in obs))


def test_signal_slow_inaccurate():
    obs = interpret_signals(_metric("DECLINING"), _metric("SLOWING"), _metric("INCREASING"), _metric("STABLE"), _metric("STABLE"), _base_report())
    check("C: slow + inaccurate fires SLOW_INACCURATE", any(o.code == "SLOW_INACCURATE" for o in obs))


def test_signal_fast_accurate():
    obs = interpret_signals(_metric("IMPROVING"), _metric("ACCELERATING"), _metric("DECREASING"), _metric("STABLE"), _metric("STABLE"), _base_report())
    check("D: fast + accurate fires FAST_ACCURATE", any(o.code == "FAST_ACCURATE" for o in obs))


def test_signal_stress_stable_performance():
    obs = interpret_signals(_metric("STABLE"), _metric("STABLE"), _metric("STABLE"), _metric("STABLE"), _metric("INCREASING"), _base_report())
    check("E: rising stress + stable performance fires STRESS_STABLE_PERFORMANCE", any(o.code == "STRESS_STABLE_PERFORMANCE" for o in obs))


def test_signal_stress_performance_decline():
    obs = interpret_signals(_metric("DECLINING"), _metric("STABLE"), _metric("STABLE"), _metric("STABLE"), _metric("INCREASING"), _base_report())
    check("F: rising stress + declining performance fires STRESS_PERFORMANCE_DECLINE", any(o.code == "STRESS_PERFORMANCE_DECLINE" for o in obs))


def test_signal_pauses_high_accuracy():
    report = _base_report(avg_score_overall=90.0)
    obs = interpret_signals(_metric("STABLE"), _metric("STABLE"), _metric("STABLE"), _metric("INCREASING"), _metric("STABLE"), report)
    check("G: many pauses + high accuracy fires PAUSES_HIGH_ACCURACY", any(o.code == "PAUSES_HIGH_ACCURACY" for o in obs))


def test_signal_errors_normal_pace():
    obs = interpret_signals(_metric("STABLE"), _metric("STABLE"), _metric("INCREASING"), _metric("STABLE"), _metric("STABLE"), _base_report())
    check("H: increasing errors + normal pace fires ERRORS_NORMAL_PACE", any(o.code == "ERRORS_NORMAL_PACE" for o in obs))


def test_fast_and_slow_accurate_wording_does_not_imply_high_absolute_accuracy():
    """Wording correction (calibration review finding): FAST_ACCURATE/
    SLOW_ACCURATE are direction-only conditions (fire identically at 0%
    and 100% average score -- see test_pace_calculation_is_identical...
    style edge-case coverage in the sensitivity analysis). The human-
    facing text must therefore never claim/imply a high or good absolute
    accuracy level -- only the absence of an observed decline. The
    underlying classification LOGIC is unchanged by this test; only the
    wording is checked.
    """
    slow_obs = interpret_signals(_metric("STABLE"), _metric("SLOWING"), _metric("STABLE"), _metric("STABLE"), _metric("STABLE"), _base_report())
    fast_obs = interpret_signals(_metric("IMPROVING"), _metric("ACCELERATING"), _metric("DECREASING"), _metric("STABLE"), _metric("STABLE"), _base_report())
    slow = next(o for o in slow_obs if o.code == "SLOW_ACCURATE")
    fast = next(o for o in fast_obs if o.code == "FAST_ACCURATE")
    banned_terms = ["accura", "efficient", "high accuracy", "good accuracy"]  # "accura" catches "accuracy"/"accurate"
    for obs in (slow, fast):
        text = (obs.title + " " + obs.description).lower()
        check(f"{obs.code} wording avoids terms implying high/good absolute accuracy", not any(t in text for t in banned_terms), f"text={text!r}")
        check(f"{obs.code} wording states the absence of a decline, not an accuracy claim", "decline" in obs.description.lower())


def test_signals_no_diagnostic_language():
    obs = interpret_signals(_metric("DECLINING"), _metric("SLOWING"), _metric("INCREASING"), _metric("INCREASING"), _metric("INCREASING"), _base_report(avg_score_overall=90.0))
    banned_terms = ["anxious", "anxiety", "burnout", "exhaustion", "diagnosis", "disorder", "personality"]
    text = " ".join(o.title + " " + o.description for o in obs).lower()
    check("no observation uses medical/psychological/diagnostic language", not any(term in text for term in banned_terms))


# ── K. Behavioral synthesis + confidence ────────────────────────────────
def test_confidence_bands():
    check("0 completed tasks -> INSUFFICIENT_DATA", compute_confidence(0) == "INSUFFICIENT_DATA")
    check("1 completed task -> INSUFFICIENT_DATA", compute_confidence(1) == "INSUFFICIENT_DATA")
    check("2 completed tasks -> LOW", compute_confidence(2) == "LOW")
    check("4 completed tasks -> MODERATE", compute_confidence(4) == "MODERATE")
    check("6 completed tasks -> HIGH", compute_confidence(6) == "HIGH")


def test_synthesis_picks_highest_priority_combination():
    obs = [
        BehavioralObservation(code="FAST_ACCURATE", title="t1", description="d1"),
        BehavioralObservation(code="SLOW_INACCURATE", title="t2", description="d2"),
    ]
    primary, confidence = synthesize(obs, _metric("DECLINING"), total_tasks_completed=6)
    check("synthesis deterministically picks the higher-priority observation regardless of list order", primary is not None and primary.code == "SLOW_INACCURATE")
    check("confidence is derived purely from data coverage (6 tasks -> HIGH)", confidence == "HIGH")


def test_synthesis_falls_back_to_plain_performance_when_no_combination_fires():
    primary, _ = synthesize([], _metric("DECLINING"), total_tasks_completed=4)
    check("no combination pattern fired -> falls back to a plain PERFORMANCE_DECLINE observation", primary is not None and primary.code == "PERFORMANCE_DECLINE")


def test_synthesis_insufficient_data_never_fabricates_a_primary_observation():
    insufficient = EvolutionMetric(None, None, None, "INSUFFICIENT_DATA")
    primary, confidence = synthesize([], insufficient, total_tasks_completed=1)
    check("no data anywhere -> no primary observation is invented", primary is None)
    check("confidence correctly reflects insufficient coverage", confidence == "INSUFFICIENT_DATA")


# ── J. Difficulty awareness -- pace is difficulty-AGNOSTIC by design (no
# normalization introduced at this layer, per the task's own instruction) ──
def test_pace_calculation_is_identical_regardless_of_difficulty_field():
    start = datetime(2026, 1, 1, 9, 0, 0)
    with_difficulty = _task(deadline_seconds=100, difficulty=TaskDifficulty.hard, started_at=start, completed_at=start + timedelta(seconds=100))
    without_difficulty = _task(deadline_seconds=100, difficulty=None, started_at=start, completed_at=start + timedelta(seconds=100))
    check("pace_efficiency uses the task's own deadline_seconds (already difficulty-derived upstream by TaskEngine) and never re-normalizes by difficulty here",
          task_pace_efficiency(with_difficulty).pace_efficiency == task_pace_efficiency(without_difficulty).pace_efficiency)


# ── L. Report integration (real DB) ─────────────────────────────────────
def test_report_includes_behavioral_evaluation_and_preserves_existing_fields():
    headers = register_and_login("report")
    r = client.post("/sessions/", headers=headers)
    session_id = r.json()["id"]
    # Drive one real task through engage -> complete so the report has at
    # least some real completed-task data to work with.
    r = client.get(f"/sessions/{session_id}/next-task", headers=headers)
    task = r.json()
    client.post(f"/tasks/{task['id']}/engage", headers=headers)
    client.post(f"/tasks/{task['id']}/complete", headers=headers, json={"flagged_ids": []})
    client.post(f"/sessions/{session_id}/abandon", headers=headers)

    db = SessionLocal()
    from app.models.session import Session as SessionModel
    from app.models.enums import SessionStatus
    session_row = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    session_row.status = SessionStatus.completed
    db.commit()
    db.close()

    r = client.get(f"/sessions/{session_id}/report", headers=headers)
    check("report endpoint still returns 200", r.status_code == 200, r.text)
    body = r.json()
    check("behavioral_evaluation is present in the report", "behavioral_evaluation" in body)
    check("behavioral_evaluation has the expected top-level shape", body["behavioral_evaluation"] is None or set(body["behavioral_evaluation"].keys()) >= {"performance", "pace", "errors", "pauses", "workflow", "stress", "observations", "primary_observation", "confidence", "disclaimer"})
    check("pre-existing report_data/fatigue_score/recommendations fields remain intact (no breaking change)",
          {"report_data", "fatigue_score", "recommendations", "productivity_index", "cognitive_load_estimate", "behavioral_metrics"} <= set(body.keys()))
    check("recommendations still return a real list (recommendation engine unaffected)", isinstance(body["recommendations"], list) and len(body["recommendations"]) > 0)
    if body["recommendations"]:
        check("each recommendation now carries a source_observation key (additive, may be null)", "source_observation" in body["recommendations"][0])


def test_compute_behavioral_evaluation_does_not_crash_on_an_empty_session():
    from app.reports.aggregation import get_session_report_data
    headers = register_and_login("empty")
    r = client.post("/sessions/", headers=headers)
    session_id = r.json()["id"]
    db = SessionLocal()
    report = get_session_report_data(db, session_id)
    evaluation = compute_behavioral_evaluation(db, session_id, report)
    db.close()
    check("a zero-task session produces a valid BehavioralEvaluationData, not a crash", evaluation is not None)
    check("every evolution metric on an empty session is INSUFFICIENT_DATA", all(
        getattr(evaluation, field).evolution == "INSUFFICIENT_DATA"
        for field in ("performance", "pace", "errors", "pauses", "workflow", "stress")
    ))
    check("no primary observation is fabricated for an empty session", evaluation.primary_observation is None)
    check("confidence correctly reflects zero completed tasks", evaluation.confidence == "INSUFFICIENT_DATA")


if __name__ == "__main__":
    test_engage_sets_started_at_and_is_idempotent_and_ownership_safe()
    test_active_execution_time_uses_started_at_when_present()
    test_active_execution_time_none_without_started_at()
    test_pace_faster_than_expected_caps_at_100()
    test_pace_exactly_expected()
    test_pace_slower_than_expected()
    test_pace_missing_expected_duration_returns_none()
    test_pace_zero_active_time_does_not_crash()
    test_pace_legacy_fallback_uses_time_taken_seconds_and_is_flagged()
    test_pace_evolution_accelerating()
    test_pace_evolution_slowing()
    test_pace_evolution_stable()
    test_pace_evolution_insufficient_data()
    test_transition_time_single_pair()
    test_transition_time_missing_started_at_is_skipped()
    test_workflow_evolution_early_late_split()
    test_workflow_evolution_insufficient_data_for_legacy_session()
    test_error_evolution_increasing()
    test_error_evolution_decreasing()
    test_error_evolution_stable()
    test_pause_evolution_increasing()
    test_pause_evolution_insufficient_data()
    test_stress_evolution_increasing()
    test_stress_evolution_stable()
    test_stress_evolution_insufficient_declarations()
    test_performance_evolution_declining()
    test_performance_evolution_insufficient_data()
    test_typing_evolution_none_with_fewer_than_two_rows()
    test_typing_evolution_computes_when_enough_rows_exist()
    test_signal_fast_inaccurate()
    test_signal_slow_accurate()
    test_signal_slow_inaccurate()
    test_signal_fast_accurate()
    test_signal_stress_stable_performance()
    test_signal_stress_performance_decline()
    test_signal_pauses_high_accuracy()
    test_signal_errors_normal_pace()
    test_fast_and_slow_accurate_wording_does_not_imply_high_absolute_accuracy()
    test_signals_no_diagnostic_language()
    test_confidence_bands()
    test_synthesis_picks_highest_priority_combination()
    test_synthesis_falls_back_to_plain_performance_when_no_combination_fires()
    test_synthesis_insufficient_data_never_fabricates_a_primary_observation()
    test_pace_calculation_is_identical_regardless_of_difficulty_field()
    test_report_includes_behavioral_evaluation_and_preserves_existing_fields()
    test_compute_behavioral_evaluation_does_not_crash_on_an_empty_session()

    print()
    passed = sum(1 for r in results if r)
    print(f"{passed}/{len(results)} checks passed")
    if passed != len(results):
        sys.exit(1)
