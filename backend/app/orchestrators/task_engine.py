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
from typing import Callable, List, Optional

from sqlalchemy.orm import Session as DBSession

from app.models.enums import SessionPhase, TaskDifficulty, TaskType, TaskStatus
from app.models.session import Session as SessionModel
from app.models.task import Task
from app.models.task_template import TaskTemplate
from app.orchestrators.adaptation import adjust_priority_and_deadline, resolve_difficulty_pool
from app.orchestrators.performance_tracker import PerformanceSnapshot, get_performance_snapshot
from app.tasks.data_validation import generate_validation_instance
from app.tasks.document_organization import generate_document_organization_instance
from app.tasks.image_matching import generate_matching_instance

# Fired for ARIA manager-message triggers. Deliberately a plain callable,
# not a FastAPI type -- this module stays framework-agnostic, and whatever
# calls generate_next_task decides how to actually run it (e.g. the API
# layer schedules it via BackgroundTasks so it can't block the response).
# Default is None everywhere, so every existing caller (including the
# verification scripts) is completely unaffected.
ManagerEventCallback = Callable[[str, PerformanceSnapshot, Optional[Task]], None]

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
    TaskType.image_matching: generate_matching_instance,
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
    db: DBSession,
    session: SessionModel,
    phase: SessionPhase,
    on_manager_event: Optional[ManagerEventCallback] = None,
) -> List[TaskDifficulty]:
    """Wraps adaptation.resolve_difficulty_pool with a cooldown so the pool
    doesn't flip on every single completion in a row.

    Cooldown state (last_difficulty_pool, difficulty_pool_set_at_task_count)
    is persisted on the Session row rather than held in memory — the pool
    is re-evaluated fresh on every call (via get_performance_snapshot), so
    the cooldown has to survive a server restart mid-session too.

    The mercy rule always overrides the cooldown: it exists specifically to
    react immediately to a struggling user, so it must never be delayed.

    on_manager_event, if given, fires:
      - "mercy_rule_activated" every call where the mercy rule is what's
        governing the pool right now (not gated by cooldown -- same as the
        pool resolution itself, which mercy always overrides).
      - "difficulty_changed" only on a genuine escalation/de-escalation
        change (the same `candidate_pool != previous_pool` check that
        decides whether to persist a new anchor below) -- and only when
        that change ISN'T the mercy rule, since mercy gets its own event
        instead. resolve_difficulty_pool is first-match-wins, so these two
        are mutually exclusive per call by construction.
    """
    snapshot = get_performance_snapshot(db, session.id)
    candidate_pool = resolve_difficulty_pool(snapshot, phase)

    is_mercy = (
        snapshot.declared_stress is not None
        and snapshot.declared_stress > 80
        and snapshot.avg_score < 40
    )

    if is_mercy and on_manager_event is not None:
        on_manager_event("mercy_rule_activated", snapshot, None)

    previous_pool = _deserialize_pool(session.last_difficulty_pool)

    if previous_pool is not None and not is_mercy:
        tasks_since_change = snapshot.tasks_completed_in_session - (
            session.difficulty_pool_set_at_task_count or 0
        )
        if tasks_since_change < DIFFICULTY_COOLDOWN_TASKS:
            return previous_pool  # cooldown active — ignore what the rules say now

    if candidate_pool != previous_pool:
        # previous_pool is None on a session's very first-ever resolution --
        # that's initialization, not a change to announce. Firing here would
        # be spurious noise: neither escalation nor de-escalation condition
        # can be true yet on zero history, so _resolve_tone would fall
        # through to neutre anyway, indistinguishable from new_task_assigned.
        is_first_ever_resolution = previous_pool is None
        session.last_difficulty_pool = _serialize_pool(candidate_pool)
        session.difficulty_pool_set_at_task_count = snapshot.tasks_completed_in_session
        db.add(session)
        db.commit()
        if not is_mercy and not is_first_ever_resolution and on_manager_event is not None:
            on_manager_event("difficulty_changed", snapshot, None)

    return candidate_pool


class TaskEngine:
    def __init__(self, db: DBSession):
        self.db = db

    def generate_next_task(
        self,
        session_id: uuid.UUID,
        phase: SessionPhase,
        on_manager_event: Optional[ManagerEventCallback] = None,
    ) -> Task:
        # debriefing means the session is wrapping up — refuse outright
        # rather than relying on resolve_difficulty_pool's [EASY] fallback
        # to quietly handle a phase it was never meant to serve tasks for.
        if phase == SessionPhase.debriefing:
            raise NoTemplateAvailable("Session is in the debriefing phase; no new tasks are generated")

        session = self.db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if session is None:
            raise NoTemplateAvailable(f"Session '{session_id}' not found")

        difficulty_pool = resolve_difficulty_pool_with_cooldown(
            self.db, session, phase, on_manager_event=on_manager_event
        )

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

        if on_manager_event is not None:
            on_manager_event("new_task_assigned", snapshot, task)

        return task
