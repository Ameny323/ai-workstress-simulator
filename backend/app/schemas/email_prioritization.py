import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel

from app.models.enums import AccuracyLevel, PriorityLevel, TaskStatus


class EmailSummaryOut(BaseModel):
    """List-view schema. Deliberately excludes expected_priority,
    priority_score, triggered_rules, evaluation_rationale, and
    priority_boundary_proximity -- that's the answer key, and a
    participant must never receive it (see EmailTaskItem's own docstring).
    """

    id: uuid.UUID
    sender: str
    sender_role: str
    subject: str
    received_at: Optional[datetime]
    has_attachment: bool
    context_tags: List[str]

    class Config:
        from_attributes = True


class EmailDetailOut(EmailSummaryOut):
    body: str
    deadline: Optional[str]
    attachments: List[str]

    class Config:
        from_attributes = True


class EmailDecisionIn(BaseModel):
    selected_priority: PriorityLevel


class EmailDecisionOut(BaseModel):
    id: uuid.UUID
    email_id: uuid.UUID
    selected_priority: PriorityLevel
    score: float
    was_correct: bool
    accuracy_level: AccuracyLevel
    decision_time_ms: Optional[int]
    change_count: int
    changed_decision: bool

    class Config:
        from_attributes = True


class SimulationStateOut(BaseModel):
    processed_count: int
    total_count: int
    # Two distinct metrics, never conflated (review correction #2):
    exact_accuracy: float
    weighted_decision_score: float
    average_decision_time: Optional[float]
    reconsiderations: int
    idle_time_ms: int
    remaining_time: float
    observed_workload_indicator: float
    aria_messages_received: int


class TaskResultsOut(BaseModel):
    total_emails: int
    exact_decisions: int
    close_decisions: int
    misprioritized_decisions: int
    severely_misprioritized_decisions: int
    exact_accuracy: float
    weighted_decision_score: float
    average_decision_time: Optional[float]
    fastest_decision: Optional[int]
    slowest_decision: Optional[int]
    reconsideration_count: int
    reconsideration_rate: float
    total_idle_time_ms: int
    aria_messages_received: int
    observed_workload_indicator: float
    early_task_decision_quality: Optional[float]
    late_task_decision_quality: Optional[float]
    early_task_average_decision_time: Optional[float]
    late_task_average_decision_time: Optional[float]
    decision_quality_change: Optional[float]
    decision_time_change: Optional[float]
    decision_quality_before_demanding_supervision: Optional[float]
    decision_quality_after_demanding_supervision: Optional[float]
    decision_time_before_demanding_supervision: Optional[float]
    decision_time_after_demanding_supervision: Optional[float]
    contextual_analysis: List[str]


class EmailPrioritizationTaskOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    scenario_id: Optional[uuid.UUID]
    title: str
    description: Optional[str]
    status: TaskStatus
    deadline_seconds: Optional[int]
    assigned_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True
