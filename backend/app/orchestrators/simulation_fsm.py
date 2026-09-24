"""SimulationStateMachine -- the deterministic core of the ARIA v2 adaptive
manager (spec sections 4-9). Pure decision logic; DB reads/writes for
persisting the result live in evaluate_and_persist() at the bottom, same
split as task_engine.py's pure resolve_difficulty_pool vs its DB-aware
resolve_difficulty_pool_with_cooldown wrapper.

Owns exactly what the spec assigns to the FSM and nothing else:
    - simulation phase (WELCOME/PRESSURE_RAMP/PEAK_LOAD/DEBRIEFING --
      reusing the existing SessionPhase enum, not a new parallel one)
    - manager communication state (SUPPORTIVE/NEUTRAL/DEMANDING/INTRUSIVE
      -- reusing the existing ManagerTone enum)
    - the pressure score those states are derived from
    - communication frequency for the current state
    - valid phase/state combinations (a phase-appropriate tone floor)

The LLM never sees any of this decision-making -- it only ever receives
the already-decided (phase, tone, pressure_score) as facts to phrase.
"""
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session as DBSession

from app.core.aria_config import (
    COMMUNICATION_FREQUENCY_SECONDS,
    CONSECUTIVE_OBSERVATIONS_TO_DECREASE,
    CONSECUTIVE_OBSERVATIONS_TO_INCREASE,
    DEFAULT_TONE_BY_PHASE,
    PEAK_LOAD_PRESSURE_THRESHOLD,
    PEAK_LOAD_REMAINING_TIME_RATIO,
    PRESSURE_HISTORY_WINDOW,
    PRESSURE_WEIGHTS,
    TONE_BANDS,
    WELCOME_MIN_SECONDS,
    WELCOME_MIN_TASKS,
)
from app.models.enums import ManagerTone, SessionPhase
from app.models.session import Session as SessionModel
from app.orchestrators.performance_tracker import ExtendedPerformanceMetrics

# Valid combinations only -- the FSM never emits a tone below the floor its
# current phase implies (section 5's explicit "do not allow arbitrary
# combinations"), even if the raw pressure score would otherwise put it
# lower. It CAN go above the floor (e.g. DEMANDING during PRESSURE_RAMP is
# explicitly allowed by the spec's own example table).
_PHASE_TONE_FLOOR = {
    SessionPhase.accueil: ManagerTone.bienveillant,
    SessionPhase.montee_pression: ManagerTone.neutre,
    SessionPhase.pic_charge: ManagerTone.exigeant,
    SessionPhase.debriefing: ManagerTone.bienveillant,
}
_TONE_ORDER = {ManagerTone.bienveillant: 0, ManagerTone.neutre: 1, ManagerTone.exigeant: 2, ManagerTone.intrusif: 3}
_ORDER_TONE = {v: k for k, v in _TONE_ORDER.items()}


@dataclass
class FSMResult:
    phase: SessionPhase
    phase_changed: bool
    manager_tone: ManagerTone
    tone_changed: bool
    pressure_score: float
    communication_frequency_seconds: int


def calculate_pressure_score(metrics: ExtendedPerformanceMetrics) -> float:
    """0-100. Same weight-normalization convention as priority_evaluation.
    calculate_weighted_score (Task 02) -- weights need not sum to 1, only
    their ratios matter.

    Each raw signal is mapped to its own 0-100 sub-score BEFORE weighting,
    documented per-component so the number stays explainable end to end,
    matching this project's existing fatigue.py convention.
    """
    error_component = metrics.error_rate * 100

    # Response-time deviation: recent vs lifetime average, as a percentage
    # slowdown, capped at 100 (matches fatigue.py's slowdown_score cap).
    rt_component = 0.0
    if metrics.average_response_time and metrics.recent_response_time and metrics.average_response_time > 0:
        deviation = (metrics.recent_response_time - metrics.average_response_time) / metrics.average_response_time * 100
        rt_component = max(0.0, min(100.0, deviation))

    # Inactivity: idle seconds relative to a 2-minute reference window --
    # more than 2 minutes idle since the last event maxes this component.
    inactivity_component = max(0.0, min(100.0, (metrics.idle_time_seconds / 120) * 100))

    remaining_component = 0.0
    if metrics.remaining_time_ratio is not None:
        remaining_component = max(0.0, min(100.0, (1 - metrics.remaining_time_ratio) * 100))

    reconsideration_component = metrics.reconsideration_rate * 100

    weights = PRESSURE_WEIGHTS
    total_weight = sum(weights.values())
    raw = (
        error_component * weights["error_rate"]
        + rt_component * weights["response_time_deviation"]
        + inactivity_component * weights["inactivity"]
        + remaining_component * weights["remaining_time"]
        + reconsideration_component * weights["reconsiderations"]
    )
    return round(max(0.0, min(100.0, raw / total_weight)), 1)


def _tone_for_score(score: float) -> ManagerTone:
    for low, high, tone in TONE_BANDS:
        if low <= score < high:
            return tone
    return TONE_BANDS[-1][2]


def _apply_hysteresis(
    target_tone: ManagerTone, previous_tone: Optional[ManagerTone], history: List[Dict[str, Any]]
) -> ManagerTone:
    """Section 9: increasing pressure needs fewer consecutive agreeing
    observations than decreasing it does -- realistic escalation, not
    oscillation. `history` is the rolling window of recent target-tone
    votes (already includes the current one, appended by the caller before
    this runs), oldest first.
    """
    if previous_tone is None:
        return target_tone

    target_rank = _TONE_ORDER[target_tone]
    previous_rank = _TONE_ORDER[previous_tone]
    if target_rank == previous_rank:
        return previous_tone

    required = CONSECUTIVE_OBSERVATIONS_TO_INCREASE if target_rank > previous_rank else CONSECUTIVE_OBSERVATIONS_TO_DECREASE
    recent_votes = [ManagerTone(v["tone"]) for v in history[-required:]]
    if len(recent_votes) < required:
        return previous_tone
    if all(_TONE_ORDER[v] == target_rank for v in recent_votes):
        return target_tone
    return previous_tone


def _next_phase(
    current_phase: SessionPhase,
    pressure_score: float,
    tasks_completed: int,
    elapsed_seconds: float,
    remaining_time_ratio: Optional[float],
) -> SessionPhase:
    """Deterministic, one-directional (never regresses a phase once
    advanced, mirroring the spec's own linear WELCOME -> ... -> DEBRIEFING
    diagram). DEBRIEFING is only ever entered by the existing /end
    endpoint (session.status -> completed) -- this function never returns
    it, matching how current_phase already works today (see sessions.py's
    end_session, unmodified by this feature).
    """
    if current_phase == SessionPhase.debriefing:
        return current_phase

    if current_phase == SessionPhase.accueil:
        if elapsed_seconds >= WELCOME_MIN_SECONDS or tasks_completed >= WELCOME_MIN_TASKS:
            return SessionPhase.montee_pression
        return current_phase

    if current_phase == SessionPhase.montee_pression:
        crossed_pressure = pressure_score >= PEAK_LOAD_PRESSURE_THRESHOLD
        crossed_time = remaining_time_ratio is not None and remaining_time_ratio <= PEAK_LOAD_REMAINING_TIME_RATIO
        if crossed_pressure or crossed_time:
            return SessionPhase.pic_charge
        return current_phase

    return current_phase  # pic_charge stays until /end moves to debriefing


def evaluate(
    current_phase: SessionPhase,
    previous_tone: Optional[ManagerTone],
    pressure_history: Optional[List[Dict[str, Any]]],
    metrics: ExtendedPerformanceMetrics,
    tasks_completed: int,
    elapsed_seconds: float,
    now: Optional[datetime] = None,
) -> tuple:
    """Pure function: (FSMResult, new_pressure_history). No DB access --
    fully unit-testable (see test_simulation_fsm.py).
    """
    now = now or datetime.utcnow()
    history = list(pressure_history or [])

    pressure_score = calculate_pressure_score(metrics)
    raw_target = _tone_for_score(pressure_score)

    history.append({"tone": raw_target.value, "at": now.isoformat(), "score": pressure_score})
    history = history[-PRESSURE_HISTORY_WINDOW:]

    hysteresis_tone = _apply_hysteresis(raw_target, previous_tone, history)

    next_phase = _next_phase(
        current_phase, pressure_score, tasks_completed, elapsed_seconds, metrics.remaining_time_ratio
    )
    phase_changed = next_phase != current_phase

    # Phase floor (section 5): never let the hysteresis-smoothed tone sit
    # below what the CURRENT (possibly just-advanced) phase requires.
    floor = _PHASE_TONE_FLOOR[next_phase]
    final_tone = hysteresis_tone if _TONE_ORDER[hysteresis_tone] >= _TONE_ORDER[floor] else floor
    if phase_changed and previous_tone is None:
        final_tone = DEFAULT_TONE_BY_PHASE[next_phase]

    tone_changed = final_tone != previous_tone

    result = FSMResult(
        phase=next_phase,
        phase_changed=phase_changed,
        manager_tone=final_tone,
        tone_changed=tone_changed,
        pressure_score=pressure_score,
        communication_frequency_seconds=COMMUNICATION_FREQUENCY_SECONDS[final_tone],
    )
    return result, history


def evaluate_and_persist(db: DBSession, session: SessionModel, metrics: ExtendedPerformanceMetrics) -> FSMResult:
    """DB-aware wrapper: reads Session.current_phase/current_manager_tone/
    pressure_history, calls the pure evaluate() above, writes the result
    back. Same pure/DB-aware split as task_engine.py's difficulty-pool
    functions.
    """
    elapsed_seconds = max(0.0, (datetime.utcnow() - session.started_at).total_seconds())
    result, new_history = evaluate(
        current_phase=session.current_phase,
        previous_tone=session.current_manager_tone,
        pressure_history=session.pressure_history,
        metrics=metrics,
        tasks_completed=metrics.tasks_completed_in_session,
        elapsed_seconds=elapsed_seconds,
    )

    if result.phase_changed:
        session.current_phase = result.phase
    if result.tone_changed:
        session.current_manager_tone = result.manager_tone
    session.pressure_history = new_history
    db.add(session)
    db.commit()

    return result
