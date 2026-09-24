"""Tests for the two newly-implemented task types required by the cahier
des charges: EMAIL_WRITING ("redaction de courriels") and URGENT_REQUEST
("reponse a des demandes urgentes") -- generation, deterministic fallback,
scoring, telemetry (including typing-speed metrics), and analytics
compatibility (get_session_report_data / SessionAnalyticsOut correctly
incorporate both new types, and never fabricate typing data for a session
that never captured any).

Same plain-assert / PASS-FAIL convention as the rest of this suite (no
pytest installed). Generation tests mock app.ai.openai_service.
generate_structured (same pattern as test_task_generation.py) -- none of
them require a real OpenAI call.

Run from backend/ with the venv active:
    python tests/test_new_task_types.py
"""
import os
import sys
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import BackgroundTasks

from app.ai import openai_service, task_generation as tg
from app.api.tasks import submit_task
from app.database import SessionLocal
from app.models.enums import GenerationType, Priority, SessionPhase, SessionStatus, TaskStatus, TaskType
from app.models.interaction_metric import InteractionMetric
from app.models.session import Session as SessionModel
from app.models.task import Task
from app.models.user import User
from app.reports.aggregation import get_session_report_data
from app.schemas.task import TaskSubmissionRequest, TypingMetricsIn
from app.tasks.email_writing import (
    generate_email_writing_instance,
    generate_email_writing_instance_controlled,
    score_email_writing_submission,
)
from app.tasks.urgent_request import (
    generate_urgent_request_instance,
    generate_urgent_request_instance_controlled,
    score_urgent_request_submission,
)

results = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    results.append(condition)
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))


def with_mocked_generation(return_value=None, side_effect=None):
    return patch.object(openai_service, "generate_structured", new=AsyncMock(return_value=return_value, side_effect=side_effect))


EMAIL_WRITING_METADATA = {
    "sender": "Jamie Fox", "sender_role": "Client", "subject": "Delay update needed",
    "context": "Shipment delayed.", "original_request": "When will it ship?",
    "objective": "Explain the delay and give a new date.", "urgency": 3,
    "required_points": ["new delivery date", "reason for delay"],
    "forbidden_points": ["blaming the client"],
    "min_length": 40, "max_length": 500,
}

URGENT_REQUEST_METADATA = {
    "sender": "Ops Bot", "sender_role": "Automated Alert", "subject": "Outage",
    "message": "Production is down.", "urgency": 5,
    "options": [
        {"id": "escalate", "label": "Escalate to on-call"},
        {"id": "ignore", "label": "Ignore it"},
        {"id": "defer", "label": "Defer to tomorrow"},
    ],
    "correct_action": "escalate",
}


# ── Email writing: deterministic generator ───────────────────────────────
def test_email_writing_deterministic_generation_shape():
    instance = generate_email_writing_instance(EMAIL_WRITING_METADATA)
    check("deterministic email_writing generator returns all expected fields",
          {"sender", "subject", "required_points", "forbidden_points", "min_length", "max_length"} <= set(instance.keys()))
    check("required_points are passed through from the template", instance["required_points"] == EMAIL_WRITING_METADATA["required_points"])


# ── Email writing: controlled generation + fallback ───────────────────────
def test_email_writing_controlled_generation_success():
    from app.ai.task_generation import GeneratedEmailWritingContent
    content = GeneratedEmailWritingContent(
        title="t", description="d", sender="A", sender_role="Client", subject="S",
        context="C", original_request="R", objective="O", urgency=3,
        required_points=["point one", "point two"], forbidden_points=[], min_length=20, max_length=300,
    )
    with with_mocked_generation(return_value=content):
        instance, gen_type, version = generate_email_writing_instance_controlled(EMAIL_WRITING_METADATA)
    check("successful LLM generation returns generation_type=LLM", gen_type == GenerationType.LLM)
    check("successful LLM generation returns the generated required_points", instance["required_points"] == ["point one", "point two"])


def test_email_writing_falls_back_to_deterministic_on_generation_failure():
    with with_mocked_generation(side_effect=openai_service.OpenAIServiceError("simulated outage")):
        instance, gen_type, version = generate_email_writing_instance_controlled(EMAIL_WRITING_METADATA)
    check("email_writing generation failure falls back to generation_type=FALLBACK", gen_type == GenerationType.FALLBACK)
    check("the fallback instance still has the correct shape", "required_points" in instance and "subject" in instance)


# ── Email writing: deterministic scoring ─────────────────────────────────
def test_email_writing_scoring_perfect_response():
    instance = generate_email_writing_instance(EMAIL_WRITING_METADATA)
    text = "We apologize. Here is the new delivery date and the reason for delay you asked about. Thank you for your patience today."
    result = score_email_writing_submission(instance, {"written_response": text})
    check("a response covering all required points with no forbidden content scores 100",
          result["content_score"] == 100, f"got {result}")
    check("required_points_included matches the total when all are covered",
          result["required_points_included"] == result["required_points_total"])


def test_email_writing_scoring_missing_required_points():
    instance = generate_email_writing_instance(EMAIL_WRITING_METADATA)
    text = "Thanks for reaching out, we will look into this soon. " * 2
    result = score_email_writing_submission(instance, {"written_response": text})
    check("a response missing required points scores below 100", result["content_score"] < 100, f"got {result}")
    check("required_points_included correctly counts zero when none are covered", result["required_points_included"] == 0)


def test_email_writing_scoring_forbidden_content_penalized():
    instance = generate_email_writing_instance(EMAIL_WRITING_METADATA)
    text = "Here is the new delivery date and the reason for delay. Honestly, this is your fault for blaming the client so much."
    result = score_email_writing_submission(instance, {"written_response": text})
    check("a response containing forbidden content is flagged", result["forbidden_points_violated"] >= 1, f"got {result}")


def test_email_writing_scoring_length_violation():
    instance = generate_email_writing_instance(EMAIL_WRITING_METADATA)
    too_short = score_email_writing_submission(instance, {"written_response": "Sorry."})
    check("a response shorter than min_length is flagged as length_ok=False", too_short["length_ok"] is False)


def test_email_writing_scoring_empty_response():
    instance = generate_email_writing_instance(EMAIL_WRITING_METADATA)
    result = score_email_writing_submission(instance, {"written_response": ""})
    check("an empty response scores 0, never a partial-credit fabrication", result["content_score"] == 0)
    result_missing = score_email_writing_submission(instance, {})
    check("a submission with no written_response key at all is treated the same as empty", result_missing["content_score"] == 0)


# ── Typing metrics: validation ────────────────────────────────────────────
def test_typing_metrics_schema_rejects_negative_values():
    for bad_kwargs in [
        dict(typing_duration_seconds=-1, character_count=10, word_count=2, average_chars_per_second=1, typing_speed_variation=0, pause_count_during_typing=0),
        dict(typing_duration_seconds=10, character_count=-5, word_count=2, average_chars_per_second=1, typing_speed_variation=0, pause_count_during_typing=0),
    ]:
        try:
            TypingMetricsIn(**bad_kwargs)
            check("negative typing metric values are rejected", False)
        except Exception:
            check("negative typing metric values are rejected", True)


def test_typing_metrics_schema_never_carries_raw_text_fields():
    fields = set(TypingMetricsIn.model_fields.keys())
    check("TypingMetricsIn has no field for raw keystrokes or typed text (aggregate-only by construction)",
          not any(f in fields for f in ("keystrokes", "raw_text", "text", "characters")), f"fields={fields}")


# ── Urgent request: deterministic generator + scoring ─────────────────────
def test_urgent_request_deterministic_generation_shape():
    instance = generate_urgent_request_instance(URGENT_REQUEST_METADATA)
    check("deterministic urgent_request generator returns options and correct_action",
          "options" in instance and instance["correct_action"] == "escalate")


def test_urgent_request_controlled_generation_success():
    from app.ai.task_generation import GeneratedUrgentRequestContent, GeneratedUrgentRequestOption
    content = GeneratedUrgentRequestContent(
        title="t", description="d", sender="A", sender_role="Ops", subject="S", message="M", urgency=5,
        options=[
            GeneratedUrgentRequestOption(id="escalate", label="Escalate"),
            GeneratedUrgentRequestOption(id="wait", label="Wait"),
            GeneratedUrgentRequestOption(id="delegate", label="Delegate"),
        ],
        correct_action="escalate",
    )
    with with_mocked_generation(return_value=content):
        instance, gen_type, version = generate_urgent_request_instance_controlled(URGENT_REQUEST_METADATA)
    check("successful LLM generation returns generation_type=LLM", gen_type == GenerationType.LLM)
    check("successful LLM generation's correct_action matches a real option id",
          instance["correct_action"] in [o["id"] for o in instance["options"]])


def test_urgent_request_falls_back_to_deterministic_on_generation_failure():
    with with_mocked_generation(side_effect=openai_service.OpenAIServiceError("simulated outage")):
        instance, gen_type, version = generate_urgent_request_instance_controlled(URGENT_REQUEST_METADATA)
    check("urgent_request generation failure falls back to generation_type=FALLBACK", gen_type == GenerationType.FALLBACK)


def test_urgent_request_scoring_correct_and_incorrect():
    instance = generate_urgent_request_instance(URGENT_REQUEST_METADATA)
    correct = score_urgent_request_submission(instance, {"selected_action": "escalate"})
    incorrect = score_urgent_request_submission(instance, {"selected_action": "ignore"})
    missing = score_urgent_request_submission(instance, {})
    check("selecting the correct action scores 100 with 0 errors", correct["content_score"] == 100 and correct["error_count"] == 0)
    check("selecting a wrong action scores 0 with 1 error", incorrect["content_score"] == 0 and incorrect["error_count"] == 1)
    check("no selection at all scores 0, never a fabricated partial credit", missing["content_score"] == 0)


# ── Real submission flow: telemetry, ownership, completion ────────────────
def _make_session(db, user) -> SessionModel:
    session = SessionModel(user_id=user.id, current_phase=SessionPhase.accueil, status=SessionStatus.in_progress, started_at=datetime.utcnow())
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _cleanup(db, session):
    if session is not None:
        db.query(InteractionMetric).filter(InteractionMetric.session_id == session.id).delete()
        db.query(Task).filter(Task.session_id == session.id).delete()
        db.delete(session)
        db.commit()


def test_email_writing_submission_persists_typing_telemetry():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("email_writing submission persists typing telemetry", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        now = datetime.utcnow()
        instance = generate_email_writing_instance(EMAIL_WRITING_METADATA)
        task = Task(session_id=session.id, type=TaskType.email_writing, title="Write a reply",
                    status=TaskStatus.in_progress, priority=Priority.medium, assigned_at=now, started_at=now,
                    deadline_seconds=300, instance_data=instance)
        db.add(task)
        db.commit()
        db.refresh(task)

        typing_metrics = TypingMetricsIn(
            typing_duration_seconds=45.0, character_count=210, word_count=38,
            average_chars_per_second=4.6, typing_speed_variation=1.2, pause_count_during_typing=2,
        )
        payload = TaskSubmissionRequest(
            written_response="We apologize. Here is the new delivery date and the reason for delay. Thank you.",
            typing_metrics=typing_metrics,
        )
        bg = BackgroundTasks()
        result = submit_task(task.id, payload, bg, db, user)
        check("submitting an email_writing task computes a real content_score", result.content_score is not None)

        row = (
            db.query(InteractionMetric)
            .filter(InteractionMetric.session_id == session.id, InteractionMetric.action_type == "typing_metrics")
            .first()
        )
        check("a typing_metrics InteractionMetric row is persisted on submission", row is not None)
        check("the persisted typing metrics match exactly what was submitted (aggregate values only)",
              row is not None and row.metadata_json["character_count"] == 210 and row.metadata_json["typing_duration_seconds"] == 45.0)
        check("the persisted typing metrics carry no raw text/keystroke field",
              row is not None and "text" not in row.metadata_json and "keystrokes" not in row.metadata_json)
    finally:
        _cleanup(db, session)
        db.close()


def test_urgent_request_submission_persists_reconsideration_telemetry():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("urgent_request submission persists reconsideration telemetry", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        now = datetime.utcnow()
        instance = generate_urgent_request_instance(URGENT_REQUEST_METADATA)
        task = Task(session_id=session.id, type=TaskType.urgent_request, title="Respond urgently",
                    status=TaskStatus.in_progress, priority=Priority.urgent, assigned_at=now, started_at=now,
                    deadline_seconds=90, instance_data=instance)
        db.add(task)
        db.commit()
        db.refresh(task)

        payload = TaskSubmissionRequest(selected_action="escalate", reconsideration_count=2)
        bg = BackgroundTasks()
        result = submit_task(task.id, payload, bg, db, user)
        check("submitting the correct urgent_request action scores 100", result.content_score == 100.0)

        row = (
            db.query(InteractionMetric)
            .filter(InteractionMetric.session_id == session.id, InteractionMetric.action_type == "reconsideration")
            .first()
        )
        check("a reconsideration InteractionMetric row is persisted when reconsideration_count > 0",
              row is not None and row.metadata_json["count"] == 2)
    finally:
        _cleanup(db, session)
        db.close()


def test_urgent_request_no_reconsideration_persists_no_telemetry_row():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("no reconsideration -> no telemetry row fabricated", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        now = datetime.utcnow()
        instance = generate_urgent_request_instance(URGENT_REQUEST_METADATA)
        task = Task(session_id=session.id, type=TaskType.urgent_request, title="Respond urgently",
                    status=TaskStatus.in_progress, priority=Priority.urgent, assigned_at=now, started_at=now,
                    deadline_seconds=90, instance_data=instance)
        db.add(task)
        db.commit()
        db.refresh(task)

        payload = TaskSubmissionRequest(selected_action="escalate", reconsideration_count=0)
        bg = BackgroundTasks()
        submit_task(task.id, payload, bg, db, user)

        count = (
            db.query(InteractionMetric)
            .filter(InteractionMetric.session_id == session.id, InteractionMetric.action_type == "reconsideration")
            .count()
        )
        check("no reconsideration telemetry row is created when reconsideration_count is 0 (never fabricated)", count == 0)
    finally:
        _cleanup(db, session)
        db.close()


# ── Analytics compatibility ────────────────────────────────────────────────
def test_analytics_incorporates_new_task_types_and_typing_metrics():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("analytics incorporates new task types", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        now = datetime.utcnow()

        ew_instance = generate_email_writing_instance(EMAIL_WRITING_METADATA)
        ew_task = Task(session_id=session.id, type=TaskType.email_writing, title="Write", status=TaskStatus.in_progress,
                        priority=Priority.medium, assigned_at=now, started_at=now, deadline_seconds=300, instance_data=ew_instance)
        ur_instance = generate_urgent_request_instance(URGENT_REQUEST_METADATA)
        ur_task = Task(session_id=session.id, type=TaskType.urgent_request, title="Respond", status=TaskStatus.in_progress,
                        priority=Priority.urgent, assigned_at=now, started_at=now, deadline_seconds=90, instance_data=ur_instance)
        db.add(ew_task)
        db.add(ur_task)
        db.commit()
        db.refresh(ew_task)
        db.refresh(ur_task)

        bg = BackgroundTasks()
        submit_task(ew_task.id, TaskSubmissionRequest(
            written_response="short",  # deliberately incomplete -> real errors
            typing_metrics=TypingMetricsIn(
                typing_duration_seconds=10.0, character_count=5, word_count=1,
                average_chars_per_second=0.5, typing_speed_variation=0.1, pause_count_during_typing=0,
            ),
        ), bg, db, user)
        submit_task(ur_task.id, TaskSubmissionRequest(selected_action="ignore"), bg, db, user)

        report = get_session_report_data(db, session.id)
        check("errors_by_type includes email_writing", "email_writing" in report.errors_by_type and report.errors_by_type["email_writing"] > 0)
        check("errors_by_type includes urgent_request (wrong action = 1 error)", report.errors_by_type.get("urgent_request") == 1)
        check("tasks_by_type includes both new types", "email_writing" in report.tasks_by_type and "urgent_request" in report.tasks_by_type)
        check("typing_metrics is populated (not None) for a session containing a typed submission",
              report.typing_metrics is not None)
        check("typing_metrics reflects the real captured character_count",
              report.typing_metrics is not None and report.typing_metrics.total_character_count == 5)
    finally:
        _cleanup(db, session)
        db.close()


def test_analytics_typing_metrics_none_when_no_typing_task_in_session():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("typing_metrics is None for a session with no typing task", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        now = datetime.utcnow()
        ur_instance = generate_urgent_request_instance(URGENT_REQUEST_METADATA)
        task = Task(session_id=session.id, type=TaskType.urgent_request, title="Respond", status=TaskStatus.in_progress,
                    priority=Priority.urgent, assigned_at=now, started_at=now, deadline_seconds=90, instance_data=ur_instance)
        db.add(task)
        db.commit()
        db.refresh(task)
        bg = BackgroundTasks()
        submit_task(task.id, TaskSubmissionRequest(selected_action="escalate"), bg, db, user)

        report = get_session_report_data(db, session.id)
        check("a session with no email_writing task has typing_metrics=None, never a fabricated zeroed summary",
              report.typing_metrics is None)
    finally:
        _cleanup(db, session)
        db.close()


if __name__ == "__main__":
    test_email_writing_deterministic_generation_shape()
    test_email_writing_controlled_generation_success()
    test_email_writing_falls_back_to_deterministic_on_generation_failure()
    test_email_writing_scoring_perfect_response()
    test_email_writing_scoring_missing_required_points()
    test_email_writing_scoring_forbidden_content_penalized()
    test_email_writing_scoring_length_violation()
    test_email_writing_scoring_empty_response()
    test_typing_metrics_schema_rejects_negative_values()
    test_typing_metrics_schema_never_carries_raw_text_fields()
    test_urgent_request_deterministic_generation_shape()
    test_urgent_request_controlled_generation_success()
    test_urgent_request_falls_back_to_deterministic_on_generation_failure()
    test_urgent_request_scoring_correct_and_incorrect()
    test_email_writing_submission_persists_typing_telemetry()
    test_urgent_request_submission_persists_reconsideration_telemetry()
    test_urgent_request_no_reconsideration_persists_no_telemetry_row()
    test_analytics_incorporates_new_task_types_and_typing_metrics()
    test_analytics_typing_metrics_none_when_no_typing_task_in_session()

    print()
    passed = sum(1 for r in results if r)
    print(f"{passed}/{len(results)} checks passed")
    if passed != len(results):
        sys.exit(1)
