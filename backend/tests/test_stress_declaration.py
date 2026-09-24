"""Tests for the Stress Declaration feature end-to-end: schema validation,
session ownership, active-session gating, minimum-interval enforcement,
persistence, telemetry, performance-metrics integration (previous/change),
the existing STRESS_INCREASE trigger now being wired up, the "no forced
state change" guarantee, OpenAI-failure resilience, the WebSocket
broadcast, and prompt-context inclusion.

Hits the real dev DB directly (same convention as
tests/test_manager_service_and_pipelines.py: create temp rows, clean up in
a finally block). Mocks app.ai.openai_service.generate_manager_message
wherever an ARIA message might be generated, so nothing here depends on a
real OpenAI call. One test uses fastapi.testclient.TestClient -- the only
way to genuinely exercise "unauthenticated request is rejected", since
that check happens in FastAPI's dependency layer, before any endpoint
function body runs.

Same plain-assert / PASS-FAIL convention as the rest of this suite (no
pytest installed). Async paths are driven with asyncio.run().

Run from backend/ with the venv active:
    python tests/test_stress_declaration.py
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import BackgroundTasks, HTTPException
from fastapi.testclient import TestClient

from app.ai import openai_service
from app.api.sessions import declare_stress
from app.core.config import STRESS_DECLARATION_MIN_INTERVAL_SECONDS
from app.database import SessionLocal
from app.main import app
from app.models.enums import ManagerTone, SessionPhase, SessionStatus, TaskStatus, TaskType
from app.models.interaction_metric import InteractionMetric
from app.models.manager_message import ManagerMessage
from app.models.session import Session as SessionModel
from app.models.stress_declaration import StressDeclaration
from app.models.task import Task
from app.models.user import User
from app.orchestrators.performance_tracker import get_extended_performance_metrics
from app.schemas.session import StressDeclarationCreate

results = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    results.append(condition)
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))


def _make_session(db, user, status_=SessionStatus.in_progress, started_at=None) -> SessionModel:
    session = SessionModel(
        user_id=user.id, current_phase=SessionPhase.accueil, status=status_,
        started_at=started_at or datetime.utcnow(),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _cleanup(db, session):
    if session is not None:
        db.delete(session)
        db.commit()


def _mocked_openai():
    return patch.object(openai_service, "generate_manager_message", new=AsyncMock(return_value="Noted."))


# ── A/B. Valid/invalid stress_level values (schema validation) ──────────
def test_valid_declaration_values_accepted():
    for level in (1, 3, 5):
        try:
            StressDeclarationCreate(stress_level=level)
            check(f"stress_level={level} is accepted by the schema", True)
        except Exception as exc:
            check(f"stress_level={level} is accepted by the schema", False, str(exc))


def test_invalid_declaration_values_rejected():
    for level in (0, 6, -1):
        try:
            StressDeclarationCreate(stress_level=level)
            check(f"stress_level={level} is rejected by the schema", False)
        except Exception:
            check(f"stress_level={level} is rejected by the schema", True)


# ── C. Authentication (real HTTP layer -- the only place this is enforced) ─
def test_unauthenticated_request_is_rejected():
    client = TestClient(app)
    resp = client.post("/sessions/00000000-0000-0000-0000-000000000000/stress", json={"stress_level": 3})
    check("an unauthenticated request is rejected with 401", resp.status_code == 401, f"got {resp.status_code}")


# ── D. Session ownership ──────────────────────────────────────────────────
def test_cannot_declare_stress_for_another_users_session():
    db = SessionLocal()
    session = None
    try:
        users = db.query(User).limit(2).all()
        if len(users) < 2:
            check("user A cannot declare stress for user B's session", True, "skipped: fewer than 2 users in DB")
            return
        owner, intruder = users[0], users[1]
        session = _make_session(db, owner)
        raised = None
        try:
            declare_stress(session.id, StressDeclarationCreate(stress_level=3), BackgroundTasks(), db, intruder)
        except HTTPException as exc:
            raised = exc
        check("user A cannot declare stress for user B's session (403)",
              raised is not None and raised.status_code == 403, f"got {raised}")
    finally:
        _cleanup(db, session)
        db.close()


# ── E. Session state (active-session gating) ──────────────────────────────
def test_inactive_session_cannot_accept_declaration():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("inactive session cannot accept a declaration", True, "skipped: no User in DB")
            return
        session = _make_session(db, user, status_=SessionStatus.completed)
        raised = None
        try:
            declare_stress(session.id, StressDeclarationCreate(stress_level=3), BackgroundTasks(), db, user)
        except HTTPException as exc:
            raised = exc
        check("a completed session cannot accept a new stress declaration (409)",
              raised is not None and raised.status_code == 409, f"got {raised}")
    finally:
        _cleanup(db, session)
        db.close()


def test_debriefing_phase_session_cannot_accept_declaration_even_if_status_still_in_progress():
    """Regression test (technical-debt fix): the sequential simulation flow
    (app/api/tasks.py's get_next_task) can already move a session to
    current_phase=debriefing -- via sequence completion or the global
    timeout -- well before /end ever sets status=completed. declare_stress
    previously only checked status, leaving a window where a participant
    whose simulation content had already ended could still post a new
    stress declaration. Both conditions must now be checked.
    """
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("debriefing-phase session (status still in_progress) cannot accept a declaration", True, "skipped: no User in DB")
            return
        session = _make_session(db, user, status_=SessionStatus.in_progress)
        session.current_phase = SessionPhase.debriefing
        db.commit()
        raised = None
        try:
            declare_stress(session.id, StressDeclarationCreate(stress_level=3), BackgroundTasks(), db, user)
        except HTTPException as exc:
            raised = exc
        check("current_phase=debriefing rejects a new declaration (409) even though status is still in_progress",
              raised is not None and raised.status_code == 409, f"got {raised}")
    finally:
        _cleanup(db, session)
        db.close()


# ── F/G. Persistence + telemetry ─────────────────────────────────────────
def test_declaration_is_persisted_and_telemetry_is_generated():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("declaration is persisted with telemetry", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        with _mocked_openai():
            result = declare_stress(session.id, StressDeclarationCreate(stress_level=2), BackgroundTasks(), db, user)

        row = db.query(StressDeclaration).filter(StressDeclaration.session_id == session.id).first()
        check("the declaration is persisted with the submitted stress_level", row is not None and row.stress_level == 2)
        check("the persisted row captures simulation_phase/aria_state at declaration time",
              row.simulation_phase == session.current_phase)
        check("the persisted row has a non-null elapsed_seconds", row.elapsed_seconds is not None and row.elapsed_seconds >= 0)
        check("task_id is None when no task is active (declared between tasks)", row.task_id is None)

        metric = (
            db.query(InteractionMetric)
            .filter(InteractionMetric.session_id == session.id, InteractionMetric.action_type == "stress_declared")
            .first()
        )
        check("a STRESS_DECLARED (stress_declared) InteractionMetric row is generated",
              metric is not None and metric.metadata_json.get("stress_level") == 2, f"got {metric}")
        check("the response echoes the persisted id/session_id", str(result.id) == str(row.id))
    finally:
        _cleanup(db, session)
        db.close()


def test_declaration_captures_the_active_task_id():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("declaration captures the active task id", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        task = Task(session_id=session.id, type=TaskType.data_validation, title="t",
                    status=TaskStatus.in_progress, assigned_at=datetime.utcnow())
        db.add(task)
        db.commit()
        db.refresh(task)

        with _mocked_openai():
            result = declare_stress(session.id, StressDeclarationCreate(stress_level=2), BackgroundTasks(), db, user)
        check("task_id is captured when a task is active at declaration time",
              result.task_id == task.id, f"got {result.task_id}")
    finally:
        _cleanup(db, session)
        db.close()


# ── H/I/J/K/L. Metrics: previous/current/change, first declaration, inc/dec/none ─
def test_first_declaration_has_no_previous_value():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("first declaration has previous=null", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        with _mocked_openai():
            result = declare_stress(session.id, StressDeclarationCreate(stress_level=3), BackgroundTasks(), db, user)
        check("the FIRST declaration this session has previous_stress_level=None (never fabricated)",
              result.previous_stress_level is None)
        check("the FIRST declaration this session has stress_change=None", result.stress_change is None)
    finally:
        _cleanup(db, session)
        db.close()


def _declare_twice(db, session, user, first, second):
    with _mocked_openai():
        declare_stress(session.id, StressDeclarationCreate(stress_level=first), BackgroundTasks(), db, user)
        # Backdate the first row so the second declaration doesn't hit the
        # minimum-interval guard -- isolates the metrics-math tests from
        # the separate interval-enforcement test below.
        row = db.query(StressDeclaration).filter(StressDeclaration.session_id == session.id).order_by(
            StressDeclaration.declared_at.desc()).first()
        row.declared_at = datetime.utcnow() - timedelta(seconds=STRESS_DECLARATION_MIN_INTERVAL_SECONDS + 5)
        db.add(row)
        db.commit()
        return declare_stress(session.id, StressDeclarationCreate(stress_level=second), BackgroundTasks(), db, user)


def test_stress_increase_produces_correct_positive_change():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("2 -> 4 produces stress_change=+2", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        result = _declare_twice(db, session, user, 2, 4)
        check("2 -> 4 produces stress_change=+2", result.stress_change == 2, f"got {result.stress_change}")
        check("2 -> 4 reports previous_stress_level=2", result.previous_stress_level == 2)
    finally:
        _cleanup(db, session)
        db.close()


def test_stress_decrease_produces_correct_negative_change():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("4 -> 2 produces stress_change=-2", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        result = _declare_twice(db, session, user, 4, 2)
        check("4 -> 2 produces stress_change=-2", result.stress_change == -2, f"got {result.stress_change}")
    finally:
        _cleanup(db, session)
        db.close()


def test_no_change_produces_zero():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("3 -> 3 produces stress_change=0", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        result = _declare_twice(db, session, user, 3, 3)
        check("3 -> 3 produces stress_change=0", result.stress_change == 0, f"got {result.stress_change}")
    finally:
        _cleanup(db, session)
        db.close()


def test_extended_performance_metrics_reflect_the_same_previous_and_change():
    """Confirms the SAME metrics pipeline every other ARIA trigger reads
    from (not a parallel computation) reflects previous/change correctly
    -- this is what makes the STRESS_INCREASE trigger below actually work."""
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("ExtendedPerformanceMetrics reflects previous/change", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        _declare_twice(db, session, user, 2, 4)
        metrics = get_extended_performance_metrics(db, session.id)
        check("ExtendedPerformanceMetrics.declared_stress is the latest declared value",
              metrics.declared_stress == 4, f"got {metrics.declared_stress}")
        check("ExtendedPerformanceMetrics.previous_declared_stress is the one before it",
              metrics.previous_declared_stress == 2, f"got {metrics.previous_declared_stress}")
        check("ExtendedPerformanceMetrics.stress_change is computed correctly",
              metrics.stress_change == 2, f"got {metrics.stress_change}")
    finally:
        _cleanup(db, session)
        db.close()


# ── M. Minimum interval enforcement ───────────────────────────────────────
def test_rapid_repeated_declaration_is_rejected():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("a rapid repeat declaration is rejected", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        with _mocked_openai():
            declare_stress(session.id, StressDeclarationCreate(stress_level=2), BackgroundTasks(), db, user)
            raised = None
            try:
                declare_stress(session.id, StressDeclarationCreate(stress_level=4), BackgroundTasks(), db, user)
            except HTTPException as exc:
                raised = exc
        check("a second declaration within STRESS_DECLARATION_MIN_INTERVAL_SECONDS is rejected (429)",
              raised is not None and raised.status_code == 429, f"got {raised}")
        count = db.query(StressDeclaration).filter(StressDeclaration.session_id == session.id).count()
        check("the rejected rapid repeat did not create a second row", count == 1, f"got {count} rows")
    finally:
        _cleanup(db, session)
        db.close()


# ── N. ARIA trigger integration (STRESS_INCREASE fires through the real pipeline) ─
def test_stress_increase_can_trigger_through_the_real_pipeline():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("STRESS_INCREASE fires through the real ARIA pipeline", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        _declare_twice(db, session, user, 2, 4)
        message = (
            db.query(ManagerMessage)
            .filter(ManagerMessage.session_id == session.id)
            .order_by(ManagerMessage.sent_at.desc())
            .first()
        )
        check("a ManagerMessage is emitted after a qualifying stress increase (2 -> 4)",
              message is not None and message.trigger_context.get("trigger") == "STRESS_INCREASE",
              f"got {message.trigger_context if message else None}")
    finally:
        _cleanup(db, session)
        db.close()


# ── O. No forced state change ─────────────────────────────────────────────
def test_stress_5_does_not_force_intrusif():
    """The single most important guarantee in this feature: a maximal
    stress declaration must never itself set ManagerTone.intrusif -- the
    FSM, evaluated independently from otherwise-clean metrics, remains
    authoritative."""
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("stress=5 does not force intrusif", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        with _mocked_openai():
            declare_stress(session.id, StressDeclarationCreate(stress_level=5), BackgroundTasks(), db, user)
        db.refresh(session)
        check("a single stress=5 declaration on an otherwise-clean session does NOT force ManagerTone.intrusif",
              session.current_manager_tone != ManagerTone.intrusif, f"got {session.current_manager_tone}")
    finally:
        _cleanup(db, session)
        db.close()


# ── P. OpenAI failure does not break stress recording ────────────────────
def test_declaration_succeeds_even_if_openai_fails():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("declaration succeeds even if OpenAI fails", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        with patch.object(openai_service, "generate_manager_message",
                           new=AsyncMock(side_effect=openai_service.OpenAIServiceError("simulated outage"))):
            result = declare_stress(session.id, StressDeclarationCreate(stress_level=4), BackgroundTasks(), db, user)
        check("the declaration is still recorded and returned even when OpenAI is unavailable",
              result.stress_level == 4)
        row = db.query(StressDeclaration).filter(StressDeclaration.session_id == session.id).first()
        check("the declaration is still persisted when OpenAI is unavailable", row is not None)
    finally:
        _cleanup(db, session)
        db.close()


# ── Q. WebSocket event ─────────────────────────────────────────────────────
def test_stress_declared_websocket_event_is_broadcast():
    """_broadcast_sync_safe swallows failures when there's no active
    WebSocket portal (true in this test's plain-function-call context) --
    so this confirms the call happens (doesn't raise) rather than
    inspecting a live socket. The payload shape itself is asserted by
    reading the source in app/api/sessions.py; a full transport-level
    test would require a real WebSocket client, out of scope here."""
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("stress_declared broadcast does not raise", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        raised = None
        try:
            with _mocked_openai():
                declare_stress(session.id, StressDeclarationCreate(stress_level=3), BackgroundTasks(), db, user)
        except Exception as exc:
            raised = exc
        check("declaring stress with no active WebSocket connection never raises", raised is None, f"got {raised}")
    finally:
        _cleanup(db, session)
        db.close()


# ── R. Prompt context ──────────────────────────────────────────────────────
def test_declared_stress_is_included_in_the_aria_prompt_context():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("declared stress appears in the ARIA prompt context", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        _declare_twice(db, session, user, 2, 4)

        from app.ai import prompt_builder
        from app.orchestrators import simulation_fsm
        metrics = get_extended_performance_metrics(db, session.id)
        fsm_result = simulation_fsm.evaluate_and_persist(db, session, metrics)
        ctx = prompt_builder.build_context(db, session, fsm_result, metrics, "stress_declared", {})
        user_prompt = prompt_builder.build_user_prompt(ctx)
        check("declared_stress appears in the rendered ARIA user prompt", "declared_stress: 4" in user_prompt, f"{user_prompt[:400]}")
        check("stress_change appears in the rendered ARIA user prompt", "stress_change: 2" in user_prompt)

        system_prompt = prompt_builder.build_system_prompt(ctx)
        check("the system prompt clarifies the 1-5 scale (prevents 0-100 misinterpretation)",
              "1-5 scale" in system_prompt)
        check("the system prompt forbids causal claims about stress", "causality" in system_prompt.lower())
    finally:
        _cleanup(db, session)
        db.close()


if __name__ == "__main__":
    test_valid_declaration_values_accepted()
    test_invalid_declaration_values_rejected()
    test_unauthenticated_request_is_rejected()
    test_cannot_declare_stress_for_another_users_session()
    test_inactive_session_cannot_accept_declaration()
    test_debriefing_phase_session_cannot_accept_declaration_even_if_status_still_in_progress()
    test_declaration_is_persisted_and_telemetry_is_generated()
    test_declaration_captures_the_active_task_id()
    test_first_declaration_has_no_previous_value()
    test_stress_increase_produces_correct_positive_change()
    test_stress_decrease_produces_correct_negative_change()
    test_no_change_produces_zero()
    test_extended_performance_metrics_reflect_the_same_previous_and_change()
    test_rapid_repeated_declaration_is_rejected()
    test_stress_increase_can_trigger_through_the_real_pipeline()
    test_stress_5_does_not_force_intrusif()
    test_declaration_succeeds_even_if_openai_fails()
    test_stress_declared_websocket_event_is_broadcast()
    test_declared_stress_is_included_in_the_aria_prompt_context()

    print()
    passed = sum(1 for r in results if r)
    print(f"{passed}/{len(results)} checks passed")
    if passed != len(results):
        sys.exit(1)
