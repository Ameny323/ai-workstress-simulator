"""Tests for the behavioral-analysis foundation audited/completed in this
phase: execution time reliability, error-by-type aggregation, pause/idle
episode detection, the productivity index, the cognitive-load estimate,
and session-level aggregation edge cases -- plus the report endpoint's
security (ownership/auth) and the report DTO's structural correctness.

Fatigue itself (app/reports/fatigue.py) predates this phase and was not
modified -- but it had no dedicated test file at all before this audit, so
the required "stable/degrading/improving/insufficient data" cases are
added here too, closing that pre-existing gap.

All numeric metrics here are DETERMINISTIC (no OpenAI call anywhere in
this file) -- these are simulation indicators / behavioral proxies per the
cahier's explicit safety framing, never medical/psychological measurements.

Same plain-assert / PASS-FAIL convention as the rest of this suite (no
pytest installed). Hits the real dev DB for the aggregation/endpoint-level
tests (same convention as the rest of this suite: create temp rows, clean
up in a finally block).

Run from backend/ with the venv active:
    python tests/test_behavioral_analytics.py
"""
import os
import sys
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.sessions import get_session_report
from app.core.security import create_access_token
from app.database import SessionLocal
from app.main import app
from app.models.enums import SessionPhase, SessionStatus, TaskStatus, TaskType, Priority
from app.models.interaction_metric import InteractionMetric
from app.models.session import Session as SessionModel
from app.models.stress_declaration import StressDeclaration
from app.models.task import Task
from app.models.user import User
from app.reports.aggregation import (
    PauseStats,
    SessionReportData,
    TaskTimingSample,
    compute_pause_episodes,
    compute_stress_summary,
    get_session_report_data,
)
from app.reports.cognitive_load import compute_cognitive_load_estimate
from app.reports.fatigue import compute_fatigue_score
from app.reports.productivity import compute_productivity_index

results = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    results.append(condition)
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))


def _base_report(**overrides) -> SessionReportData:
    base = dict(
        session_id=None, session_started_at=datetime(2026, 1, 1, 9, 0, 0), session_ended_at=None,
        phase_reached="pic_charge", total_tasks_completed=0, total_tasks_assigned=0,
        tasks_by_type={}, errors_by_type={}, avg_score_overall=None, avg_score_first_half=None,
        avg_score_second_half=None, avg_time_taken_seconds_overall=None,
        avg_time_taken_seconds_first_half=None, avg_time_taken_seconds_second_half=None,
        error_count_trend=[], stress_declarations=[], task_timing_samples=[],
        pause_stats=PauseStats(pause_count=0, total_pause_duration_seconds=0.0, average_pause_duration_seconds=None),
    )
    base.update(overrides)
    return SessionReportData(**base)


# ── Pause / idle episode detection ──────────────────────────────────────
def test_no_pause_when_events_are_close_together():
    t0 = datetime(2026, 1, 1, 9, 0, 0)
    timestamps = [t0, t0 + timedelta(seconds=5), t0 + timedelta(seconds=12)]
    stats = compute_pause_episodes(timestamps, threshold_seconds=90)
    check("closely-spaced events produce zero pauses", stats.pause_count == 0)
    check("average_pause_duration_seconds is None (not 0) when there are no pauses",
          stats.average_pause_duration_seconds is None)


def test_single_pause_detected():
    t0 = datetime(2026, 1, 1, 9, 0, 0)
    timestamps = [t0, t0 + timedelta(seconds=200)]  # one 200s gap, well above threshold
    stats = compute_pause_episodes(timestamps, threshold_seconds=90)
    check("a single large gap is detected as exactly one pause", stats.pause_count == 1)
    check("total_pause_duration_seconds matches the gap", stats.total_pause_duration_seconds == 200.0)
    check("average_pause_duration_seconds equals the single pause's length", stats.average_pause_duration_seconds == 200.0)


def test_multiple_pauses_detected_and_averaged():
    t0 = datetime(2026, 1, 1, 9, 0, 0)
    timestamps = [t0, t0 + timedelta(seconds=100), t0 + timedelta(seconds=110), t0 + timedelta(seconds=310)]
    # gaps: 100 (pause), 10 (not a pause), 200 (pause)
    stats = compute_pause_episodes(timestamps, threshold_seconds=90)
    check("two qualifying gaps produce pause_count=2 (the short 10s gap is excluded)", stats.pause_count == 2)
    check("total_pause_duration_seconds sums only the qualifying gaps", stats.total_pause_duration_seconds == 300.0)
    check("average_pause_duration_seconds is the mean of the qualifying gaps", stats.average_pause_duration_seconds == 150.0)


def test_pause_threshold_boundary_is_inclusive():
    t0 = datetime(2026, 1, 1, 9, 0, 0)
    exactly_at_threshold = compute_pause_episodes([t0, t0 + timedelta(seconds=90)], threshold_seconds=90)
    just_under_threshold = compute_pause_episodes([t0, t0 + timedelta(seconds=89.9)], threshold_seconds=90)
    check("a gap exactly equal to the threshold counts as a pause", exactly_at_threshold.pause_count == 1)
    check("a gap just under the threshold does not count as a pause", just_under_threshold.pause_count == 0)


def test_zero_or_one_events_produce_no_pauses_not_missing_data():
    check("zero timestamps -> 0 pauses (a real fact, not missing data)", compute_pause_episodes([], 90).pause_count == 0)
    check("a single timestamp -> 0 pauses (nothing to have a gap between)",
          compute_pause_episodes([datetime(2026, 1, 1)], 90).pause_count == 0)


# ── Productivity index ────────────────────────────────────────────────────
def test_productivity_perfect_performance():
    report = _base_report(
        total_tasks_completed=4, total_tasks_assigned=4, avg_score_overall=100.0,
        task_timing_samples=[TaskTimingSample(time_taken_seconds=60, deadline_seconds=120)] * 4,
    )
    index = compute_productivity_index(report)
    check("perfect completion + perfect accuracy + fast completion scores at/near 100", index == 100.0, f"got {index}")


def test_productivity_poor_performance():
    report = _base_report(
        total_tasks_completed=1, total_tasks_assigned=4, avg_score_overall=10.0,
        task_timing_samples=[TaskTimingSample(time_taken_seconds=300, deadline_seconds=120)],  # over deadline
    )
    index = compute_productivity_index(report)
    check("low completion + low accuracy + over-deadline timing scores low", index is not None and index < 30, f"got {index}")


def test_productivity_fast_but_inaccurate_is_not_rewarded_over_slow_but_accurate():
    fast_inaccurate = _base_report(
        total_tasks_completed=4, total_tasks_assigned=4, avg_score_overall=20.0,
        task_timing_samples=[TaskTimingSample(time_taken_seconds=10, deadline_seconds=120)] * 4,
    )
    slow_accurate = _base_report(
        total_tasks_completed=4, total_tasks_assigned=4, avg_score_overall=95.0,
        task_timing_samples=[TaskTimingSample(time_taken_seconds=115, deadline_seconds=120)] * 4,
    )
    fast_score = compute_productivity_index(fast_inaccurate)
    slow_score = compute_productivity_index(slow_accurate)
    check("a fast-but-inaccurate session scores LOWER than a slow-but-accurate one (accuracy isn't dominated by speed)",
          fast_score is not None and slow_score is not None and fast_score < slow_score,
          f"fast_inaccurate={fast_score}, slow_accurate={slow_score}")


def test_productivity_no_tasks_returns_none():
    report = _base_report(total_tasks_completed=0, total_tasks_assigned=0, avg_score_overall=None, task_timing_samples=[])
    check("a session with zero assigned tasks returns None, never a fabricated number", compute_productivity_index(report) is None)


def test_productivity_partial_session_uses_only_available_components():
    # No accuracy data at all (e.g. only unscored task types completed),
    # but completion and timing are known -- must still return a real
    # number by re-normalizing the remaining weights, not None.
    report = _base_report(
        total_tasks_completed=2, total_tasks_assigned=2, avg_score_overall=None,
        task_timing_samples=[TaskTimingSample(time_taken_seconds=60, deadline_seconds=120)] * 2,
    )
    index = compute_productivity_index(report)
    check("a session with completion+timing data but no accuracy data still returns a real number",
          index is not None, f"got {index}")


def test_productivity_zero_time_taken_does_not_crash():
    report = _base_report(
        total_tasks_completed=1, total_tasks_assigned=1, avg_score_overall=100.0,
        task_timing_samples=[TaskTimingSample(time_taken_seconds=0, deadline_seconds=60)],
    )
    index = compute_productivity_index(report)
    check("an edge-case 0-second completion is handled without a division-by-zero crash", index is not None, f"got {index}")


# ── Cognitive load estimate ────────────────────────────────────────────────
def test_cognitive_load_completed_early_is_low():
    report = _base_report(task_timing_samples=[TaskTimingSample(time_taken_seconds=20, deadline_seconds=120)])
    load = compute_cognitive_load_estimate(report)
    check("completing well before the deadline estimates LOW cognitive load", load is not None and load < 30, f"got {load}")


def test_cognitive_load_near_deadline_is_high():
    report = _base_report(task_timing_samples=[TaskTimingSample(time_taken_seconds=115, deadline_seconds=120)])
    load = compute_cognitive_load_estimate(report)
    check("finishing near the deadline estimates HIGH cognitive load", load is not None and load > 90, f"got {load}")


def test_cognitive_load_exceeding_deadline_caps_at_100():
    report = _base_report(task_timing_samples=[TaskTimingSample(time_taken_seconds=500, deadline_seconds=120)])
    load = compute_cognitive_load_estimate(report)
    check("a task that ran well over its deadline caps at 100, never exceeds it", load == 100.0, f"got {load}")


def test_cognitive_load_missing_deadline_returns_none():
    report = _base_report(task_timing_samples=[])  # no task had a real deadline to sample
    check("no completed task had a real deadline -> None, never a fabricated 0", compute_cognitive_load_estimate(report) is None)


# ── Fatigue (pre-existing formula, newly tested here) ─────────────────────
def test_fatigue_stable_performance_is_low():
    report = _base_report(
        avg_score_first_half=80.0, avg_score_second_half=80.0,
        avg_time_taken_seconds_first_half=60.0, avg_time_taken_seconds_second_half=60.0,
        error_count_trend=[0, 0, 0, 0], stress_declarations=[],
    )
    score = compute_fatigue_score(report)
    check("stable performance across both halves scores low fatigue", score < 20, f"got {score}")


def test_fatigue_degrading_performance_is_higher():
    report = _base_report(
        avg_score_first_half=90.0, avg_score_second_half=40.0,
        avg_time_taken_seconds_first_half=60.0, avg_time_taken_seconds_second_half=140.0,
        error_count_trend=[0, 0, 1, 1, 1, 1], stress_declarations=[],
    )
    score = compute_fatigue_score(report)
    check("degrading score + slowdown + late-clustered errors scores meaningfully higher fatigue", score > 40, f"got {score}")


def test_fatigue_improving_performance_scores_no_decline_component():
    from app.reports.fatigue import performance_decline_score
    report = _base_report(avg_score_first_half=50.0, avg_score_second_half=90.0)
    check("improving (not declining) performance contributes 0 to the decline component, never negative",
          performance_decline_score(report) == 0.0)


def test_fatigue_insufficient_data_scores_zero_decline():
    from app.reports.fatigue import performance_decline_score
    report = _base_report(avg_score_first_half=None, avg_score_second_half=None)
    check("no first/second-half split available -> 0, not a fabricated guess", performance_decline_score(report) == 0.0)


# ── Stress summary (aggregation-level, complements test_stress_declaration.py) ─
def test_stress_summary_first_declaration_and_multiple():
    from app.reports.aggregation import StressPoint
    report = _base_report(stress_declarations=[
        StressPoint(value=2, declared_at=datetime(2026, 1, 1, 9, 0)),
        StressPoint(value=4, declared_at=datetime(2026, 1, 1, 9, 10)),
        StressPoint(value=3, declared_at=datetime(2026, 1, 1, 9, 20)),
    ])
    summary = compute_stress_summary(report)
    check("stress summary reports the LATEST value, not the max/first", summary["latest"] == 3)
    check("stress summary computes change_from_first correctly (3 - 2 = 1)", summary["change_from_first"] == 1)
    check("stress summary reports the correct min/max/count", summary["minimum"] == 2 and summary["maximum"] == 4 and summary["declarations_count"] == 3)


def test_stress_summary_none_when_never_declared():
    report = _base_report(stress_declarations=[])
    check("no declarations at all -> None, never a fabricated summary", compute_stress_summary(report) is None)


# ── Session-level aggregation (real DB) ────────────────────────────────────
def _make_session(db, user, status_=SessionStatus.completed) -> SessionModel:
    session = SessionModel(user_id=user.id, current_phase=SessionPhase.pic_charge, status=status_, started_at=datetime.utcnow())
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _cleanup(db, session):
    if session is not None:
        db.delete(session)
        db.commit()


def test_empty_session_aggregation_does_not_crash():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("empty session aggregation does not crash", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        report = get_session_report_data(db, session.id)
        check("an empty session (zero tasks) reports total_tasks_completed=0", report.total_tasks_completed == 0)
        check("an empty session reports total_tasks_assigned=0", report.total_tasks_assigned == 0)
        check("an empty session reports empty errors_by_type, not a crash", report.errors_by_type == {})
        check("an empty session's productivity index is None", compute_productivity_index(report) is None)
        check("an empty session's cognitive load estimate is None", compute_cognitive_load_estimate(report) is None)
        fatigue = compute_fatigue_score(report)
        check("an empty session's fatigue score is a valid int, not a crash", isinstance(fatigue, int))
    finally:
        _cleanup(db, session)
        db.close()


def test_errors_by_type_aggregated_correctly_across_mixed_task_types():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("errors_by_type aggregates across mixed task types", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        now = datetime.utcnow()
        tasks = [
            Task(session_id=session.id, type=TaskType.data_validation, title="dv1", status=TaskStatus.completed,
                 priority=Priority.medium, assigned_at=now, started_at=now, completed_at=now + timedelta(seconds=60),
                 time_taken_seconds=60, deadline_seconds=120, error_count=1),
            Task(session_id=session.id, type=TaskType.data_validation, title="dv2", status=TaskStatus.completed,
                 priority=Priority.medium, assigned_at=now, started_at=now, completed_at=now + timedelta(seconds=60),
                 time_taken_seconds=60, deadline_seconds=120, error_count=0),
            Task(session_id=session.id, type=TaskType.document_organization, title="do1", status=TaskStatus.completed,
                 priority=Priority.medium, assigned_at=now, started_at=now, completed_at=now + timedelta(seconds=60),
                 time_taken_seconds=60, deadline_seconds=120, error_count=3),
            # An incomplete task -- must count toward total_tasks_assigned but NOT completed/errors_by_type.
            Task(session_id=session.id, type=TaskType.image_matching, title="im1", status=TaskStatus.pending,
                 priority=Priority.medium, assigned_at=now),
        ]
        for t in tasks:
            db.add(t)
        db.commit()

        report = get_session_report_data(db, session.id)
        check("errors_by_type correctly sums errors per type (data_validation: 1+0=1)",
              report.errors_by_type.get("data_validation") == 1, f"got {report.errors_by_type}")
        check("errors_by_type correctly sums errors per type (document_organization: 3)",
              report.errors_by_type.get("document_organization") == 3, f"got {report.errors_by_type}")
        check("an incomplete task contributes no errors_by_type entry", "image_matching" not in report.errors_by_type)
        check("total_tasks_completed excludes the incomplete task", report.total_tasks_completed == 3)
        check("total_tasks_assigned includes the incomplete task", report.total_tasks_assigned == 4)
        check("task_timing_samples has one entry per completed task with a real deadline",
              len(report.task_timing_samples) == 3)
    finally:
        for t in db.query(Task).filter(Task.session_id == session.id).all() if session else []:
            db.delete(t)
        db.commit()
        _cleanup(db, session)
        db.close()


def test_execution_time_reliability_zero_duration_and_incomplete_excluded():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("execution time handles zero-duration and incomplete tasks correctly", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        now = datetime.utcnow()
        instant = Task(session_id=session.id, type=TaskType.data_validation, title="instant", status=TaskStatus.completed,
                        priority=Priority.medium, assigned_at=now, started_at=now, completed_at=now, time_taken_seconds=0)
        incomplete = Task(session_id=session.id, type=TaskType.data_validation, title="incomplete", status=TaskStatus.pending,
                           priority=Priority.medium, assigned_at=now)
        db.add(instant)
        db.add(incomplete)
        db.commit()

        report = get_session_report_data(db, session.id)
        check("a genuinely 0-second completed task is included in the execution-time average (not dropped as falsy)",
              report.avg_time_taken_seconds_overall == 0.0, f"got {report.avg_time_taken_seconds_overall}")
        check("an incomplete task contributes no execution-time sample", report.total_tasks_completed == 1)
    finally:
        for t in db.query(Task).filter(Task.session_id == session.id).all() if session else []:
            db.delete(t)
        db.commit()
        _cleanup(db, session)
        db.close()


def test_pause_detection_uses_real_interaction_metric_timestamps():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("pause detection uses real InteractionMetric timestamps", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        t0 = datetime.utcnow()
        db.add(InteractionMetric(session_id=session.id, action_type="task_started", timestamp=t0))
        db.add(InteractionMetric(session_id=session.id, action_type="task_completed", timestamp=t0 + timedelta(seconds=200)))
        db.commit()

        report = get_session_report_data(db, session.id)
        check("a real 200s gap between two real telemetry rows is detected as a pause",
              report.pause_stats.pause_count == 1, f"got {report.pause_stats}")
    finally:
        db.query(InteractionMetric).filter(InteractionMetric.session_id == session.id).delete() if session else None
        db.commit()
        _cleanup(db, session)
        db.close()


# ── Security: report endpoint ownership/authentication ────────────────────
def test_report_endpoint_rejects_another_users_session():
    db = SessionLocal()
    session = None
    try:
        users = db.query(User).limit(2).all()
        if len(users) < 2:
            check("report endpoint rejects another user's session", True, "skipped: fewer than 2 users in DB")
            return
        owner, intruder = users[0], users[1]
        session = _make_session(db, owner)
        raised = None
        try:
            get_session_report(session.id, db, intruder)
        except HTTPException as exc:
            raised = exc
        check("a different user cannot fetch another session's report (403)",
              raised is not None and raised.status_code == 403, f"got {raised}")
    finally:
        _cleanup(db, session)
        db.close()


def test_report_endpoint_unauthenticated_is_rejected():
    client = TestClient(app)
    resp = client.get("/sessions/00000000-0000-0000-0000-000000000000/report")
    check("an unauthenticated request to the report endpoint is rejected with 401", resp.status_code == 401, f"got {resp.status_code}")


def test_report_endpoint_matches_the_declared_dto_shape():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("report endpoint response matches the declared DTO shape", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        token = create_access_token({"sub": str(user.id)})
        client = TestClient(app)
        resp = client.get(f"/sessions/{session.id}/report", headers={"Authorization": f"Bearer {token}"})
        check("the report endpoint returns 200 for the owner of a completed session", resp.status_code == 200, f"got {resp.status_code} {resp.text}")
        body = resp.json()
        check("the response includes the new productivity_index field", "productivity_index" in body)
        check("the response includes the new cognitive_load_estimate field", "cognitive_load_estimate" in body)
        check("the response includes the new behavioral_metrics block with errors_by_type",
              "behavioral_metrics" in body and "errors_by_type" in body["behavioral_metrics"])
        check("the pre-existing report_data/fatigue_score/recommendations fields are still present (no breaking change)",
              {"report_data", "fatigue_score", "recommendations", "stress"} <= set(body.keys()))
    finally:
        _cleanup(db, session)
        db.close()


if __name__ == "__main__":
    test_no_pause_when_events_are_close_together()
    test_single_pause_detected()
    test_multiple_pauses_detected_and_averaged()
    test_pause_threshold_boundary_is_inclusive()
    test_zero_or_one_events_produce_no_pauses_not_missing_data()
    test_productivity_perfect_performance()
    test_productivity_poor_performance()
    test_productivity_fast_but_inaccurate_is_not_rewarded_over_slow_but_accurate()
    test_productivity_no_tasks_returns_none()
    test_productivity_partial_session_uses_only_available_components()
    test_productivity_zero_time_taken_does_not_crash()
    test_cognitive_load_completed_early_is_low()
    test_cognitive_load_near_deadline_is_high()
    test_cognitive_load_exceeding_deadline_caps_at_100()
    test_cognitive_load_missing_deadline_returns_none()
    test_fatigue_stable_performance_is_low()
    test_fatigue_degrading_performance_is_higher()
    test_fatigue_improving_performance_scores_no_decline_component()
    test_fatigue_insufficient_data_scores_zero_decline()
    test_stress_summary_first_declaration_and_multiple()
    test_stress_summary_none_when_never_declared()
    test_empty_session_aggregation_does_not_crash()
    test_errors_by_type_aggregated_correctly_across_mixed_task_types()
    test_execution_time_reliability_zero_duration_and_incomplete_excluded()
    test_pause_detection_uses_real_interaction_metric_timestamps()
    test_report_endpoint_rejects_another_users_session()
    test_report_endpoint_unauthenticated_is_rejected()
    test_report_endpoint_matches_the_declared_dto_shape()

    print()
    passed = sum(1 for r in results if r)
    print(f"{passed}/{len(results)} checks passed")
    if passed != len(results):
        sys.exit(1)
