"""ARIA's message generation: a short OpenAI call with a persona/tone
prompt, falling back to hardcoded templates on ANY failure.

This must never raise and must never meaningfully block task generation --
it's a demo-facing flourish layered on top of the adaptive engine, not a
dependency of it. A missing/invalid key, a timeout, a rate limit, a
malformed response: all of them fall through to the same safe path.
"""
import logging
import random
import uuid
from dataclasses import dataclass
from typing import Optional

from openai import OpenAI
from sqlalchemy.orm import Session as DBSession

from app.core.config import OPENAI_API_KEY
from app.database import SessionLocal
from app.models.enums import ManagerTone
from app.models.manager_message import ManagerMessage
from app.models.session import Session as SessionModel
from app.models.task import Task
from app.orchestrators.performance_tracker import PerformanceSnapshot

logger = logging.getLogger(__name__)

MODEL = "gpt-4o-mini"
REQUEST_TIMEOUT_SECONDS = 5.0
MAX_RESPONSE_TOKENS = 80


@dataclass
class ManagerMessageResult:
    content: str
    tone: ManagerTone
    was_fallback: bool


# Tone per trigger -- decided explicitly per scenario, not defaulted.
# new_task_assigned -> neutre: routine assignment, no signal either way.
# difficulty escalation (avg_score > 90) -> exigeant: raising the bar.
# difficulty de-escalation (consecutive_errors >= 3) -> intrusif: tightened
#   oversight/check-ins because trust dipped, not "demanding more" -- that
#   would contradict just having reduced the difficulty.
# mercy_rule_activated -> bienveillant: the one clear "ease up" case.
def _resolve_tone(event_type: str, snapshot: PerformanceSnapshot) -> ManagerTone:
    if event_type == "mercy_rule_activated":
        return ManagerTone.bienveillant
    if event_type == "difficulty_changed":
        # Same precedence as resolve_difficulty_pool's rule ordering:
        # consecutive_errors is checked first and wins on conflict.
        if snapshot.consecutive_errors >= 3:
            return ManagerTone.intrusif
        if snapshot.avg_score > 90:
            return ManagerTone.exigeant
    return ManagerTone.neutre


TONE_DESCRIPTIONS = {
    ManagerTone.neutre: "professional and matter-of-fact",
    ManagerTone.exigeant: "impressed but demanding -- raise expectations, push for more",
    ManagerTone.intrusif: (
        "tightening oversight -- checking in more closely, slightly hovering, "
        "because recent performance has dipped"
    ),
    ManagerTone.bienveillant: "warm and supportive -- easing pressure, showing care for wellbeing",
}

# 2-3 hardcoded fallback templates per tone bucket. Content differs by
# bucket on purpose -- an escalation fallback and a de-escalation fallback
# describe opposite situations, so they can't share generic text.
FALLBACK_MESSAGES = {
    ManagerTone.neutre: [
        "A new task has been assigned. Review the details and get started when ready.",
        "Your next task is ready. Take a look and begin whenever you're set.",
        "Task assigned. Let me know if anything is unclear.",
    ],
    ManagerTone.exigeant: [
        "Strong results so far -- I'm raising the bar. Let's see you handle something more demanding.",
        "You're performing well above expectations. Time to step it up.",
        "Impressive pace. I'm increasing the difficulty -- keep this level of focus.",
    ],
    ManagerTone.intrusif: [
        "I've noticed a few recent errors, so I'll be checking in more closely and easing the workload for now.",
        "Given the recent mistakes, I'm scaling things back and keeping a closer eye on your progress.",
        "A few things have slipped recently -- I'm simplifying the next tasks and will be monitoring more closely.",
    ],
    ManagerTone.bienveillant: [
        "I can see this has been a tough stretch. Take a breath -- I've scaled things back to something more manageable.",
        "It looks like the pressure has been a lot. Let's ease off for a bit; the next task will be lighter.",
        "Your wellbeing matters more than pace right now. I've simplified things -- take the time you need.",
    ],
}


def _fallback_message(tone: ManagerTone) -> str:
    return random.choice(FALLBACK_MESSAGES[tone])


def _build_system_prompt(tone: ManagerTone) -> str:
    return (
        "You are ARIA, an AI manager overseeing an employee's workday inside a workplace "
        "stress simulation. Write ONE short message (1-2 sentences, under 40 words) reacting "
        f"to what just happened. Tone for this message: {TONE_DESCRIPTIONS[tone]}. "
        "Stay in character as a workplace manager, not a chatbot assistant. No greetings, "
        "no sign-offs, no markdown, no quotation marks around the message."
    )


def _build_user_prompt(
    event_type: str, session: SessionModel, snapshot: PerformanceSnapshot, task: Optional[Task]
) -> str:
    lines = [
        f"Event: {event_type}",
        f"Session phase: {session.current_phase.value}",
        f"Average score (recent window): {snapshot.avg_score}",
        f"Consecutive errors: {snapshot.consecutive_errors}",
        f"Tasks completed this session: {snapshot.tasks_completed_in_session}",
    ]
    if snapshot.declared_stress is not None:
        lines.append(f"Declared stress: {snapshot.declared_stress}/100")
    if task is not None:
        difficulty = task.difficulty.value if task.difficulty else "n/a"
        lines.append(f"Task: \"{task.title}\" (difficulty={difficulty}, priority={task.priority.value})")
    return "\n".join(lines)


def generate_manager_message(
    event_type: str,
    session: SessionModel,
    snapshot: PerformanceSnapshot,
    task: Optional[Task] = None,
) -> ManagerMessageResult:
    tone = _resolve_tone(event_type, snapshot)

    if not OPENAI_API_KEY:
        return ManagerMessageResult(content=_fallback_message(tone), tone=tone, was_fallback=True)

    try:
        client = OpenAI(api_key=OPENAI_API_KEY, timeout=REQUEST_TIMEOUT_SECONDS, max_retries=0)
        response = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": _build_system_prompt(tone)},
                {"role": "user", "content": _build_user_prompt(event_type, session, snapshot, task)},
            ],
            max_tokens=MAX_RESPONSE_TOKENS,
        )
        content = (response.choices[0].message.content or "").strip()
        if not content:
            raise ValueError("empty response from model")
        return ManagerMessageResult(content=content, tone=tone, was_fallback=False)
    except Exception as exc:
        # Intentionally broad: auth errors, timeouts, rate limits, network
        # errors, and malformed responses must ALL fall through to the same
        # safe path. Logged, not silently swallowed, so failures are still
        # visible server-side.
        logger.warning("ARIA message generation failed for event '%s': %s", event_type, exc)
        return ManagerMessageResult(content=_fallback_message(tone), tone=tone, was_fallback=True)


def record_manager_message(
    db: DBSession,
    event_type: str,
    session: SessionModel,
    snapshot: PerformanceSnapshot,
    task: Optional[Task] = None,
) -> ManagerMessage:
    """Generate (or fall back) and persist one ManagerMessage row.

    Thin DB-aware wrapper around generate_manager_message, same split as
    resolve_difficulty_pool (pure) vs resolve_difficulty_pool_with_cooldown
    (DB-aware) in task_engine.py.
    """
    result = generate_manager_message(event_type, session, snapshot, task)

    trigger_context = {
        "event_type": event_type,
        "avg_score": snapshot.avg_score,
        "consecutive_errors": snapshot.consecutive_errors,
        "declared_stress": snapshot.declared_stress,
    }
    if task is not None:
        trigger_context["task_id"] = str(task.id)

    message = ManagerMessage(
        session_id=session.id,
        content=result.content,
        tone=result.tone,
        trigger_context=trigger_context,
        was_fallback=result.was_fallback,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def record_manager_message_job(
    session_id: uuid.UUID,
    event_type: str,
    snapshot: PerformanceSnapshot,
    task_id: Optional[uuid.UUID] = None,
) -> None:
    """Background-task entry point (FastAPI BackgroundTasks target).

    Runs after the HTTP response has already been sent, so it can't reuse
    the request's db session (closed by then) or ORM objects from that
    session (detached). Opens its own fresh session, re-fetches Session/
    Task by id, and delegates to record_manager_message. PerformanceSnapshot
    is a plain dataclass, safe to pass across that boundary directly.

    Swallows its own exceptions (logged) -- by the time this runs the
    response is already gone, so there's nothing to fail loudly to.
    """
    db = SessionLocal()
    try:
        session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if session is None:
            logger.warning("record_manager_message_job: session '%s' not found", session_id)
            return
        task = db.query(Task).filter(Task.id == task_id).first() if task_id is not None else None
        record_manager_message(db, event_type, session, snapshot, task)
    except Exception:
        logger.exception("record_manager_message_job failed for event '%s'", event_type)
    finally:
        db.close()
