"""Deterministic Context-Aware Priority Evaluation Engine (Task 02).

The source of truth for "was this decision appropriate" is Scenario +
Operational Context + Email attributes + configured Rules + configured
Weights -- never an LLM. Every function here is pure (no DB access, no
randomness, no wall-clock reads) so the same inputs always produce the
same outputs, and so it's fully unit-testable without a database (see
backend/tests/test_priority_evaluation.py).

ARIA's own tone-selection logic lives in app/orchestrators/aria_policy.py,
not here -- this module only ever answers "was the decision correct and
by how much", never "how should the supervisor react".
"""
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from app.models.enums import AccuracyLevel, PriorityLevel

# Internal ordinal mapping -- the single source of truth for decision
# "distance" (section 3/8). Never duplicated elsewhere.
PRIORITY_ORDER: Dict[PriorityLevel, int] = {
    PriorityLevel.LOW: 0,
    PriorityLevel.NORMAL: 1,
    PriorityLevel.HIGH: 2,
    PriorityLevel.CRITICAL: 3,
}
ORDER_TO_PRIORITY = {v: k for k, v in PRIORITY_ORDER.items()}

DISTANCE_TO_SCORE = {0: 1.00, 1: 0.75, 2: 0.40, 3: 0.00}
DISTANCE_TO_ACCURACY = {
    0: AccuracyLevel.EXACT,
    1: AccuracyLevel.CLOSE,
    2: AccuracyLevel.MISPRIORITIZED,
    3: AccuracyLevel.SEVERELY_MISPRIORITIZED,
}

WEIGHT_FACTORS = ("urgency", "business_impact", "operational_relevance", "deadline_pressure", "security_risk")

# Score bands (section 7) -- only used when no rule overrides the score.
_BANDS: List[Tuple[int, int, PriorityLevel]] = [
    (0, 24, PriorityLevel.LOW),
    (25, 49, PriorityLevel.NORMAL),
    (50, 74, PriorityLevel.HIGH),
    (75, 100, PriorityLevel.CRITICAL),
]


# ── Email-like input shape ───────────────────────────────────────────────
# A plain dataclass rather than binding to the ORM model, so unit tests can
# construct one without a database.
@dataclass
class EmailFactors:
    urgency: int
    business_impact: int
    operational_relevance: int
    deadline_pressure: int
    security_risk: int
    context_tags: List[str] = field(default_factory=list)


@dataclass
class EvaluationResult:
    priority_score: float
    expected_priority: PriorityLevel
    triggered_rules: List[str]
    evaluation_rationale: str
    priority_boundary_proximity: float


# ── Weighted score (section 5) ───────────────────────────────────────────
def calculate_weighted_score(email: EmailFactors, weights: Dict[str, float]) -> float:
    """Weight-scale-agnostic: only the *relative* weights matter, so scenario
    authors don't have to make them sum to 1. raw = sum(factor * weight);
    normalized against the maximum possible raw value (5 * sum(weights)).
    """
    total_weight = sum(weights.get(f, 0.0) for f in WEIGHT_FACTORS)
    if total_weight <= 0:
        return 0.0
    raw = sum(getattr(email, f) * weights.get(f, 0.0) for f in WEIGHT_FACTORS)
    return max(0.0, min(100.0, (raw / (5 * total_weight)) * 100))


# ── Contextual override rules (section 6) ────────────────────────────────
def build_facts(email: EmailFactors, scenario_context_attributes: Dict[str, Any]) -> Dict[str, Any]:
    """One merged per-email facts dict a rule can reference uniformly,
    whether the condition is a scenario-wide fact or one of this email's own
    tags/factors."""
    facts: Dict[str, Any] = dict(scenario_context_attributes)
    facts.update({tag: True for tag in email.context_tags})
    for f in WEIGHT_FACTORS:
        facts[f] = getattr(email, f)
    return facts


_OPS = {
    "eq": lambda a, b: a == b,
    "gte": lambda a, b: a is not None and a >= b,
    "lte": lambda a, b: a is not None and a <= b,
    "gt": lambda a, b: a is not None and a > b,
    "lt": lambda a, b: a is not None and a < b,
}


def _eval_condition(node: Dict[str, Any], facts: Dict[str, Any]) -> bool:
    if "all" in node:
        return all(_eval_condition(child, facts) for child in node["all"])
    if "any" in node:
        return any(_eval_condition(child, facts) for child in node["any"])
    op = _OPS[node["op"]]
    return op(facts.get(node["field"]), node["value"])


def evaluate_rules(
    email: EmailFactors, scenario_rules: List[Dict[str, Any]], scenario_context_attributes: Dict[str, Any]
) -> Tuple[Optional[PriorityLevel], List[str]]:
    """Returns (highest-severity matched priority or None, ids of ALL rules
    that matched). Data-driven: this is a strategy-pattern evaluator over
    scenario-configured rule dicts, never a hardcoded if/else chain -- new
    rules are added by editing scenario JSON, not this function.
    """
    facts = build_facts(email, scenario_context_attributes)
    matched: List[Tuple[PriorityLevel, str]] = []
    for rule in scenario_rules:
        if _eval_condition(rule["when"], facts):
            matched.append((PriorityLevel(rule["then"]), rule["id"]))
    if not matched:
        return None, []
    # Multiple matches: the most severe override wins (a deterministic,
    # order-independent tie-break) -- but every matched rule id is still
    # reported for transparency.
    best = max(matched, key=lambda pair: PRIORITY_ORDER[pair[0]])[0]
    return best, [rule_id for _, rule_id in matched]


def _score_band(score: float) -> PriorityLevel:
    for low, high, level in _BANDS:
        if low <= score <= high:
            return level
    return PriorityLevel.CRITICAL  # score > 100 shouldn't happen, but fail safe toward the top band


def _boundary_proximity(score: float) -> float:
    """Explicit formula (not left to improvisation): distance to the
    nearest scoring-band edge (25/50/75), normalized so sitting exactly on
    a boundary (distance 0) -> 1.0, and >=25 away from every boundary ->
    0.0. Named for what it measures -- boundary proximity -- not a claim
    that the email itself is "ambiguous"; may be surfaced as an
    "ambiguity indicator" in docs/UI copy, but the stored field stays
    precise.
    """
    distance = min(abs(score - 25), abs(score - 50), abs(score - 75))
    return 1 - min(distance / 25, 1)


def determine_expected_priority(email: EmailFactors, scenario_weights: Dict[str, float], scenario_rules: List[Dict[str, Any]], scenario_context_attributes: Dict[str, Any]) -> EvaluationResult:
    score = calculate_weighted_score(email, scenario_weights)
    rule_priority, triggered_rules = evaluate_rules(email, scenario_rules, scenario_context_attributes)
    boundary_proximity = _boundary_proximity(score)

    if rule_priority is not None:
        expected = rule_priority
        rationale = (
            f"Weighted score {score:.1f}, but overridden to {expected.value} by rule(s): "
            f"{', '.join(triggered_rules)}."
        )
    else:
        expected = _score_band(score)
        rationale = f"Weighted score {score:.1f} falls in the {expected.value} band; no override rule matched."

    return EvaluationResult(
        priority_score=round(score, 2),
        expected_priority=expected,
        triggered_rules=triggered_rules,
        evaluation_rationale=rationale,
        priority_boundary_proximity=round(boundary_proximity, 3),
    )


# ── Decision scoring (section 8) ─────────────────────────────────────────
def score_decision(expected: PriorityLevel, selected: PriorityLevel) -> Tuple[float, AccuracyLevel]:
    distance = abs(PRIORITY_ORDER[expected] - PRIORITY_ORDER[selected])
    return DISTANCE_TO_SCORE[distance], DISTANCE_TO_ACCURACY[distance]


# ── Aggregate results (section 16/17 + review corrections #2, #5, #6) ────
@dataclass
class DecisionRecord:
    """Pure, DB-agnostic view of one EmailDecision -- what compute_task_
    results/compute_simulation_state need, nothing ORM-specific, so both
    are unit-testable without a database."""

    score: float
    accuracy_level: AccuracyLevel
    decision_time_ms: Optional[int]
    changed_decision: bool
    change_count: int
    opened_at: datetime
    decided_at: Optional[datetime]
    aria_supervision_level: Optional[str]  # ManagerTone value, or None


def _exact_accuracy(decisions: List[DecisionRecord]) -> float:
    if not decisions:
        return 0.0
    exact = sum(1 for d in decisions if d.accuracy_level == AccuracyLevel.EXACT)
    return exact / len(decisions)


def _weighted_decision_score(decisions: List[DecisionRecord]) -> float:
    if not decisions:
        return 0.0
    return sum(d.score for d in decisions) / len(decisions)


def _idle_time_ms(decisions: List[DecisionRecord]) -> int:
    """Sum of the gaps between finishing one email and opening the next --
    a real, timestamp-derived idle measure, not a fabricated one."""
    ordered = sorted((d for d in decisions if d.decided_at), key=lambda d: d.decided_at)
    idle = 0
    for prev, nxt in zip(ordered, ordered[1:]):
        gap = (nxt.opened_at - prev.decided_at).total_seconds() * 1000
        idle += max(0, int(gap))
    return idle


def observed_workload_indicator(decision_count: int, elapsed_seconds: float) -> float:
    """Decisions per minute over the elapsed window. Explicitly named and
    documented as behavior-derived, NOT a clinical/psychological
    measurement -- kept structurally separate from any self-reported
    stress mechanism (StressDeclaration) elsewhere in this project.
    """
    if elapsed_seconds <= 0:
        return 0.0
    return round(decision_count / (elapsed_seconds / 60), 2)


def _half_split_stats(decisions: List[DecisionRecord]) -> Dict[str, Optional[float]]:
    ordered = [d for d in decisions if d.decided_at]
    ordered.sort(key=lambda d: d.decided_at)
    n = len(ordered)
    if n < 2:
        return {
            "early_task_decision_quality": None,
            "late_task_decision_quality": None,
            "early_task_average_decision_time": None,
            "late_task_average_decision_time": None,
            "decision_quality_change": None,
            "decision_time_change": None,
        }
    mid = n // 2
    early, late = ordered[:mid] or ordered[:1], ordered[mid:]
    early_q = sum(d.score for d in early) / len(early)
    late_q = sum(d.score for d in late) / len(late)
    early_t = sum(d.decision_time_ms or 0 for d in early) / len(early)
    late_t = sum(d.decision_time_ms or 0 for d in late) / len(late)
    return {
        "early_task_decision_quality": round(early_q, 3),
        "late_task_decision_quality": round(late_q, 3),
        "early_task_average_decision_time": round(early_t, 1),
        "late_task_average_decision_time": round(late_t, 1),
        "decision_quality_change": round(late_q - early_q, 3),
        "decision_time_change": round(late_t - early_t, 1),
    }


# Tones the spec calls DEMANDING/INTRUSIVE -- see ManagerTone in
# app/models/enums.py (exigeant/intrusif are the same 4-state vocabulary).
_HEIGHTENED_TONES = {"exigeant", "intrusif"}


def _before_after_supervision_stats(decisions: List[DecisionRecord]) -> Dict[str, Optional[float]]:
    """Only computed when there are >=2 decisions on EACH side of the
    first transition into a heightened (DEMANDING/INTRUSIVE) ARIA state --
    otherwise every field here is omitted (None), never fabricated from an
    insufficient sample.
    """
    ordered = [d for d in decisions if d.decided_at]
    ordered.sort(key=lambda d: d.decided_at)

    transition_idx = None
    for i, d in enumerate(ordered):
        if d.aria_supervision_level in _HEIGHTENED_TONES:
            transition_idx = i
            break

    keys = [
        "decision_quality_before_demanding_supervision",
        "decision_quality_after_demanding_supervision",
        "decision_time_before_demanding_supervision",
        "decision_time_after_demanding_supervision",
    ]
    if transition_idx is None or transition_idx < 2 or (len(ordered) - transition_idx) < 2:
        return {k: None for k in keys}

    before, after = ordered[:transition_idx], ordered[transition_idx:]
    return {
        "decision_quality_before_demanding_supervision": round(sum(d.score for d in before) / len(before), 3),
        "decision_quality_after_demanding_supervision": round(sum(d.score for d in after) / len(after), 3),
        "decision_time_before_demanding_supervision": round(sum(d.decision_time_ms or 0 for d in before) / len(before), 1),
        "decision_time_after_demanding_supervision": round(sum(d.decision_time_ms or 0 for d in after) / len(after), 1),
    }


def _contextual_analysis(decisions: List[DecisionRecord], half_stats: Dict[str, Optional[float]]) -> List[str]:
    """Rule-based, deterministic, neutral-language pattern strings (section
    17) -- NOT an LLM call. Strictly descriptive of what was observed;
    never causal or diagnostic language, and never stronger than the
    sample size (an 8-email scenario's early/late split is only 4-vs-4
    decisions) supports.
    """
    notes: List[str] = []
    dq_change = half_stats.get("decision_quality_change")
    dt_change = half_stats.get("decision_time_change")
    if dq_change is not None and dt_change is not None:
        if dq_change < -0.1 and dt_change > 0:
            notes.append("Decision quality was lower and decision time was higher during the second half of the task.")
        elif dq_change < -0.1:
            notes.append("Decision quality was lower during the second half of the task.")
        elif dq_change > 0.1 and dt_change < 0:
            notes.append("Decision quality was higher and decision time was lower during the second half of the task.")
    reconsidered = [d for d in decisions if d.changed_decision]
    if reconsidered and half_stats.get("late_task_average_decision_time"):
        notes.append(f"{len(reconsidered)} of {len(decisions)} decisions were reconsidered before being finalized.")
    accuracy = _exact_accuracy(decisions)
    avg_time = sum(d.decision_time_ms or 0 for d in decisions) / len(decisions) if decisions else 0
    if accuracy >= 0.75 and avg_time < 8000:
        notes.append("High exact-match rate observed alongside fast decision times.")
    elif accuracy < 0.5:
        notes.append("A majority of decisions did not match the expected priority for this scenario.")
    return notes


def compute_task_results(
    decisions: List[DecisionRecord],
    total_emails: int,
    aria_messages_received: int,
    task_duration_seconds: float,
) -> Dict[str, Any]:
    """Section 16's final-results aggregate, plus the review-corrected
    metrics (#2 split accuracy/score, #5 defined performance-under-pressure
    fields, #6 renamed workload indicator)."""
    by_accuracy = {level: 0 for level in AccuracyLevel}
    for d in decisions:
        by_accuracy[d.accuracy_level] += 1

    times = [d.decision_time_ms for d in decisions if d.decision_time_ms is not None]
    half_stats = _half_split_stats(decisions)

    return {
        "total_emails": total_emails,
        "exact_decisions": by_accuracy[AccuracyLevel.EXACT],
        "close_decisions": by_accuracy[AccuracyLevel.CLOSE],
        "misprioritized_decisions": by_accuracy[AccuracyLevel.MISPRIORITIZED],
        "severely_misprioritized_decisions": by_accuracy[AccuracyLevel.SEVERELY_MISPRIORITIZED],
        # Two distinct, never-conflated metrics (review correction #2):
        "exact_accuracy": round(_exact_accuracy(decisions), 3),
        "weighted_decision_score": round(_weighted_decision_score(decisions), 3),
        "average_decision_time": round(sum(times) / len(times), 1) if times else None,
        "fastest_decision": min(times) if times else None,
        "slowest_decision": max(times) if times else None,
        "reconsideration_count": sum(1 for d in decisions if d.changed_decision),
        "reconsideration_rate": round(sum(1 for d in decisions if d.changed_decision) / len(decisions), 3) if decisions else 0.0,
        "total_idle_time_ms": _idle_time_ms(decisions),
        "aria_messages_received": aria_messages_received,
        "observed_workload_indicator": observed_workload_indicator(len(decisions), task_duration_seconds),
        **half_stats,
        **_before_after_supervision_stats(decisions),
        "contextual_analysis": _contextual_analysis(decisions, half_stats),
    }


def compute_simulation_state(
    decisions: List[DecisionRecord],
    total_emails: int,
    aria_messages_received: int,
    elapsed_seconds: float,
    remaining_time_seconds: float,
) -> Dict[str, Any]:
    """Section 12's live SimulationState -- always derived on read from
    EmailDecision rows, same philosophy as the existing
    get_performance_snapshot (no separate mutable state table)."""
    return {
        "processed_count": len(decisions),
        "total_count": total_emails,
        "exact_accuracy": round(_exact_accuracy(decisions), 3),
        "weighted_decision_score": round(_weighted_decision_score(decisions), 3),
        "average_decision_time": round(sum(d.decision_time_ms or 0 for d in decisions) / len(decisions), 1) if decisions else None,
        "reconsiderations": sum(1 for d in decisions if d.changed_decision),
        "idle_time_ms": _idle_time_ms(decisions),
        "remaining_time": remaining_time_seconds,
        "observed_workload_indicator": observed_workload_indicator(len(decisions), elapsed_seconds),
        "aria_messages_received": aria_messages_received,
    }
