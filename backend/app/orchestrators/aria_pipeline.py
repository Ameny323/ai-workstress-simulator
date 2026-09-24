"""General-purpose ARIA event pipeline for task types OTHER than Email
Prioritization (data_validation / document_organization / image_matching,
via app/api/tasks.py). Task 02 already has its own, richer, independently
verified pipeline (app/orchestrators/email_event_pipeline.py, with its own
EmailDecision-derived SimulationState) -- left untouched here rather than
merged, to avoid risking regression on an already end-to-end-tested path.
This module gives the OTHER task types the same underlying machinery
(FSM -> trigger engine -> cooldown-checked reserve/broadcast/upgrade) that
email_event_pipeline.py pioneered, generalized to not assume email-shaped
state.

    user event (task assigned / completed / difficulty changed / ...)
      -> SimulationStateMachine.evaluate_and_persist (phase/tone/pressure)
      -> InteractionMetric telemetry row
      -> AriaTriggerEngine.decide_aria_reaction (cooldown-checked)
      -> reserve ManagerMessage synchronously (fallback wording)
      -> broadcast aria_analyzing -> aria_message (WebSocket)
      -> background job upgrades content via OpenAI if available
      -> broadcast state_update (phase/tone/pressure, generic performance)
"""
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session as DBSession

from app.database import SessionLocal
from app.models.enums import GenerationType
from app.models.interaction_metric import InteractionMetric
from app.models.manager_message import ManagerMessage
from app.models.session import Session as SessionModel
from app.models.task import Task
from app.orchestrators import aria_policy, simulation_fsm
from app.orchestrators.performance_tracker import get_extended_performance_metrics
from app.ai.manager_service import fallback_message, generate_manager_message
from app.orchestrators.email_event_pipeline import _broadcast_async_safe, _broadcast_sync_safe

logger = logging.getLogger(__name__)


def _task_timing(task: Optional[Task]) -> Tuple[Optional[float], Optional[float]]:
    """(remaining_time_seconds, remaining_time_ratio) for the currently
    active task, or (None, None) when there's no task or it carries no
    real deadline -- mirrors email_prioritization.py's own _timing helper.
    Bug fix: this pipeline previously never computed either value, so the
    LOW_REMAINING_TIME trigger (aria_policy.py) and the pressure score's
    remaining_time component (simulation_fsm.py) were silently dead for
    every task type routed through here (data_validation/image_matching/
    document_organization all set Task.deadline_seconds via
    task_engine.py's adjust_priority_and_deadline) -- only Task 02 (email
    prioritization) ever exercised those paths.
    """
    if task is None or not task.deadline_seconds:
        return None, None
    reference_start = task.started_at or task.assigned_at
    if reference_start is None:
        return None, None
    elapsed = max(0.0, (datetime.utcnow() - reference_start).total_seconds())
    remaining = max(0.0, task.deadline_seconds - elapsed)
    ratio = max(0.0, min(1.0, remaining / task.deadline_seconds))
    return remaining, ratio


def emit_aria_reaction(
    db: DBSession,
    background_tasks: BackgroundTasks,
    session: SessionModel,
    task: Optional[Task],
    event_type: str,
    *,
    telemetry_metadata: Optional[Dict[str, Any]] = None,
    event_id: Optional[uuid.UUID] = None,
) -> simulation_fsm.FSMResult:
    """Returns the FSM result (also broadcast as part of state_update)."""
    event_id = event_id or uuid.uuid4()

    db.add(
        InteractionMetric(
            session_id=session.id,
            task_id=task.id if task else None,
            action_type=event_type,
            metadata_json={**(telemetry_metadata or {}), "event_id": str(event_id)},
        )
    )
    db.commit()

    extended_metrics = get_extended_performance_metrics(db, session.id)
    remaining_time_seconds, remaining_time_ratio = _task_timing(task)
    extended_metrics.remaining_time_ratio = remaining_time_ratio
    previous_phase = session.current_phase
    fsm_result = simulation_fsm.evaluate_and_persist(db, session, extended_metrics)

    facts = {
        "event_type": event_type,
        "rolling_accuracy": extended_metrics.accuracy,
        "processed_count": extended_metrics.tasks_completed_in_session,
        "consecutive_errors": extended_metrics.consecutive_errors,
        "idle_time_seconds": extended_metrics.idle_time_seconds,
        "phase_changed": previous_phase != fsm_result.phase,
        "remaining_time_seconds": remaining_time_seconds,
        # Stress Declaration feature: wires the previously-dormant
        # STRESS_INCREASE trigger (aria_policy.decide_aria_reaction) up to
        # real data. Both None until a second declaration exists this
        # session -- that function's own guard already requires both to be
        # non-None before comparing, so this never fires on a single
        # declaration alone.
        "declared_stress": extended_metrics.declared_stress,
        "previous_declared_stress": extended_metrics.previous_declared_stress,
    }
    aria_decision = aria_policy.decide_aria_reaction(facts, fsm_result.manager_tone)

    if aria_decision is not None and aria_policy.should_emit(db, session.id, aria_decision):
        _broadcast_sync_safe(session.id, {"type": "aria_analyzing", "session_id": str(session.id)})

        placeholder = fallback_message(aria_decision.tone, aria_decision.trigger)
        message = ManagerMessage(
            session_id=session.id,
            content=placeholder,
            tone=aria_decision.tone,
            trigger_context={
                "event_type": event_type,
                "trigger": aria_decision.trigger,
                "task_id": str(task.id) if task else None,
                "event_id": str(event_id),
            },
            was_fallback=True,
            generation_type=GenerationType.FALLBACK,
        )
        db.add(message)
        db.commit()
        db.refresh(message)

        _broadcast_sync_safe(session.id, {
            "type": "aria_message", "id": str(message.id), "session_id": str(session.id),
            "content": message.content, "tone": message.tone.value, "trigger": aria_decision.trigger,
            "sent_at": message.sent_at.isoformat(), "was_fallback": True, "event_id": str(event_id),
        })

        background_tasks.add_task(
            _upgrade_generic_aria_message_job,
            message_id=message.id,
            session_id=session.id,
            task_id=task.id if task else None,
            event_type=event_type,
            tone=aria_decision.tone,
            trigger=aria_decision.trigger,
            extra_facts=facts,
            event_id=event_id,
            fsm_result=fsm_result,
        )

    _broadcast_sync_safe(session.id, {
        "type": "state_update", "session_id": str(session.id), "event_id": str(event_id),
        "simulation": {
            "phase": fsm_result.phase.value,
            "manager_state": fsm_result.manager_tone.value,
            "pressure_score": fsm_result.pressure_score,
            "communication_frequency_seconds": fsm_result.communication_frequency_seconds,
        },
        "performance": {
            "avg_score": extended_metrics.avg_score,
            "accuracy": extended_metrics.accuracy,
            "error_rate": extended_metrics.error_rate,
            "tasks_completed_in_session": extended_metrics.tasks_completed_in_session,
            "declared_stress": extended_metrics.declared_stress,
            "workload": extended_metrics.workload,
        },
    })

    return fsm_result


async def _upgrade_generic_aria_message_job(
    message_id: uuid.UUID,
    session_id: uuid.UUID,
    task_id: Optional[uuid.UUID],
    event_type: str,
    tone,
    trigger: str,
    extra_facts: Dict[str, Any],
    event_id: uuid.UUID,
    fsm_result,
) -> None:
    """Same upgrade-in-place pattern as email_event_pipeline._upgrade_aria_
    message_job -- kept as a near-duplicate rather than a shared function
    across the two modules purely to avoid a fragile cross-import between
    two independently-evolving pipelines; both do the same three things
    (re-fetch, call OpenAI, update-if-real)."""
    db = SessionLocal()
    try:
        message = db.query(ManagerMessage).filter(ManagerMessage.id == message_id).first()
        session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if message is None or session is None:
            logger.warning("_upgrade_generic_aria_message_job: message or session not found (%s / %s)", message_id, session_id)
            return
        task = db.query(Task).filter(Task.id == task_id).first() if task_id else None
        metrics = get_extended_performance_metrics(db, session_id)
        result = await generate_manager_message(
            db, event_type, session, metrics, task, tone=tone, trigger=trigger, extra_facts=extra_facts,
            fsm_result=fsm_result,
        )
        if result.was_fallback:
            return

        message.content = result.content
        message.was_fallback = False
        message.generation_type = GenerationType.LLM
        db.add(message)
        db.commit()

        await _broadcast_async_safe(session_id, {
            "type": "aria_message", "id": str(message.id), "session_id": str(session_id),
            "content": message.content, "tone": message.tone.value, "trigger": trigger,
            "sent_at": message.sent_at.isoformat(), "was_fallback": False, "event_id": str(event_id),
        })
    except Exception:
        logger.exception("_upgrade_generic_aria_message_job failed for event '%s'", event_type)
    finally:
        db.close()
