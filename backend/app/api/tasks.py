import uuid
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.session import Session as SessionModel
from app.models.task import Task
from app.models.interaction_metric import InteractionMetric
from app.models.enums import SessionPhase, TaskStatus, TaskType
from app.schemas.task import TaskCreate, TaskOut, SequencedTaskOut, TaskCompleteRequest, TaskSubmissionRequest
from app.orchestrators.task_engine import TaskEngine, NoTemplateAvailable
from app.orchestrators.performance_tracker import PerformanceSnapshot
from app.orchestrators import aria_pipeline
from app.tasks.data_validation import score_validation_submission
from app.tasks.document_organization import score_document_organization_submission
from app.tasks.email_writing import score_email_writing_submission
from app.tasks.image_matching import score_matching_submission
from app.tasks.urgent_request import score_urgent_request_submission

# One scorer per task family.
SCORERS = {
    TaskType.data_validation: score_validation_submission,
    TaskType.document_organization: score_document_organization_submission,
    TaskType.image_matching: score_matching_submission,
    TaskType.email_writing: score_email_writing_submission,
    TaskType.urgent_request: score_urgent_request_submission,
}

router = APIRouter()


def get_owned_session(
    session_id: uuid.UUID, db: DBSession, current_user: User
) -> SessionModel:
    """Fetch a session and make sure it belongs to the current user."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this session",
        )
    return session


def get_owned_task(task_id: uuid.UUID, db: DBSession, current_user: User) -> Task:
    """Fetch a task and make sure its session belongs to the current user."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    get_owned_session(task.session_id, db, current_user)  # raises if not owner
    return task


@router.post(
    "/sessions/{session_id}/tasks",
    response_model=TaskOut,
    status_code=status.HTTP_201_CREATED,
    tags=["tasks"],
)
def create_task(
    session_id: uuid.UUID,
    payload: TaskCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_owned_session(session_id, db, current_user)

    task = Task(
        session_id=session_id,
        type=payload.type,
        title=payload.title,
        description=payload.description,
        deadline=payload.deadline,
        priority=payload.priority,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get(
    "/sessions/{session_id}/tasks",
    response_model=List[TaskOut],
    tags=["tasks"],
)
def list_tasks(
    session_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_owned_session(session_id, db, current_user)

    return (
        db.query(Task)
        .filter(Task.session_id == session_id)
        .order_by(Task.assigned_at.asc())
        .all()
    )


def _remaining_global_seconds(session: SessionModel) -> Optional[int]:
    if session.max_duration_seconds is None:
        return None
    elapsed = (datetime.utcnow() - session.started_at).total_seconds()
    return max(0, int(session.max_duration_seconds - elapsed))


def _generate_task_via_engine(
    db: DBSession,
    background_tasks: BackgroundTasks,
    session: SessionModel,
    task_type: Optional[TaskType],
) -> Task:
    # Routes task_engine's own event vocabulary ("new_task_assigned",
    # "difficulty_changed", "mercy_rule_activated") through the same ARIA v2
    # FSM + generalized trigger engine pipeline Task 02 (email
    # prioritization) already uses, instead of the old direct
    # record_manager_message_job call (which only ever used the pre-FSM
    # _resolve_tone heuristic and never advanced simulation phase/pressure
    # for this task family at all). "new_task_assigned" is normalized to
    # "task_started" so it lines up with the TASK_STARTED trigger the
    # generalized engine already recognizes; the other two event names
    # aren't in aria_policy's event_type-gated trigger set, but they
    # correlate with exactly the signals (consecutive_errors, accuracy) the
    # FSM/trigger engine reads directly off fresh telemetry anyway, so the
    # right trigger (e.g. MULTIPLE_ERRORS, HIGH_ACCURACY) still fires from
    # real data rather than being hardcoded to the event name.
    def on_manager_event(event_type: str, snapshot: PerformanceSnapshot, task: Optional[Task]):
        normalized = "task_started" if event_type == "new_task_assigned" else event_type
        aria_pipeline.emit_aria_reaction(
            db, background_tasks, session, task, normalized,
            telemetry_metadata={"source_event": event_type},
        )

    engine = TaskEngine(db)
    try:
        return engine.generate_next_task(
            session.id, session.current_phase, on_manager_event=on_manager_event, task_type=task_type
        )
    except NoTemplateAvailable as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get(
    "/sessions/{session_id}/next-task",
    response_model=SequencedTaskOut,
    tags=["tasks"],
)
def get_next_task(
    session_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    task_type: Optional[TaskType] = None,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sequential simulation flow (the default for every session created
    since app/core/sequence_config.py landed): the backend -- never the
    client -- decides which task type comes next, from
    session.task_sequence[session.task_sequence_position]. Any `task_type`
    the caller supplies is IGNORED once a session has a configured
    sequence; it only still means what it always did (request a specific
    type from the unrestricted generic pool) for a legacy/manual session
    with no sequence at all (task_sequence is None).

    Idempotent by design: if a Task already exists at the current
    position and isn't completed, THAT SAME row is returned rather than a
    new one being generated -- a page refresh must never hand the
    participant a different task mid-sequence.
    """
    session = get_owned_session(session_id, db, current_user)

    if not session.task_sequence:
        task = _generate_task_via_engine(db, background_tasks, session, task_type)
        return SequencedTaskOut(**TaskOut.model_validate(task).model_dump())

    sequence = session.task_sequence
    total = len(sequence)

    if session.current_phase == SessionPhase.debriefing:
        raise HTTPException(status_code=409, detail="Simulation has ended; no more tasks are assigned")

    remaining = _remaining_global_seconds(session)
    if remaining is not None and remaining <= 0:
        session.current_phase = SessionPhase.debriefing
        db.commit()
        raise HTTPException(status_code=409, detail="Global simulation time has expired")

    if session.task_sequence_position >= total:
        if session.current_phase != SessionPhase.debriefing:
            session.current_phase = SessionPhase.debriefing
            db.commit()
        raise HTTPException(status_code=409, detail="Task sequence is complete")

    existing = (
        db.query(Task)
        .filter(
            Task.session_id == session_id,
            Task.sequence_index == session.task_sequence_position,
            Task.status != TaskStatus.completed,
        )
        .order_by(Task.assigned_at.desc())
        .first()
    )
    if existing is not None:
        return SequencedTaskOut(
            **TaskOut.model_validate(existing).model_dump(),
            sequence_index=existing.sequence_index,
            sequence_total=total,
            remaining_global_seconds=remaining,
        )

    current_type = TaskType(sequence[session.task_sequence_position])
    task = _generate_task_via_engine(db, background_tasks, session, current_type)
    task.sequence_index = session.task_sequence_position
    db.commit()
    db.refresh(task)

    return SequencedTaskOut(
        **TaskOut.model_validate(task).model_dump(),
        sequence_index=task.sequence_index,
        sequence_total=total,
        remaining_global_seconds=_remaining_global_seconds(session),
    )


@router.get("/tasks/{task_id}", response_model=TaskOut, tags=["tasks"])
def get_task(
    task_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_owned_task(task_id, db, current_user)


@router.post("/tasks/{task_id}/engage", response_model=TaskOut, tags=["tasks"])
def engage_task(
    task_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The one authoritative, server-side mechanism for marking genuine
    participant engagement with a task -- distinct from "assigned" (task
    row created) and from "displayed" (frontend rendered it). Each of the
    four sequence task components calls this exactly once, on the
    participant's first MEANINGFUL interaction (a checkbox toggle, a
    drag/drop classification, a keystroke, an option selection) -- never
    on mount/fetch/render.

    Idempotent by construction: only ever sets started_at when it is still
    None. A second call (double-click, re-render, retry) is a harmless
    no-op that returns the task's current state unchanged -- this is what
    "never overwrite" means in practice, enforced here rather than trusted
    to the frontend only calling once.

    Behavioral-evaluation layer (app/reports/behavioral_evaluation.py)
    reads started_at to separate assignment_delay (started_at - assigned_at)
    from active_execution_time (completed_at - started_at) -- see that
    module's own docstring. A task whose started_at stays None (legacy
    tasks predating this endpoint, or a participant who never engaged
    before a timeout) falls back to the old assigned_at-based measurement,
    explicitly marked as such -- never fabricated.
    """
    task = get_owned_task(task_id, db, current_user)

    if task.started_at is None and task.status != TaskStatus.completed:
        task.started_at = datetime.utcnow()
        db.commit()
        db.refresh(task)

    return task


@router.patch("/tasks/{task_id}/complete", response_model=TaskOut, tags=["tasks"])
def complete_task(
    task_id: uuid.UUID,
    payload: TaskCompleteRequest,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = get_owned_task(task_id, db, current_user)

    if task.status == TaskStatus.completed:
        raise HTTPException(status_code=400, detail="Task already completed")

    task.status = TaskStatus.completed
    task.completed_at = datetime.utcnow()
    task.error_count = payload.error_count

    db.commit()
    db.refresh(task)
    return task


@router.post("/tasks/{task_id}/complete", response_model=TaskOut, tags=["tasks"])
def submit_task(
    task_id: uuid.UUID,
    payload: TaskSubmissionRequest,
    background_tasks: BackgroundTasks,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Persist the user's submitted answers and, for scorable task types,
    grade them against the generator's ground truth.

    Task types with no registered scorer (anything but data_validation, for
    now) are still completed and timed — they just skip content_score.
    """
    task = get_owned_task(task_id, db, current_user)

    if task.status == TaskStatus.completed:
        raise HTTPException(status_code=400, detail="Task already completed")

    # Sequential simulation flow: a task with a sequence_index belongs to a
    # session with a configured task_sequence. If that session has since
    # moved past this task's position (e.g. the participant still has a
    # stale tab open on a task that's no longer current, or a duplicate/
    # replayed request), refuse the completion outright rather than
    # silently scoring a superseded task -- "previous tasks cannot be
    # reopened" is enforced HERE, not just by hiding the button client-side.
    session = task.session
    if task.sequence_index is not None and session.task_sequence is not None:
        if task.sequence_index != session.task_sequence_position:
            raise HTTPException(
                status_code=409,
                detail="This task is no longer the active task in the simulation sequence",
            )

    now = datetime.utcnow()
    submission_data = {
        "flagged_ids": payload.flagged_ids,
        "assignments": payload.assignments,
        "matches": payload.matches,
        "written_response": payload.written_response,
        "selected_action": payload.selected_action,
        "reconsideration_count": payload.reconsideration_count,
    }
    task.submission_data = submission_data

    scorer = SCORERS.get(task.type)
    if scorer is not None and task.instance_data is not None:
        result = scorer(task.instance_data, submission_data)
        task.content_score = result["content_score"]
        task.error_count = result["error_count"]

    reference_start = task.started_at or task.assigned_at
    if reference_start is not None:
        task.time_taken_seconds = int((now - reference_start).total_seconds())

    task.status = TaskStatus.completed
    task.completed_at = now

    # Advance the sequence exactly once, at the moment a task genuinely
    # transitions to completed -- the `status == completed` guard above
    # already prevents this block from ever running twice for the same
    # task, so a duplicate/replayed completion request cannot advance the
    # position twice. Reaching the end of the configured sequence hands
    # off to the FSM's own debriefing phase -- no second "simulation over"
    # state is introduced.
    if task.sequence_index is not None and session.task_sequence is not None:
        session.task_sequence_position = task.sequence_index + 1
        if session.task_sequence_position >= len(session.task_sequence):
            session.current_phase = SessionPhase.debriefing
        db.add(session)

    db.commit()
    db.refresh(task)

    # Typing telemetry (cahier: "variations de vitesse de frappe") --
    # extends the existing InteractionMetric architecture rather than a
    # second telemetry system; aggregate-only, no raw keystrokes/text.
    # Only ever present for email_writing (the one task type where typing
    # is actually part of the interaction) -- never fabricated for a task
    # that didn't capture any.
    if payload.typing_metrics is not None:
        db.add(InteractionMetric(
            session_id=task.session_id,
            task_id=task.id,
            action_type="typing_metrics",
            metadata_json=payload.typing_metrics.model_dump(),
        ))
        db.commit()

    if payload.reconsideration_count:
        db.add(InteractionMetric(
            session_id=task.session_id,
            task_id=task.id,
            action_type="reconsideration",
            metadata_json={"count": payload.reconsideration_count},
        ))
        db.commit()

    # Unlike email_prioritization.py's complete_task (Task 02), this route
    # previously fired no ARIA event at all on completion -- the only
    # signal came from get_next_task's "new_task_assigned" on whatever task
    # came AFTER. Wiring TASK_COMPLETED here closes that gap for
    # data_validation/image_matching/document_organization too.
    aria_pipeline.emit_aria_reaction(
        db, background_tasks, task.session, task, "task_completed",
        telemetry_metadata={"content_score": task.content_score, "error_count": task.error_count},
    )
    return task
