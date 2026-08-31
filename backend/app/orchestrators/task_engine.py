"""Picks a TaskTemplate for the current phase and instantiates a Task from it.

Template selection is random.choice among templates matching the phase AND
the difficulty pool resolved fresh from the session's current performance
(app/orchestrators/adaptation.py), gated by a cooldown so the pool doesn't
flip on every single completion. Content generation is fully delegated to
the per-task-type generator functions in app/tasks/; this class handles
selection, adaptation, and persistence.
"""
import random
import uuid
from typing import List, Optional

from sqlalchemy.orm import Session as DBSession

from app.models.enums import SessionPhase, TaskDifficulty, TaskType, TaskStatus
from app.models.session import Session as SessionModel
from app.models.task import Task
from app.models.task_template import TaskTemplate
from app.orchestrators.adaptation import adjust_priority_and_deadline, resolve_difficulty_pool
from app.orchestrators.performance_tracker import get_performance_snapshot
from app.tasks.data_validation import generate_validation_instance
from app.tasks.document_organization import generate_document_organization_instance

# Fewer than this many completed tasks since the pool last actually changed
# means the cooldown is still active — reuse the previous pool instead of
# reacting to every single completion.
DIFFICULTY_COOLDOWN_TASKS = 2

# One instance generator per task family. Add an entry here when a new
# family (email_writing, urgent_request) gets its own generator module in
# app/tasks/.
INSTANCE_GENERATORS = {
    TaskType.data_validation: generate_validation_instance,
    TaskType.document_organization: generate_document_organization_instance,
}


class NoTemplateAvailable(Exception):
    """Raised when no active TaskTemplate matches the requested phase."""


def _serialize_pool(pool: List[TaskDifficulty]) -> List[str]:
    return [d.value for d in pool]


def _deserialize_pool(raw) -> Optional[List[TaskDifficulty]]:
    if raw is None:
        return None
    return [TaskDifficulty(v) for v in raw]


def resolve_difficulty_pool_with_cooldown(
    db: DBSession, session: SessionModel, phase: SessionPhase
) -> List[TaskDifficulty]:
    """Wraps adaptation.resolve_difficulty_pool with a cooldown so the pool
    doesn't flip on every single completion in a row.

    Cooldown state (last_difficulty_pool, difficulty_pool_set_at_task_count)
    is persisted on the Session row rather than held in memory — the pool
    is re-evaluated fresh on every call (via get_performance_snapshot), so
    the cooldown has to survive a server restart mid-session too.

    The mercy rule always overrides the cooldown: it exists specifically to
    react immediately to a struggling user, so it must never be delayed.
    """
    snapshot = get_performance_snapshot(db, session.id)
    candidate_pool = resolve_difficulty_pool(snapshot, phase)

    is_mercy = (
        snapshot.declared_stress is not None
        and snapshot.declared_stress > 80
        and snapshot.avg_score < 40
    )

    previous_pool = _deserialize_pool(session.last_difficulty_pool)

    if previous_pool is not None and not is_mercy:
        tasks_since_change = snapshot.tasks_completed_in_session - (
            session.difficulty_pool_set_at_task_count or 0
        )
        if tasks_since_change < DIFFICULTY_COOLDOWN_TASKS:
            return previous_pool  # cooldown active — ignore what the rules say now

    if candidate_pool != previous_pool:
        session.last_difficulty_pool = _serialize_pool(candidate_pool)
        session.difficulty_pool_set_at_task_count = snapshot.tasks_completed_in_session
        db.add(session)
        db.commit()

    return candidate_pool


class TaskEngine:
    def __init__(self, db: DBSession):
        self.db = db

    def generate_next_task(self, session_id: uuid.UUID, phase: SessionPhase) -> Task:
        # debriefing means the session is wrapping up — refuse outright
        # rather than relying on resolve_difficulty_pool's [EASY] fallback
        # to quietly handle a phase it was never meant to serve tasks for.
        if phase == SessionPhase.debriefing:
            raise NoTemplateAvailable("Session is in the debriefing phase; no new tasks are generated")

        session = self.db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if session is None:
            raise NoTemplateAvailable(f"Session '{session_id}' not found")

        difficulty_pool = resolve_difficulty_pool_with_cooldown(self.db, session, phase)

        templates = (
            self.db.query(TaskTemplate)
            .filter(
                TaskTemplate.phase == phase,
                TaskTemplate.is_active.is_(True),
                TaskTemplate.difficulty.in_(difficulty_pool),
            )
            .all()
        )
        if not templates:
            # Difficulty pool has no matching templates yet (e.g. only easy
            # templates seeded so far, but the pool resolved to [medium,
            # hard]) — fall back to the phase alone rather than crashing or
            # returning nothing.
            templates = (
                self.db.query(TaskTemplate)
                .filter(TaskTemplate.phase == phase, TaskTemplate.is_active.is_(True))
                .all()
            )
        if not templates:
            raise NoTemplateAvailable(f"No active task templates for phase '{phase.value}'")

        template = random.choice(templates)

        generator = INSTANCE_GENERATORS.get(template.task_type)
        if generator is None:
            raise NoTemplateAvailable(
                f"No instance generator registered for task_type '{template.task_type.value}'"
            )

        instance_data = generator(template.metadata_json)

        # Re-fetches the snapshot (resolve_difficulty_pool_with_cooldown
        # already computed one above) rather than threading it through —
        # cheap and consistent with "always query fresh," and keeps this
        # function fully independent of Step 1/2's cooldown wrapper.
        snapshot = get_performance_snapshot(self.db, session_id)
        adjusted_priority, adjusted_deadline_seconds = adjust_priority_and_deadline(
            template.default_priority, template.estimated_duration, snapshot
        )

        task = Task(
            session_id=session_id,
            template_id=template.id,
            type=template.task_type,
            title=template.title,
            description=template.description,
            difficulty=template.difficulty,
            instance_data=instance_data,
            deadline_seconds=adjusted_deadline_seconds,
            status=TaskStatus.pending,
            priority=adjusted_priority,
        )
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        return task
