"""ARIA's message generation: a short OpenAI call with a persona/tone
prompt, falling back to hardcoded templates on ANY failure.

This must never raise and must never meaningfully block task generation --
it's a demo-facing flourish layered on top of the adaptive engine, not a
dependency of it. A missing/invalid key, a timeout, a rate limit, a
malformed response: all of them fall through to the same safe path.
"""
import logging
import random
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session as DBSession

from app.ai import openai_service, prompt_builder
from app.ai.openai_service import OpenAIServiceError
from app.core.aria_config import ARIA_PROMPT_VERSION
from app.core.config import OPENAI_API_KEY
from app.models.enums import ManagerTone
from app.models.session import Session as SessionModel
from app.models.task import Task
from app.orchestrators.performance_tracker import ExtendedPerformanceMetrics
from app.orchestrators.simulation_fsm import FSMResult

logger = logging.getLogger(__name__)


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
def _resolve_tone(event_type: str, metrics: ExtendedPerformanceMetrics) -> ManagerTone:
    if event_type == "mercy_rule_activated":
        return ManagerTone.bienveillant
    if event_type == "difficulty_changed":
        # Same precedence as resolve_difficulty_pool's rule ordering:
        # consecutive_errors is checked first and wins on conflict.
        if metrics.consecutive_errors >= 3:
            return ManagerTone.intrusif
        if metrics.avg_score > 90:
            return ManagerTone.exigeant
    return ManagerTone.neutre


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


# Task 02 (Email Prioritization) trigger-specific fallback wording,
# matching the spec's own example lines more closely than the generic
# per-tone messages above. Checked first; falls back to the generic
# FALLBACK_MESSAGES[tone] list for any trigger not listed here. Still just
# wording -- the tone/trigger themselves are always decided by
# app/orchestrators/aria_policy.py before this module ever runs.
EMAIL_TRIGGER_FALLBACK_MESSAGES: dict = {
    "TASK_STARTED": [
        "Your session has just started. Analyze each email with the current operational context in mind.",
    ],
    "FAST_DECISION": [
        "Your decision pace is fast. Make sure the priority actually matches the context.",
    ],
    "SLOW_DECISION": [
        "Your decision time is increasing. Keep up the pace.",
    ],
    "RECONSIDERATION": [
        "You changed your decision. This hesitation has been recorded.",
    ],
    "MULTIPLE_RECONSIDERATIONS": [
        "Several decisions have been re-evaluated. Your average decision time is increasing.",
    ],
    "LOW_REMAINING_TIME": [
        "Remaining time is limited. Several emails still need to be prioritized.",
    ],
    "SLOW_OVERALL_PROGRESS": [
        "Your current pace is below the expected target.",
    ],
    "HIGH_ACCURACY": [
        "Your accuracy is high. Keep up this pace.",
    ],
    "LOW_ACCURACY": [
        "Several recent priorities don't match the expected context. Double-check your decisions.",
    ],
    "TASK_COMPLETED": [
        "Task completed. I'm now analyzing your decisions and processing pace.",
    ],
}


def fallback_message(tone: ManagerTone, trigger: Optional[str] = None, email_context: bool = False) -> str:
    """Public: both event pipelines (email_event_pipeline.py and the
    generalized aria_pipeline.py) use this directly to synchronously
    reserve a ManagerMessage row's placeholder content -- the cooldown
    check needs a real persisted row the instant a message is decided on,
    not after the OpenAI call in the background job finishes.

    `email_context` gates EMAIL_TRIGGER_FALLBACK_MESSAGES specifically --
    aria_policy.py's generalized trigger engine now emits the SAME trigger
    names (TASK_STARTED, TASK_COMPLETED, ...) for every task family, not
    just email prioritization, so a trigger-name-only lookup would leak
    email-specific wording ("Analyze each email...") onto
    data_validation/image_matching/document_organization tasks. Only
    email_event_pipeline.py passes email_context=True.
    """
    if email_context and trigger and trigger in EMAIL_TRIGGER_FALLBACK_MESSAGES:
        return random.choice(EMAIL_TRIGGER_FALLBACK_MESSAGES[trigger])
    return random.choice(FALLBACK_MESSAGES[tone])


async def generate_manager_message(
    db: DBSession,
    event_type: str,
    session: SessionModel,
    metrics: ExtendedPerformanceMetrics,
    task: Optional[Task] = None,
    tone: Optional[ManagerTone] = None,
    trigger: Optional[str] = None,
    extra_facts: Optional[dict] = None,
    email_context: bool = False,
    fsm_result: Optional[FSMResult] = None,
) -> ManagerMessageResult:
    """`tone`/`trigger` are optional overrides: when the caller has already
    decided them deterministically (aria_policy.decide_aria_reaction), pass
    them in and this function skips _resolve_tone entirely -- the LLM (or
    the fallback template) is only ever asked to phrase an already-made
    decision, never to make one. `fsm_result` is required to build the full
    structured prompt (app/ai/prompt_builder.py); both callers
    (email_event_pipeline.py, aria_pipeline.py) always have one on hand
    since they just ran simulation_fsm.evaluate_and_persist().
    `email_context` is forwarded to fallback_message -- see its docstring.

    Async because app/ai/openai_service.py uses AsyncOpenAI -- this must be
    awaited by callers, which run inside FastAPI BackgroundTasks (which
    awaits async targets natively).
    """
    resolved_tone = tone if tone is not None else _resolve_tone(event_type, metrics)

    if not OPENAI_API_KEY or fsm_result is None:
        return ManagerMessageResult(
            content=fallback_message(resolved_tone, trigger, email_context=email_context),
            tone=resolved_tone, was_fallback=True,
        )

    try:
        context = prompt_builder.build_context(
            db, session, fsm_result, metrics, event_type, extra_facts or {},
            task=task, trigger=trigger, prompt_version=ARIA_PROMPT_VERSION,
        )
        content = await openai_service.generate_manager_message(
            prompt_builder.build_system_prompt(context), prompt_builder.build_user_prompt(context)
        )
        return ManagerMessageResult(content=content, tone=resolved_tone, was_fallback=False)
    except OpenAIServiceError as exc:
        # Every failure mode (missing key already handled above, timeout,
        # rate limit, connection error, malformed/invalid JSON) collapses
        # to this one path. Logged, not silently swallowed, so failures are
        # still visible server-side.
        logger.warning("ARIA message generation failed for event '%s': %s", event_type, exc)
        return ManagerMessageResult(
            content=fallback_message(resolved_tone, trigger, email_context=email_context),
            tone=resolved_tone, was_fallback=True,
        )
