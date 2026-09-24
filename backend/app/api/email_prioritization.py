"""Task 02 -- Email Prioritization REST API.

Reuses the existing Task/Session lifecycle, auth, and DB session
dependencies exactly as every other route in this project does. Task
*creation* doesn't go through the adaptive TaskEngine (built for
difficulty-pool selection over randomly-picked TaskTemplates -- a concept
that doesn't apply to one fixed narrative scenario), so this router owns
its own small creation endpoint -- but everything downstream (the Task
row, its status transitions) uses the exact same Task model/columns every
other task type already uses.
"""
import logging
import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.ai import task_generation
from app.api.deps import get_current_user
from app.database import get_db
from app.models.email_decision import EmailDecision
from app.models.email_scenario import EmailScenario
from app.models.email_task_item import EmailTaskItem
from app.models.enums import GenerationType, ManagerTone, Priority, ScenarioSource, TaskStatus, TaskType
from app.models.interaction_metric import InteractionMetric
from app.models.session import Session as SessionModel
from app.models.task import Task
from app.models.user import User
from app.orchestrators import priority_evaluation as pe
from app.orchestrators.email_event_pipeline import handle_email_event
from app.schemas.email_prioritization import (
    EmailDecisionIn,
    EmailDecisionOut,
    EmailDetailOut,
    EmailPrioritizationTaskOut,
    EmailSummaryOut,
    SimulationStateOut,
    TaskResultsOut,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Backend-owned, last-resort scoring config for a freshly generated
# scenario when NO EmailScenario exists yet to copy configuration from
# (e.g. a fresh DB before seeds/load_email_scenarios.py has ever run).
# Whenever an existing scenario IS available, its own priority_weights/
# priority_rules/context_attributes are reused instead -- the LLM never
# authors scoring configuration either way. Same weight keys
# PriorityEvaluationService.WEIGHT_FACTORS already expects.
_DEFAULT_PRIORITY_WEIGHTS = {
    "urgency": 0.30, "business_impact": 0.25, "operational_relevance": 0.15,
    "deadline_pressure": 0.20, "security_risk": 0.10,
}


def _generate_email_scenario(db: DBSession) -> Optional[EmailScenario]:
    """Task 03 (automatic task generation): produce a fresh, single-use
    EmailScenario + EmailTaskItem set via controlled LLM generation.
    Scoring configuration (weights/rules/context_attributes) is reused
    from an existing scenario if one exists -- never authored by the LLM.
    Every email's expected_priority is computed by the existing,
    unmodified PriorityEvaluationService inside task_generation.py,
    exactly mirroring backend/seeds/load_email_scenarios.py's own pattern.

    Returns None on ANY generation failure -- the caller falls back to the
    pre-existing seeded scenario; this must never break task creation.
    marked is_active=False so it never competes with the seed lookup for
    a LATER, unrelated session's fallback -- each generation call produces
    its own scenario for its own task instance only.
    """
    config_source = db.query(EmailScenario).order_by(EmailScenario.created_at.asc()).first()
    if config_source is not None:
        weights = config_source.priority_weights
        rules = config_source.priority_rules
        attrs = config_source.context_attributes
        role_hint = config_source.role
    else:
        weights, rules, attrs, role_hint = _DEFAULT_PRIORITY_WEIGHTS, [], {}, "Senior Analyst"

    context = task_generation.EmailPrioritizationGenerationContext(
        role=role_hint, priority_weights=weights, priority_rules=rules, context_attributes=attrs,
    )
    try:
        generated = task_generation.generate_task(TaskType.email_prioritization, context)
    except task_generation.GenerationError as exc:
        logger.warning("email_prioritization LLM generation failed, falling back to seeded scenario: %s", exc)
        return None

    scenario = EmailScenario(
        name=generated["name"], role=generated["role"], context_description=generated["context_description"],
        context_tags=generated["context_tags"], context_attributes=attrs, priority_weights=weights,
        priority_rules=rules, is_active=False, source=ScenarioSource.GENERATED,
        scenario_version=task_generation.TASK_GENERATION_PROMPT_VERSION,
    )
    db.add(scenario)
    db.flush()  # assigns scenario.id for the FK below

    base_time = datetime.utcnow()
    for entry in generated["emails"]:
        db.add(EmailTaskItem(
            scenario_id=scenario.id, sender=entry["sender"], sender_role=entry["sender_role"],
            subject=entry["subject"], body=entry["body"], received_at=base_time, deadline=entry["deadline"],
            has_attachment=entry["has_attachment"], attachments=entry["attachments"],
            urgency=entry["urgency"], business_impact=entry["business_impact"],
            operational_relevance=entry["operational_relevance"], deadline_pressure=entry["deadline_pressure"],
            security_risk=entry["security_risk"], context_tags=entry["context_tags"],
            priority_score=entry["priority_score"], expected_priority=entry["expected_priority"],
            triggered_rules=entry["triggered_rules"], evaluation_rationale=entry["evaluation_rationale"],
            priority_boundary_proximity=entry["priority_boundary_proximity"],
        ))
    db.commit()
    db.refresh(scenario)
    return scenario

# No duration is configured per-scenario (out of this plan's model scope);
# one reasonable constant, same role as TaskTemplate.estimated_duration
# plays for the other task types.
DEFAULT_TASK_DURATION_SECONDS = 480


def _get_owned_session(session_id: uuid.UUID, db: DBSession, current_user: User) -> SessionModel:
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this session")
    return session


def get_owned_email_task(task_id: uuid.UUID, db: DBSession, current_user: User) -> Task:
    task = db.query(Task).filter(Task.id == task_id, Task.type == TaskType.email_prioritization).first()
    if not task:
        raise HTTPException(status_code=404, detail="Email prioritization task not found")
    if task.session.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this task")
    return task


def _timing(task: Task) -> tuple:
    """(elapsed_seconds, remaining_seconds, total_seconds) -- server-side,
    never trusting anything the client might have sent about timing."""
    total = task.deadline_seconds or DEFAULT_TASK_DURATION_SECONDS
    elapsed = max(0.0, (datetime.utcnow() - task.assigned_at).total_seconds())
    remaining = max(0.0, total - elapsed)
    return elapsed, remaining, total


def _to_email_factors(email: EmailTaskItem) -> pe.EmailFactors:
    return pe.EmailFactors(
        urgency=email.urgency,
        business_impact=email.business_impact,
        operational_relevance=email.operational_relevance,
        deadline_pressure=email.deadline_pressure,
        security_risk=email.security_risk,
        context_tags=email.context_tags or [],
    )


# ── Task creation / resume ───────────────────────────────────────────────
@router.post("/sessions/{session_id}/email-prioritization/task", response_model=EmailPrioritizationTaskOut)
def start_email_prioritization_task(
    session_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """POST, not GET -- this can create a Task row (review correction #1).
    Idempotent: resumes the existing active task instead of creating a
    second one if this session already has one.
    """
    session = _get_owned_session(session_id, db, current_user)

    existing = (
        db.query(Task)
        .filter(
            Task.session_id == session.id,
            Task.type == TaskType.email_prioritization,
            Task.status.in_([TaskStatus.pending, TaskStatus.in_progress]),
        )
        .first()
    )
    if existing:
        return existing

    # Task 03: try a fresh, controlled LLM generation for this session's
    # instance first; fall back to the pre-existing seeded scenario on any
    # failure (missing key, timeout, malformed output, content validation).
    generated_scenario = _generate_email_scenario(db)
    if generated_scenario is not None:
        scenario = generated_scenario
        generation_type = GenerationType.LLM
    else:
        scenario = db.query(EmailScenario).filter(EmailScenario.is_active.is_(True)).first()
        generation_type = GenerationType.FALLBACK
    if not scenario:
        raise HTTPException(status_code=404, detail="No active email scenario is configured")

    task = Task(
        session_id=session.id,
        scenario_id=scenario.id,
        type=TaskType.email_prioritization,
        title=scenario.name,
        description=scenario.context_description,
        status=TaskStatus.in_progress,
        priority=Priority.medium,
        deadline_seconds=DEFAULT_TASK_DURATION_SECONDS,
        assigned_at=datetime.utcnow(),
        started_at=datetime.utcnow(),
        generation_type=generation_type,
        generation_prompt_version=task_generation.TASK_GENERATION_PROMPT_VERSION if generation_type == GenerationType.LLM else None,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    total_emails = db.query(EmailTaskItem).filter(EmailTaskItem.scenario_id == scenario.id).count()
    elapsed, remaining, total = _timing(task)
    handle_email_event(
        db, background_tasks, session, task, "task_started",
        total_emails=total_emails, elapsed_seconds=elapsed, remaining_time_seconds=remaining, total_time_seconds=total,
        telemetry_metadata={"scenario_id": str(scenario.id)},
    )
    return task


@router.get("/sessions/{session_id}/email-prioritization/task", response_model=EmailPrioritizationTaskOut)
def get_current_email_prioritization_task(
    session_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pure read -- no side effects, satisfies "GET only for retrieval"."""
    session = _get_owned_session(session_id, db, current_user)
    task = (
        db.query(Task)
        .filter(
            Task.session_id == session.id,
            Task.type == TaskType.email_prioritization,
            Task.status.in_([TaskStatus.pending, TaskStatus.in_progress]),
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="No active email prioritization task for this session")
    return task


# ── Emails ────────────────────────────────────────────────────────────────
@router.get("/email-prioritization/tasks/{task_id}/emails", response_model=List[EmailSummaryOut])
def list_emails(task_id: uuid.UUID, db: DBSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = get_owned_email_task(task_id, db, current_user)
    return (
        db.query(EmailTaskItem)
        .filter(EmailTaskItem.scenario_id == task.scenario_id)
        .order_by(EmailTaskItem.received_at.asc())
        .all()
    )


def _get_owned_email(task: Task, email_id: uuid.UUID, db: DBSession) -> EmailTaskItem:
    email = db.query(EmailTaskItem).filter(EmailTaskItem.id == email_id, EmailTaskItem.scenario_id == task.scenario_id).first()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found in this task's scenario")
    return email


@router.get("/email-prioritization/tasks/{task_id}/emails/{email_id}", response_model=EmailDetailOut)
def get_email_detail(
    task_id: uuid.UUID,
    email_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_owned_email_task(task_id, db, current_user)
    email = _get_owned_email(task, email_id, db)

    decision = db.query(EmailDecision).filter(EmailDecision.task_id == task.id, EmailDecision.email_id == email.id).first()
    if not decision:
        messages_so_far = 0  # first open of this task, or ARIA hasn't spoken yet -- counted properly below
        last_decision = (
            db.query(EmailDecision)
            .filter(EmailDecision.task_id == task.id, EmailDecision.decided_at.isnot(None))
            .order_by(EmailDecision.decided_at.desc())
            .first()
        )
        current_tone: Optional[ManagerTone] = last_decision.aria_supervision_level if last_decision else None
        decision = EmailDecision(
            session_id=task.session_id,
            task_id=task.id,
            email_id=email.id,
            opened_at=datetime.utcnow(),
            expected_priority=email.expected_priority,
            aria_supervision_level=current_tone,
            aria_messages_before_decision=messages_so_far,
        )
        db.add(decision)
        db.commit()
    return email


# ── Decisions ────────────────────────────────────────────────────────────
def _apply_decision(
    db: DBSession,
    background_tasks: BackgroundTasks,
    task: Task,
    decision: EmailDecision,
    email: EmailTaskItem,
    payload: EmailDecisionIn,
    is_reconsideration: bool,
) -> EmailDecision:
    now = datetime.utcnow()
    score, accuracy_level = pe.score_decision(email.expected_priority, payload.selected_priority)

    if not is_reconsideration:
        decision.initial_priority = payload.selected_priority
        decision.decided_at = now
        decision.decision_time_ms = max(0, int((now - decision.opened_at).total_seconds() * 1000))
    else:
        decision.changed_decision = True
        decision.change_count = (decision.change_count or 0) + 1

    decision.selected_priority = payload.selected_priority
    decision.score = score
    decision.accuracy_level = accuracy_level
    decision.was_correct = accuracy_level.value == "EXACT"
    db.add(decision)
    db.commit()
    db.refresh(decision)

    total_emails = db.query(EmailTaskItem).filter(EmailTaskItem.scenario_id == task.scenario_id).count()
    elapsed, remaining, total = _timing(task)
    event_id = uuid.uuid4()
    handle_email_event(
        db, background_tasks, task.session, task,
        "email_priority_changed" if is_reconsideration else "email_priority_selected",
        total_emails=total_emails, elapsed_seconds=elapsed, remaining_time_seconds=remaining, total_time_seconds=total,
        decision_time_ms=decision.decision_time_ms, reconsidered_this_email=is_reconsideration, event_id=event_id,
        telemetry_metadata={
            "email_id": str(email.id),
            "selected_priority": payload.selected_priority.value,
            "previous_priority": decision.initial_priority.value if is_reconsideration and decision.initial_priority else None,
            "change_count": decision.change_count,
        },
    )
    return decision


@router.post("/email-prioritization/tasks/{task_id}/emails/{email_id}/decision", response_model=EmailDecisionOut)
def submit_decision(
    task_id: uuid.UUID,
    email_id: uuid.UUID,
    payload: EmailDecisionIn,
    background_tasks: BackgroundTasks,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_owned_email_task(task_id, db, current_user)
    email = _get_owned_email(task, email_id, db)
    decision = db.query(EmailDecision).filter(EmailDecision.task_id == task.id, EmailDecision.email_id == email.id).first()
    if not decision:
        # Email was never opened via GET first -- create the row now so a
        # direct POST still works, opened_at just equals decided_at.
        decision = EmailDecision(
            session_id=task.session_id, task_id=task.id, email_id=email.id,
            opened_at=datetime.utcnow(), expected_priority=email.expected_priority,
        )
        db.add(decision)
        db.commit()
    if decision.decided_at is not None:
        raise HTTPException(status_code=409, detail="Already decided for this email -- use PATCH to reconsider")

    try:
        return _apply_decision(db, background_tasks, task, decision, email, payload, is_reconsideration=False)
    except IntegrityError:
        # Idempotency backstop (review correction #11): a concurrent
        # request already created/decided this row between our check and
        # our write. Treat it as "already decided", not a crash.
        db.rollback()
        raise HTTPException(status_code=409, detail="Already decided for this email -- use PATCH to reconsider")


@router.patch("/email-prioritization/tasks/{task_id}/emails/{email_id}/decision", response_model=EmailDecisionOut)
def reconsider_decision(
    task_id: uuid.UUID,
    email_id: uuid.UUID,
    payload: EmailDecisionIn,
    background_tasks: BackgroundTasks,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_owned_email_task(task_id, db, current_user)
    email = _get_owned_email(task, email_id, db)
    decision = db.query(EmailDecision).filter(EmailDecision.task_id == task.id, EmailDecision.email_id == email.id).first()
    if not decision or decision.decided_at is None:
        raise HTTPException(status_code=404, detail="No existing decision for this email -- use POST first")

    return _apply_decision(db, background_tasks, task, decision, email, payload, is_reconsideration=True)


# ── State / completion / results ─────────────────────────────────────────
@router.get("/email-prioritization/tasks/{task_id}/state", response_model=SimulationStateOut)
def get_state(task_id: uuid.UUID, db: DBSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = get_owned_email_task(task_id, db, current_user)
    decisions = [
        pe.DecisionRecord(
            score=d.score, accuracy_level=d.accuracy_level, decision_time_ms=d.decision_time_ms,
            changed_decision=d.changed_decision, change_count=d.change_count, opened_at=d.opened_at,
            decided_at=d.decided_at, aria_supervision_level=d.aria_supervision_level.value if d.aria_supervision_level else None,
        )
        for d in db.query(EmailDecision).filter(EmailDecision.task_id == task.id).all()
        if d.decided_at is not None
    ]
    total_emails = db.query(EmailTaskItem).filter(EmailTaskItem.scenario_id == task.scenario_id).count()
    aria_count = db.query(InteractionMetric).filter(InteractionMetric.task_id == task.id, InteractionMetric.action_type == "aria_message_sent").count()
    elapsed, remaining, total = _timing(task)
    return pe.compute_simulation_state(decisions, total_emails, aria_count, elapsed, remaining)


@router.post("/email-prioritization/tasks/{task_id}/complete", response_model=EmailPrioritizationTaskOut)
def complete_task(
    task_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_owned_email_task(task_id, db, current_user)
    if task.status == TaskStatus.completed:
        return task

    now = datetime.utcnow()
    task.status = TaskStatus.completed
    task.completed_at = now
    task.time_taken_seconds = int((now - task.assigned_at).total_seconds())
    db.add(task)
    db.commit()
    db.refresh(task)

    total_emails = db.query(EmailTaskItem).filter(EmailTaskItem.scenario_id == task.scenario_id).count()
    elapsed, remaining, total = _timing(task)
    handle_email_event(
        db, background_tasks, task.session, task, "task_completed",
        total_emails=total_emails, elapsed_seconds=elapsed, remaining_time_seconds=remaining, total_time_seconds=total,
    )
    return task


@router.get("/email-prioritization/tasks/{task_id}/results", response_model=TaskResultsOut)
def get_results(task_id: uuid.UUID, db: DBSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = get_owned_email_task(task_id, db, current_user)
    decisions = [
        pe.DecisionRecord(
            score=d.score, accuracy_level=d.accuracy_level, decision_time_ms=d.decision_time_ms,
            changed_decision=d.changed_decision, change_count=d.change_count, opened_at=d.opened_at,
            decided_at=d.decided_at, aria_supervision_level=d.aria_supervision_level.value if d.aria_supervision_level else None,
        )
        for d in db.query(EmailDecision).filter(EmailDecision.task_id == task.id).all()
        if d.decided_at is not None
    ]
    total_emails = db.query(EmailTaskItem).filter(EmailTaskItem.scenario_id == task.scenario_id).count()
    aria_count = db.query(InteractionMetric).filter(InteractionMetric.task_id == task.id, InteractionMetric.action_type == "aria_message_sent").count()
    duration = task.time_taken_seconds or (datetime.utcnow() - task.assigned_at).total_seconds()
    return pe.compute_task_results(decisions, total_emails, aria_count, duration)
