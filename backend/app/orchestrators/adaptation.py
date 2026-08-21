"""Pure functions that turn a PerformanceSnapshot into adaptation decisions.

No DB access anywhere in this module — everything here is a plain
data-in/data-out rule cascade, independently unit-testable. Cooldown state
(if any) and DB queries live in TaskEngine, which calls into this module.
"""
from typing import List, Tuple

from app.models.enums import Priority, SessionPhase, TaskDifficulty
from app.orchestrators.performance_tracker import PerformanceSnapshot

DEFAULT_DIFFICULTY_BY_PHASE = {
    SessionPhase.accueil: [TaskDifficulty.easy],
    SessionPhase.montee_pression: [TaskDifficulty.easy, TaskDifficulty.medium],
    SessionPhase.pic_charge: [TaskDifficulty.medium, TaskDifficulty.hard],
}


def resolve_difficulty_pool(snapshot: PerformanceSnapshot, phase: SessionPhase) -> List[TaskDifficulty]:
    """First-match-wins rule cascade. declared_stress is None whenever a
    session hasn't posted a stress declaration yet — rule 1 falls through
    cleanly in that case rather than erroring on the None comparison.
    """
    # Rule 1: mercy rule — overrides everything else.
    if snapshot.declared_stress is not None and snapshot.declared_stress > 80 and snapshot.avg_score < 40:
        return [TaskDifficulty.easy]

    # Rule 2: pull back after a run of errors.
    if snapshot.consecutive_errors >= 3:
        return [TaskDifficulty.easy, TaskDifficulty.medium]

    # Rule 3: push toward harder content after strong performance.
    if snapshot.avg_score > 90:
        if phase == SessionPhase.accueil:
            return [TaskDifficulty.easy, TaskDifficulty.medium]
        return [TaskDifficulty.medium, TaskDifficulty.hard]

    # Rule 4: phase default. SessionPhase.debriefing isn't in the spec'd
    # table (only accueil/montee_pression/pic_charge were given) — falls
    # back to [easy] rather than raising, since debriefing isn't expected
    # to generate new tasks anyway.
    return DEFAULT_DIFFICULTY_BY_PHASE.get(phase, [TaskDifficulty.easy])


# Deliberately separate from PRIORITY-related state above — this table and
# the two functions below share no state with resolve_difficulty_pool and
# never call it, per the independence requirement.
_PRIORITY_ORDER = [Priority.low, Priority.medium, Priority.high, Priority.urgent]


def _bump_priority(priority: Priority) -> Priority:
    idx = _PRIORITY_ORDER.index(priority)
    return _PRIORITY_ORDER[min(idx + 1, len(_PRIORITY_ORDER) - 1)]


def _drop_priority(priority: Priority) -> Priority:
    idx = _PRIORITY_ORDER.index(priority)
    return _PRIORITY_ORDER[max(idx - 1, 0)]


def adjust_priority_and_deadline(
    default_priority: Priority, base_deadline_seconds: int, snapshot: PerformanceSnapshot
) -> Tuple[Priority, int]:
    """Pure function, fully independent of resolve_difficulty_pool.

    base_deadline_seconds is the template's estimated_duration — the number
    that becomes Task.deadline_seconds before any adjustment.

    If both conditions are true at once (plausible real pattern: someone
    fast and mostly excellent who just hit a rough patch — great overall
    average, but 3 errors in a row), the errors-rule wins. This is a
    deliberate UX choice, not a copy of Step 1's ordering: tightening
    someone's deadline and raising their priority *while they're mid
    error-streak* is the wrong instinct even if their average is still
    high. Protection takes precedence over reward here.
      - consecutive_errors >= 3: looser deadline (*1.3), priority dropped
        one level (floored at low)
      - avg_score > 90: tighter deadline (*0.7), priority bumped up one
        level (capped at urgent)
      - otherwise: unchanged
    """
    if snapshot.consecutive_errors >= 3:
        return _drop_priority(default_priority), round(base_deadline_seconds * 1.3)

    if snapshot.avg_score > 90:
        return _bump_priority(default_priority), round(base_deadline_seconds * 0.7)

    return default_priority, base_deadline_seconds
