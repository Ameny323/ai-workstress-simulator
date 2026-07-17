import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.enums import TaskType, TaskStatus, Priority


class TaskCreate(BaseModel):
    type: TaskType
    title: str
    description: Optional[str] = None
    deadline: Optional[datetime] = None
    priority: Priority = Priority.normal


class TaskOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    type: TaskType
    title: str
    description: Optional[str]
    assigned_at: datetime
    deadline: Optional[datetime]
    completed_at: Optional[datetime]
    status: TaskStatus
    priority: Priority
    error_count: int

    class Config:
        from_attributes = True


class TaskCompleteRequest(BaseModel):
    error_count: int = 0
