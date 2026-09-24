"""AriaTriggerEngine -- deterministic ARIA reaction policy (spec section
15), generalized from its original Task 02 (Email Prioritization)-only
form to cover the full system-wide trigger set.

Hard architectural rule (unchanged, now project-wide): the LLM never
decides whether behavior was slow/fast/accurate/hesitant, and never
chooses the supervision tone. This module is the ONLY place that decision
gets made, from structured facts alone -- app/ai/manager_service.py
(wrapping app/ai/openai_service.py) keeps doing exactly what it already
does: receive a pre-decided ManagerTone (now sourced from
app/orchestrators/simulation_fsm.py's FSM, not invented per-trigger here)
and generate wording for it. It's never handed raw behavioral facts to
interpret itself.

    user action -> facts -> SimulationStateMachine.evaluate() -> tone
                          -> decide_aria_reaction(facts, tone) -> (trigger, severity)
                                                                        |
                                                                        v
                                                  generate_manager_message(tone=...)
                                                            (wording only)
"""
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session as DBSession

from app.core.aria_config import (
    COMMUNICATION_FREQUENCY_SECONDS,
    SAME_TRIGGER_COOLDOWN_SECONDS,
)
from app.models.enums import ManagerTone
from app.models.manager_message import ManagerMessage

# Trigger-specific thresholds -- module-level constants so they're easy to
# find/tune, not scattered through conditionals. Frequency/cooldown
# durations themselves live in aria_config.py (tone-dependent, section 16).
FAST_DECISION_MS = 5_000
SLOW_DECISION_MS = 25_000
# NOT the same constant as app/reports/behavioral_evaluation.py's
# HIGH_ACCURACY_ABS_THRESHOLD = 80.0 (80 on a 0-100 scale, same 80%
# value here expressed as a 0-1 fraction). The two are independently
# defined and serve different purposes -- this one gates a live,
# in-session ARIA supervision TRIGGER (HIGH_ACCURACY, below); the other
# gates a report-time, post-session behavioral OBSERVATION
# (PAUSES_HIGH_ACCURACY). Their numeric overlap is coincidental
# round-number convergence, not an intentional shared reference.
HIGH_ACCURACY_THRESHOLD = 0.8
LOW_ACCURACY_THRESHOLD = 0.5
MIN_DECISIONS_FOR_ACCURACY_TRIGGER = 3
MULTIPLE_RECONSIDERATIONS_THRESHOLD = 2
LOW_REMAINING_TIME_SECONDS = 45
MULTIPLE_ERRORS_THRESHOLD = 2  # consecutive_errors
HIGH_IDLE_SECONDS = 90
# Stress Declaration feature: declared_stress is a 1-5 scale (Calm..
# Extreme), not the old 0-100 self-report this constant was originally
# tuned for -- rescaled accordingly. A jump of 2+ levels (e.g. 2 -> 4) is
# the threshold the spec's own worked example treats as meaningful.
STRESS_INCREASE_DELTA = 2  # levels, vs the previously declared value

CRITICAL_SEVERITY_BYPASS = 4  # severity >= this ignores the cooldown entirely


@dataclass
class AriaDecision:
    trigger: str
    tone: ManagerTone
    severity: int  # higher wins when multiple triggers fire in one pass


def decide_aria_reaction(facts: Dict[str, Any], manager_tone: ManagerTone) -> Optional[AriaDecision]:
    """facts is a plain dict of structured, already-computed behavioral
    signals -- never raw email/task content, never anything requiring
    judgment. `manager_tone` is the FSM's already-decided current tone
    (app/orchestrators/simulation_fsm.py) -- this function does not invent
    a tone per trigger, only decides WHICH observation fired and how
    urgently, wording that observation with whatever tone the FSM says
    ARIA is currently speaking in.

    Recognized facts keys (all optional, callers pass what's relevant):
    event_type, decision_time_ms, rolling_accuracy, processed_count,
    total_count, reconsidered_this_email, total_reconsiderations,
    remaining_time_seconds, total_time_seconds, consecutive_errors,
    idle_time_seconds, declared_stress, previous_declared_stress,
    phase_changed, new_phase.

    Evaluates every candidate trigger, returns the highest-severity match
    (higher-severity triggers preempt lower-severity informational ones),
    or None if nothing fires.
    """
    candidates: List[AriaDecision] = []
    event_type = facts.get("event_type")

    if event_type == "task_started":
        candidates.append(AriaDecision("TASK_STARTED", manager_tone, severity=1))

    if event_type == "task_completed":
        candidates.append(AriaDecision("TASK_COMPLETED", manager_tone, severity=5))

    if event_type == "new_task_required":
        candidates.append(AriaDecision("NEW_TASK_REQUIRED", manager_tone, severity=3))

    if facts.get("phase_changed"):
        candidates.append(AriaDecision("PHASE_TRANSITION", manager_tone, severity=4))

    remaining = facts.get("remaining_time_seconds")
    if remaining is not None and remaining <= LOW_REMAINING_TIME_SECONDS:
        candidates.append(AriaDecision("LOW_REMAINING_TIME", manager_tone, severity=4))

    if event_type == "decision_changed":
        total_reconsiderations = facts.get("total_reconsiderations", 0)
        if total_reconsiderations >= MULTIPLE_RECONSIDERATIONS_THRESHOLD:
            candidates.append(AriaDecision("MULTIPLE_RECONSIDERATIONS", manager_tone, severity=3))
        else:
            candidates.append(AriaDecision("RECONSIDERATION", manager_tone, severity=2))

    decision_time_ms = facts.get("decision_time_ms")
    if event_type in ("decision_submitted", "task_completed") and decision_time_ms is not None:
        if decision_time_ms < FAST_DECISION_MS:
            candidates.append(AriaDecision("FAST_DECISION", manager_tone, severity=1))
        elif decision_time_ms > SLOW_DECISION_MS:
            candidates.append(AriaDecision("SLOW_DECISION", manager_tone, severity=2))

    consecutive_errors = facts.get("consecutive_errors")
    if consecutive_errors is not None:
        if consecutive_errors >= MULTIPLE_ERRORS_THRESHOLD:
            candidates.append(AriaDecision("MULTIPLE_ERRORS", manager_tone, severity=3))
        elif consecutive_errors == 1:
            candidates.append(AriaDecision("ERROR_DETECTED", manager_tone, severity=1))

    processed = facts.get("processed_count", 0)
    accuracy = facts.get("rolling_accuracy")
    if accuracy is not None and processed >= MIN_DECISIONS_FOR_ACCURACY_TRIGGER:
        if accuracy >= HIGH_ACCURACY_THRESHOLD:
            candidates.append(AriaDecision("HIGH_ACCURACY", manager_tone, severity=1))
        elif accuracy < LOW_ACCURACY_THRESHOLD:
            candidates.append(AriaDecision("LOW_ACCURACY", manager_tone, severity=2))

    idle_seconds = facts.get("idle_time_seconds")
    if idle_seconds is not None and idle_seconds >= HIGH_IDLE_SECONDS:
        candidates.append(AriaDecision("HIGH_IDLE_TIME", manager_tone, severity=2))

    declared_stress = facts.get("declared_stress")
    previous_stress = facts.get("previous_declared_stress")
    if declared_stress is not None and previous_stress is not None and (declared_stress - previous_stress) >= STRESS_INCREASE_DELTA:
        candidates.append(AriaDecision("STRESS_INCREASE", manager_tone, severity=3))

    total_count = facts.get("total_count")
    total_time = facts.get("total_time_seconds")
    elapsed = None
    if remaining is not None and total_time is not None:
        elapsed = total_time - remaining
    if total_count and total_time and elapsed is not None and elapsed > 0 and processed > 0:
        expected_progress = elapsed / total_time
        actual_progress = processed / total_count
        if actual_progress < expected_progress - 0.25:
            candidates.append(AriaDecision("SLOW_PROGRESS", manager_tone, severity=2))

    if not candidates:
        return None
    return max(candidates, key=lambda c: c.severity)


def should_emit(db: DBSession, session_id: uuid.UUID, decision: AriaDecision, now: Optional[datetime] = None) -> bool:
    """Cooldown gate, checked against this session's own persisted
    ManagerMessage history (already has sent_at/trigger_context -- no new
    state table needed). Both the minimum gap and the same-trigger repeat
    window scale with the CURRENT tone (section 16: a more intrusive tone
    is allowed to speak more often) -- looked up from aria_config.py, not
    a flat constant.
    """
    if decision.severity >= CRITICAL_SEVERITY_BYPASS:
        return True

    now = now or datetime.utcnow()
    min_gap = COMMUNICATION_FREQUENCY_SECONDS[decision.tone]
    same_trigger_cooldown = SAME_TRIGGER_COOLDOWN_SECONDS[decision.tone]

    recent = (
        db.query(ManagerMessage)
        .filter(ManagerMessage.session_id == session_id)
        .order_by(ManagerMessage.sent_at.desc())
        .limit(10)
        .all()
    )
    if not recent:
        return True

    if (now - recent[0].sent_at).total_seconds() < min_gap:
        return False

    for msg in recent:
        trigger = (msg.trigger_context or {}).get("trigger")
        if trigger == decision.trigger and (now - msg.sent_at).total_seconds() < same_trigger_cooldown:
            return False

    return True
