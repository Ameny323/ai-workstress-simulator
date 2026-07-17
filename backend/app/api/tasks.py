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
from app.models.enums import TaskStatus
from app.schemas.task import TaskCreate, TaskOut, TaskCompleteRequest

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
