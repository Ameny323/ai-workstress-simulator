"""Single centralized pipeline for every Task 02 (Email Prioritization)
event -- review correction #9. Every route that needs to react to
something (a decision, a reconsideration, completion, a low-time check)
calls handle_email_event() instead of re-implementing this sequence
itself:

    user event
      -> derive SimulationState (from real EmailDecision rows)
      -> deterministic ARIA policy decision (aria_policy, cooldown-checked)
      -> persist ManagerMessage (background -- may call OpenAI)
      -> InteractionMetric telemetry row
      -> WebSocket broadcast (state_update always; aria_message if emitted)

The OpenAI call inside record_manager_message can take up to
REQUEST_TIMEOUT_SECONDS (manager_service.py) -- scheduled via the same
BackgroundTasks pattern app/api/tasks.py already uses for the other task
types, so a decision POST/PATCH response is never held up waiting on it.
The state_update broadcast and telemetry logging need no LLM call, so they
happen synchronously, before the response is returned.
"""
import logging
import uuid
from typing import Any, Dict, List, Optional

import anyio.from_thread
from fastapi import BackgroundTasks
from sqlalchemy.orm import Session as DBSession

from app.database import SessionLocal
from app.models.email_decision import EmailDecision
from app.models.enums import GenerationType
from app.models.interaction_metric import InteractionMetric
from app.models.manager_message import ManagerMessage
from app.models.session import Session as SessionModel
from app.models.task import Task
from app.orchestrators import aria_policy, simulation_fsm
from app.orchestrators.performance_tracker import get_extended_performance_metrics
from app.orchestrators.priority_evaluation import DecisionRecord, compute_simulation_state
from app.ai.manager_service import fallback_message, generate_manager_message
from app.ws.connection_manager import manager as ws_manager

logger = logging.getLogger(__name__)


def _decision_records(db: DBSession, task_id: uuid.UUID) -> List[DecisionRecord]:
    rows = db.query(EmailDecision).filter(EmailDecision.task_id == task_id).all()
    return [
        DecisionRecord(
            score=r.score,
            accuracy_level=r.accuracy_level,
            decision_time_ms=r.decision_time_ms,
            changed_decision=r.changed_decision,
            change_count=r.change_count,
            opened_at=r.opened_at,
            decided_at=r.decided_at,
            aria_supervision_level=r.aria_supervision_level.value if r.aria_supervision_level else None,
        )
        for r in rows
        if r.decided_at is not None  # only finalized decisions count toward state/results
    ]


def handle_email_event(
    db: DBSession,
    background_tasks: BackgroundTasks,
    session: SessionModel,
    task: Task,
    event_type: str,
    *,
    total_emails: int,
    elapsed_seconds: float,
    remaining_time_seconds: float,
    total_time_seconds: float,
    decision_time_ms: Optional[int] = None,
    reconsidered_this_email: bool = False,
    event_id: Optional[uuid.UUID] = None,
    telemetry_metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Returns the freshly-computed SimulationState dict (also usable
    directly as a route's response body)."""
    event_id = event_id or uuid.uuid4()

    decisions = _decision_records(db, task.id)
    aria_messages_received = db.query(InteractionMetric).filter(
        InteractionMetric.task_id == task.id, InteractionMetric.action_type == "aria_message_sent"
    ).count()

    state = compute_simulation_state(
        decisions=decisions,
        total_emails=total_emails,
        aria_messages_received=aria_messages_received,
        elapsed_seconds=elapsed_seconds,
        remaining_time_seconds=remaining_time_seconds,
    )

    # Telemetry (reusing InteractionMetric -- see plan's "Event/telemetry
    # architecture" reuse decision, no new generic Event table).
    metadata = dict(telemetry_metadata or {})
    metadata["event_id"] = str(event_id)
    db.add(
        InteractionMetric(
            session_id=session.id,
            task_id=task.id,
            action_type=event_type,
            response_time_seconds=(decision_time_ms / 1000) if decision_time_ms is not None else None,
            metadata_json=metadata,
        )
    )
    db.commit()

    # ── SimulationStateMachine: the deterministic phase/tone/pressure
    # decision, run BEFORE the trigger engine so it can word its message in
    # whatever tone the FSM (not the trigger itself) has decided ARIA is
    # currently speaking in.
    extended_metrics = get_extended_performance_metrics(db, session.id)
    if total_time_seconds:
        extended_metrics.remaining_time_ratio = max(0.0, min(1.0, remaining_time_seconds / total_time_seconds))
    previous_phase = session.current_phase
    fsm_result = simulation_fsm.evaluate_and_persist(db, session, extended_metrics)

    total_reconsiderations = sum(1 for d in decisions if d.changed_decision)
    facts = {
        "event_type": event_type,
        "decision_time_ms": decision_time_ms,
        "rolling_accuracy": state["exact_accuracy"],
        "processed_count": state["processed_count"],
        "total_count": total_emails,
        "reconsidered_this_email": reconsidered_this_email,
        "total_reconsiderations": total_reconsiderations,
        "remaining_time_seconds": remaining_time_seconds,
        "total_time_seconds": total_time_seconds,
        "consecutive_errors": extended_metrics.consecutive_errors,
        "idle_time_seconds": extended_metrics.idle_time_seconds,
        "phase_changed": previous_phase != fsm_result.phase,
        # Stress Declaration feature: same wiring as aria_pipeline.py's
        # generic pipeline, so a stress increase can surface a
        # STRESS_INCREASE trigger during an email-prioritization task too.
        "declared_stress": extended_metrics.declared_stress,
        "previous_declared_stress": extended_metrics.previous_declared_stress,
    }
    aria_decision = aria_policy.decide_aria_reaction(facts, fsm_result.manager_tone)

    if aria_decision is not None and aria_policy.should_emit(db, session.id, aria_decision):
        # section 32: "aria_analyzing" precedes the actual message so the
        # frontend can show a subtle "ARIA is analyzing..." state.
        _broadcast_sync_safe(session.id, {"type": "aria_analyzing", "session_id": str(session.id), "task_id": str(task.id)})
        # Reserved SYNCHRONOUSLY, with fallback-template content, the
        # instant emission is decided -- not after the background job's
        # OpenAI call finishes. This matters: aria_policy.should_emit's
        # cooldown check works by looking at the most recently PERSISTED
        # ManagerMessage. If persistence only happened in the background
        # job, several rapid-fire decisions (e.g. a user sorting emails
        # quickly) could all pass their cooldown check before any of them
        # had actually written a row -- each one blind to the others'
        # not-yet-persisted messages, defeating the cooldown entirely.
        # Reserving here closes that window; the background job below only
        # ever upgrades this same row's content, never inserts a second one.
        placeholder = fallback_message(aria_decision.tone, aria_decision.trigger, email_context=True)
        message = ManagerMessage(
            session_id=session.id,
            content=placeholder,
            tone=aria_decision.tone,
            trigger_context={
                "event_type": event_type,
                "trigger": aria_decision.trigger,
                "task_id": str(task.id),
                "event_id": str(event_id),
            },
            was_fallback=True,
            generation_type=GenerationType.FALLBACK,
        )
        db.add(message)
        db.add(
            InteractionMetric(
                session_id=session.id, task_id=task.id, action_type="aria_message_sent",
                metadata_json={"event_id": str(event_id), "trigger": aria_decision.trigger},
            )
        )
        db.commit()
        db.refresh(message)

        _broadcast_sync_safe(session.id, {
            "type": "aria_message", "id": str(message.id), "session_id": str(session.id), "task_id": str(task.id),
            "content": message.content, "tone": message.tone.value, "trigger": aria_decision.trigger,
            "sent_at": message.sent_at.isoformat(), "was_fallback": True, "event_id": str(event_id),
        })

        background_tasks.add_task(
            _upgrade_aria_message_job,
            message_id=message.id,
            session_id=session.id,
            task_id=task.id,
            event_type=event_type,
            tone=aria_decision.tone,
            trigger=aria_decision.trigger,
            extra_facts=facts,
            event_id=event_id,
            fsm_result=fsm_result,
        )

    _broadcast_sync_safe(session.id, {
        "type": "state_update", "session_id": str(session.id), "task_id": str(task.id), "event_id": str(event_id),
        "state": state,
        "simulation": {
            "phase": fsm_result.phase.value,
            "manager_state": fsm_result.manager_tone.value,
            "pressure_score": fsm_result.pressure_score,
            "communication_frequency_seconds": fsm_result.communication_frequency_seconds,
        },
    })

    return state


def _broadcast_sync_safe(session_id: uuid.UUID, payload: Dict[str, Any]) -> None:
    """The pipeline is called from plain (sync) FastAPI route handlers,
    which Starlette/anyio run in a worker thread with a thread-portal back
    to the event loop -- ConnectionManager.broadcast is async (WebSocket
    send is async), so anyio.from_thread.run is how this calls back into
    it without making every route handler async. Never allowed to raise:
    a broadcast failure (or running outside any request/portal context,
    e.g. a unit test or the seed script) must never break the caller.
    """
    try:
        anyio.from_thread.run(ws_manager.broadcast, session_id, payload)
    except Exception:
        logger.debug("Skipping WebSocket broadcast for session %s (no portal or send failed)", session_id)


async def _broadcast_async_safe(session_id: uuid.UUID, payload: Dict[str, Any]) -> None:
    """Same never-raise contract as _broadcast_sync_safe, for callers that
    already run ON the event loop (an async BackgroundTasks target) --
    those can await ConnectionManager.broadcast directly and must NOT go
    through anyio.from_thread.run (that requires a worker-thread portal,
    which doesn't exist here and would just fail every time)."""
    try:
        await ws_manager.broadcast(session_id, payload)
    except Exception:
        logger.debug("Skipping WebSocket broadcast for session %s (send failed)", session_id)


async def _upgrade_aria_message_job(
    message_id: uuid.UUID,
    session_id: uuid.UUID,
    task_id: uuid.UUID,
    event_type: str,
    tone,
    trigger: str,
    extra_facts: Dict[str, Any],
    event_id: uuid.UUID,
    fsm_result,
) -> None:
    """BackgroundTasks target -- own fresh DB session, since the request's
    session is closed by the time this runs (FastAPI awaits async
    BackgroundTasks targets after the response is sent). The row already
    exists (handle_email_event reserved it synchronously with fallback
    content) -- this only ever UPDATES that same row with a real
    LLM-generated message if OpenAI succeeds, never inserts a second row.
    If OpenAI isn't configured or fails, the already-broadcast fallback
    content simply stands; nothing to do.
    """
    db = SessionLocal()
    try:
        message = db.query(ManagerMessage).filter(ManagerMessage.id == message_id).first()
        session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if message is None or session is None:
            logger.warning("_upgrade_aria_message_job: message or session not found (%s / %s)", message_id, session_id)
            return
        task = db.query(Task).filter(Task.id == task_id).first()
        # Recomputed fresh in this new DB session -- used as prompt-context
        # flavor for the LLM call (recent session performance); the
        # tone/trigger themselves are already decided (passed in), this
        # never influences that.
        metrics = get_extended_performance_metrics(db, session_id)
        result = await generate_manager_message(
            db, event_type, session, metrics, task, tone=tone, trigger=trigger, extra_facts=extra_facts,
            email_context=True, fsm_result=fsm_result,
        )
        if result.was_fallback:
            return  # already broadcast the fallback text synchronously; nothing changed

        message.content = result.content
        message.was_fallback = False
        message.generation_type = GenerationType.LLM
        db.add(message)
        db.commit()

        await _broadcast_async_safe(session_id, {
            "type": "aria_message", "id": str(message.id), "session_id": str(session_id), "task_id": str(task_id),
            "content": message.content, "tone": message.tone.value, "trigger": trigger,
            "sent_at": message.sent_at.isoformat(), "was_fallback": False, "event_id": str(event_id),
        })
    except Exception:
        logger.exception("_upgrade_aria_message_job failed for event '%s'", event_type)
    finally:
        db.close()
