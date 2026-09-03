from typing import Optional

from pydantic import BaseModel


class PerformanceSnapshotOut(BaseModel):
    avg_score: float
    consecutive_errors: int
    declared_stress: Optional[int]
    tasks_completed_in_session: int
    window_size: int
