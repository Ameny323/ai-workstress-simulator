import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.session import Session as SessionModel
from app.models.task import Task
from app.models.enums import TaskStatus, TaskType
from app.schemas.task import TaskCreate, TaskOut, TaskCompleteRequest, TaskSubmissionRequest
from app.orchestrators.task_engine import TaskEngine, NoTemplateAvailable
from app.tasks.data_validation import score_validation_submission

# One scorer per task family. Only data_validation is implemented so far —
# other types are skipped (content_score stays null) until their scorers exist.
SCORERS = {
    TaskType.data_validation: score_validation_submission,
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


@router.get(
    "/sessions/{session_id}/next-task",
    response_model=TaskOut,
    tags=["tasks"],
)
def get_next_task(
    session_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_owned_session(session_id, db, current_user)

    engine = TaskEngine(db)
    try:
        task = engine.generate_next_task(session_id, session.current_phase)
    except NoTemplateAvailable as e:
        raise HTTPException(status_code=404, detail=str(e))

    return task


@router.get("/tasks/{task_id}", response_model=TaskOut, tags=["tasks"])
def get_task(
    task_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_owned_task(task_id, db, current_user)


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

    now = datetime.utcnow()
    submission_data = {"flagged_ids": payload.flagged_ids}
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

    db.commit()
    db.refresh(task)
    return task
