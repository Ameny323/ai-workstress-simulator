"""Integration tests for the ARIA v2 event pipelines
(app/orchestrators/aria_pipeline.py, app/orchestrators/
email_event_pipeline.py) and app/ai/manager_service.py -- hits the real
dev database (same convention as tests/verify_adaptive_task_engine.py:
create temp rows, clean them up in a finally block) but NEVER calls the
real OpenAI API except where a test explicitly says so via
unittest.mock.patch on app.ai.openai_service.generate_manager_message.

Covers, in particular, a REGRESSION SUITE for the previously discovered
bug where aria_policy.py's generalized trigger names (shared across every
task type) let email-specific fallback wording
("Analysez chaque email...") leak into data_validation/image_matching/
document_organization fallback messages. See app/ai/manager_service.py's
fallback_message(email_context=...) and its docstring.

Same plain-assert / PASS-FAIL convention as the rest of this suite (no
pytest installed). Async paths are driven with asyncio.run().

Run from backend/ with the venv active:
    python tests/test_manager_service_and_pipelines.py
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import BackgroundTasks

from app.ai import manager_service, openai_service
from app.database import SessionLocal
from app.models.email_decision import EmailDecision
from app.models.email_scenario import EmailScenario
from app.models.enums import GenerationType, Priority, SessionPhase, TaskStatus, TaskType
from app.models.interaction_metric import InteractionMetric
from app.models.manager_message import ManagerMessage
from app.models.session import Session as SessionModel
from app.models.user import User
from app.orchestrators import aria_pipeline
from app.orchestrators.email_event_pipeline import handle_email_event

results = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    results.append(condition)
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))


# Substrings that must NEVER appear in a non-email task's fallback wording,
# and vice versa -- the concrete, literal regression check the audit asked
# for by name.
EMAIL_ONLY_SUBSTRINGS = ["email", "e-mail", "inbox", "priorit"]


def _make_session(db, phase=SessionPhase.accueil) -> SessionModel:
    user = db.query(User).first()
    if user is None:
        return None
    session = SessionModel(user_id=user.id, current_phase=phase, started_at=datetime.utcnow())
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _make_task(db, session, task_type, **overrides) -> "Task":
    from app.models.task import Task
    defaults = dict(
        session_id=session.id, type=task_type, title="Temp test task", priority=Priority.medium,
        status=TaskStatus.in_progress, assigned_at=datetime.utcnow(), started_at=datetime.utcnow(),
    )
    defaults.update(overrides)
    task = Task(**defaults)
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def _cleanup(db, session):
    if session is not None:
        db.delete(session)
        db.commit()


# ── Regression: email-specific fallback wording must never leak elsewhere ──
def test_generic_task_fallback_never_uses_email_wording():
    db = SessionLocal()
    session = None
    try:
        session = _make_session(db)
        if session is None:
            check("generic task fallback wording regression test", True, "skipped: no User in DB")
            return
        for task_type in (TaskType.data_validation, TaskType.image_matching, TaskType.document_organization):
            task = _make_task(db, session, task_type)
            bg = BackgroundTasks()
            aria_pipeline.emit_aria_reaction(db, bg, session, task, "task_started")
            message = (
                db.query(ManagerMessage)
                .filter(ManagerMessage.session_id == session.id)
                .order_by(ManagerMessage.sent_at.desc())
                .first()
            )
            leaked = message is not None and any(s.lower() in message.content.lower() for s in EMAIL_ONLY_SUBSTRINGS)
            check(f"{task_type.value}: TASK_STARTED fallback content contains no email-specific wording",
                  message is not None and not leaked,
                  f"content={message.content if message else None!r}")
    finally:
        _cleanup(db, session)
        db.close()


def test_email_task_fallback_is_allowed_to_use_email_wording():
    db = SessionLocal()
    session = None
    try:
        scenario = db.query(EmailScenario).filter(EmailScenario.is_active.is_(True)).first()
        session = _make_session(db)
        if session is None or scenario is None:
            check("email task fallback wording is allowed to mention email", True,
                  "skipped: no User or no active EmailScenario in DB")
            return
        task = _make_task(db, session, TaskType.email_prioritization, scenario_id=scenario.id, title=scenario.name)
        bg = BackgroundTasks()
        handle_email_event(
            db, bg, session, task, "task_started",
            total_emails=8, elapsed_seconds=0, remaining_time_seconds=900, total_time_seconds=900,
        )
        message = (
            db.query(ManagerMessage)
            .filter(ManagerMessage.session_id == session.id)
            .order_by(ManagerMessage.sent_at.desc())
            .first()
        )
        check("email_prioritization TASK_STARTED fallback content is the email-specific template",
              message is not None and "email" in message.content.lower(), f"content={message.content if message else None!r}")
    finally:
        _cleanup(db, session)
        if session is not None:
            db2 = SessionLocal()
            db2.query(EmailDecision).filter(EmailDecision.session_id == session.id).delete()
            db2.commit()
            db2.close()
        db.close()


# ── Duplicate / cooldown prevention ──────────────────────────────────────
def test_cooldown_prevents_duplicate_manager_messages_for_rapid_repeat_events():
    db = SessionLocal()
    session = None
    try:
        session = _make_session(db)
        if session is None:
            check("cooldown prevents duplicate messages", True, "skipped: no User in DB")
            return
        task = _make_task(db, session, TaskType.data_validation)
        bg = BackgroundTasks()
        aria_pipeline.emit_aria_reaction(db, bg, session, task, "task_started")
        first_count = db.query(ManagerMessage).filter(ManagerMessage.session_id == session.id).count()
        # Immediately repeat the SAME event -- well within bienveillant's
        # 45s minimum communication gap (aria_config.COMMUNICATION_FREQUENCY_SECONDS).
        aria_pipeline.emit_aria_reaction(db, bg, session, task, "task_started")
        second_count = db.query(ManagerMessage).filter(ManagerMessage.session_id == session.id).count()
        check("a rapid repeat of the same low-severity event does not create a second ManagerMessage row",
              first_count == 1 and second_count == 1, f"first={first_count}, second={second_count}")
    finally:
        _cleanup(db, session)
        db.close()


def test_upgrade_job_never_inserts_a_second_row():
    db = SessionLocal()
    session = None
    try:
        session = _make_session(db)
        if session is None:
            check("upgrade job never inserts a second row", True, "skipped: no User in DB")
            return
        task = _make_task(db, session, TaskType.data_validation)
        bg = BackgroundTasks()
        with patch.object(openai_service, "generate_manager_message",
                           new=AsyncMock(return_value="Let's get started -- take your time on this one.")):
            aria_pipeline.emit_aria_reaction(db, bg, session, task, "task_started")
            asyncio.run(bg())
        count = db.query(ManagerMessage).filter(ManagerMessage.session_id == session.id).count()
        check("a successful OpenAI upgrade updates the reserved row in place, never inserts a second one",
              count == 1, f"got {count} rows")
    finally:
        _cleanup(db, session)
        db.close()


# ── generate_manager_message async contract ─────────────────────────────
def test_generate_manager_message_falls_back_without_fsm_result():
    db = SessionLocal()
    session = None
    try:
        session = _make_session(db)
        if session is None:
            check("generate_manager_message falls back with no fsm_result", True, "skipped: no User in DB")
            return
        from app.orchestrators.performance_tracker import get_extended_performance_metrics
        metrics = get_extended_performance_metrics(db, session.id)
        result = asyncio.run(manager_service.generate_manager_message(
            db, "task_started", session, metrics, task=None, tone=None, trigger="TASK_STARTED",
            fsm_result=None,
        ))
        check("generate_manager_message returns a fallback result when fsm_result is None (no prompt can be built)",
              result.was_fallback is True, f"got {result}")
    finally:
        _cleanup(db, session)
        db.close()


def test_generate_manager_message_upgrades_on_openai_success():
    db = SessionLocal()
    session = None
    try:
        session = _make_session(db)
        if session is None:
            check("generate_manager_message upgrades on OpenAI success", True, "skipped: no User in DB")
            return
        task = _make_task(db, session, TaskType.data_validation)
        from app.orchestrators.performance_tracker import get_extended_performance_metrics
        from app.orchestrators import simulation_fsm
        metrics = get_extended_performance_metrics(db, session.id)
        fsm_result = simulation_fsm.evaluate_and_persist(db, session, metrics)

        async def fake_generate(system_prompt, user_prompt):
            check("build_system_prompt output is passed through to openai_service (non-empty)",
                  isinstance(system_prompt, str) and len(system_prompt) > 0)
            check("build_user_prompt output includes the CURRENT EVENT section",
                  "## CURRENT EVENT" in user_prompt, f"user_prompt={user_prompt[:200]}")
            return "Mocked ARIA message content."

        with patch.object(openai_service, "generate_manager_message", side_effect=fake_generate):
            result = asyncio.run(manager_service.generate_manager_message(
                db, "task_started", session, metrics, task=task, trigger="TASK_STARTED", fsm_result=fsm_result,
            ))
        check("generate_manager_message returns the mocked OpenAI content with was_fallback=False",
              result.was_fallback is False and result.content == "Mocked ARIA message content.", f"got {result}")
    finally:
        _cleanup(db, session)
        db.close()


def test_generate_manager_message_falls_back_on_openai_service_error():
    db = SessionLocal()
    session = None
    try:
        session = _make_session(db)
        if session is None:
            check("generate_manager_message falls back on OpenAIServiceError", True, "skipped: no User in DB")
            return
        from app.orchestrators.performance_tracker import get_extended_performance_metrics
        from app.orchestrators import simulation_fsm
        metrics = get_extended_performance_metrics(db, session.id)
        fsm_result = simulation_fsm.evaluate_and_persist(db, session, metrics)

        async def failing_generate(system_prompt, user_prompt):
            raise openai_service.OpenAIServiceError("simulated failure")

        with patch.object(openai_service, "generate_manager_message", side_effect=failing_generate):
            result = asyncio.run(manager_service.generate_manager_message(
                db, "task_started", session, metrics, task=None, trigger="TASK_STARTED", fsm_result=fsm_result,
            ))
        check("an OpenAIServiceError during generation falls back to a deterministic template, never raises",
              result.was_fallback is True and isinstance(result.content, str) and len(result.content) > 0,
              f"got {result}")
    finally:
        _cleanup(db, session)
        db.close()


# ── Data consistency ─────────────────────────────────────────────────────
def test_manager_message_rows_carry_consistent_fields():
    db = SessionLocal()
    session = None
    try:
        session = _make_session(db)
        if session is None:
            check("ManagerMessage rows carry consistent fields", True, "skipped: no User in DB")
            return
        task = _make_task(db, session, TaskType.image_matching)
        bg = BackgroundTasks()
        aria_pipeline.emit_aria_reaction(db, bg, session, task, "task_started")
        message = db.query(ManagerMessage).filter(ManagerMessage.session_id == session.id).first()
        check("ManagerMessage.session_id matches the session it was emitted for",
              message is not None and message.session_id == session.id)
        check("ManagerMessage.trigger_context.task_id matches the task it was emitted for",
              message is not None and message.trigger_context.get("task_id") == str(task.id))
        check("ManagerMessage.trigger_context.trigger is set",
              message is not None and message.trigger_context.get("trigger") == "TASK_STARTED")
        check("a freshly reserved ManagerMessage is generation_type=FALLBACK, consistent with was_fallback=True",
              message is not None and message.generation_type == GenerationType.FALLBACK and message.was_fallback is True)
    finally:
        _cleanup(db, session)
        db.close()


def test_llm_generation_never_touches_deterministic_task_fields():
    db = SessionLocal()
    session = None
    try:
        session = _make_session(db)
        if session is None:
            check("LLM generation never touches deterministic task fields", True, "skipped: no User in DB")
            return
        task = _make_task(db, session, TaskType.data_validation, content_score=87.5, error_count=1)
        bg = BackgroundTasks()
        with patch.object(openai_service, "generate_manager_message",
                           new=AsyncMock(return_value="Nice work -- keep it up.")):
            aria_pipeline.emit_aria_reaction(db, bg, session, task, "task_completed")
            asyncio.run(bg())
        db.refresh(task)
        check("Task.content_score is untouched by ARIA message generation (LLM never sets scores)",
              task.content_score == 87.5, f"got {task.content_score}")
        check("Task.error_count is untouched by ARIA message generation (LLM never sets correctness)",
              task.error_count == 1, f"got {task.error_count}")
    finally:
        _cleanup(db, session)
        db.close()


if __name__ == "__main__":
    test_generic_task_fallback_never_uses_email_wording()
    test_email_task_fallback_is_allowed_to_use_email_wording()
    test_cooldown_prevents_duplicate_manager_messages_for_rapid_repeat_events()
    test_upgrade_job_never_inserts_a_second_row()
    test_generate_manager_message_falls_back_without_fsm_result()
    test_generate_manager_message_upgrades_on_openai_success()
    test_generate_manager_message_falls_back_on_openai_service_error()
    test_manager_message_rows_carry_consistent_fields()
    test_llm_generation_never_touches_deterministic_task_fields()

    print()
    passed = sum(1 for r in results if r)
    print(f"{passed}/{len(results)} checks passed")
    if passed != len(results):
        sys.exit(1)
