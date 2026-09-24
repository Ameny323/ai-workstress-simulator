import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

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


class SequencedTaskOut(TaskOut):
    """Same fields as TaskOut, plus the minimum sequence metadata the
    frontend needs to render a read-only progress indicator and know
    when the simulation is over -- never the full Session.task_sequence
    array itself (the frontend renders progress from sequence_index/
    sequence_total, it doesn't need to see upcoming task types in
    advance). Returned only by GET /sessions/{id}/next-task, which is
    now the sequential simulation's single "give me my current task"
    endpoint -- see app/api/tasks.py's get_next_task.
    """
    sequence_index: Optional[int] = None
    sequence_total: Optional[int] = None
    remaining_global_seconds: Optional[int] = None


class TaskCompleteRequest(BaseModel):
    error_count: int = 0


class TypingMetricsIn(BaseModel):
    """Aggregate-only typing telemetry captured client-side while composing
    an email_writing response -- never raw keystrokes, never the typed
    text itself (that travels separately as written_response). See
    frontend EmailWritingTask.tsx for exactly how these are computed.
    """
    typing_duration_seconds: float = Field(ge=0)
    character_count: int = Field(ge=0)
    word_count: int = Field(ge=0)
    average_chars_per_second: float = Field(ge=0)
    typing_speed_variation: float = Field(ge=0)
    pause_count_during_typing: int = Field(ge=0)


class TaskSubmissionRequest(BaseModel):
    # data_validation: ids of the records the user checked as invalid.
    flagged_ids: List[int] = []
    # document_organization: record id -> category the user assigned it to.
    assignments: Dict[int, str] = {}
    # image_matching: image item id -> description id the user matched it to.
    matches: Dict[int, int] = {}
    # email_writing: the composed response text.
    written_response: Optional[str] = None
    # email_writing: aggregate typing telemetry for this composition, if
    # the frontend captured any (None for a task with no typing at all).
    typing_metrics: Optional[TypingMetricsIn] = None
    # urgent_request: the chosen response-action option id.
    selected_action: Optional[str] = None
    # urgent_request: how many times the user changed their selection
    # before submitting -- client-reported hesitation/reconsideration
    # telemetry only, never used in scoring.
    reconsideration_count: int = 0
