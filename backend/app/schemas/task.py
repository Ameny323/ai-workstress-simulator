import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel

from app.models.enums import TaskType, TaskStatus, TaskDifficulty, Priority


class TaskCreate(BaseModel):
    type: TaskType
    title: str
    description: Optional[str] = None
    deadline: Optional[datetime] = None
    priority: Priority = Priority.medium


class TaskOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    template_id: Optional[uuid.UUID]
    type: TaskType
    title: str
    description: Optional[str]
    difficulty: Optional[TaskDifficulty]
    instance_data: Optional[Dict[str, Any]]
    submission_data: Optional[Dict[str, Any]]
    assigned_at: datetime
    deadline: Optional[datetime]
    deadline_seconds: Optional[int]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    time_taken_seconds: Optional[int]
    status: TaskStatus
    priority: Priority
    error_count: int
    content_score: Optional[float]

    class Config:
        from_attributes = True


class TaskCompleteRequest(BaseModel):
    error_count: int = 0


class TaskSubmissionRequest(BaseModel):
    # data_validation: ids of the records the user checked as invalid.
    flagged_ids: List[int] = []
    # document_organization: record id -> category the user assigned it to.
    assignments: Dict[int, str] = {}
    # image_matching: image item id -> description id the user matched it to.
    matches: Dict[int, int] = {}
