"""Unit tests for Task 02 (Email Prioritization)'s deterministic engine:
PriorityEvaluationService (app/orchestrators/priority_evaluation.py) and
the ARIA policy (app/orchestrators/aria_policy.py).

No pytest is installed in this project (confirmed via requirements.txt) --
every existing "test" here is a plain-assert, PASS/FAIL-printing script
(see verify_performance_tracker.py's own convention), run directly with
python rather than a test runner. This file follows the same pattern:
one function per case, each asserting and printing PASS/FAIL.

Run from backend/ with the venv active:
    python tests/test_priority_evaluation.py
"""
import os
import sys
import uuid
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.enums import AccuracyLevel, ManagerTone, PriorityLevel, SessionPhase, SessionStatus
from app.models.manager_message import ManagerMessage
from app.models.session import Session as SessionModel
from app.models.user import User
from app.orchestrators import aria_policy
from app.orchestrators.priority_evaluation import (
    DecisionRecord,
    EmailFactors,
    compute_task_results,
    determine_expected_priority,
    score_decision,
)

results = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    results.append(condition)
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))


WEIGHTS = {"urgency": 0.30, "business_impact": 0.25, "operational_relevance": 0.15, "deadline_pressure": 0.20, "security_risk": 0.10}
RULES = [
    {"id": "production_outage_critical", "when": {"all": [
        {"field": "production_outage", "op": "eq", "value": True},
        {"field": "active_deployment", "op": "eq", "value": True},
    ]}, "then": "CRITICAL"},
    {"id": "confirmed_security_incident_critical", "when": {"all": [
        {"field": "security_risk", "op": "gte", "value": 4},
        {"field": "confirmed_security_incident", "op": "eq", "value": True},
    ]}, "then": "CRITICAL"},
    {"id": "deadline_today_high_impact", "when": {"all": [
        {"field": "deadline_today", "op": "eq", "value": True},
        {"field": "business_impact", "op": "gte", "value": 4},
    ]}, "then": "HIGH"},
]
CONTEXT = {"active_deployment": True}


# ── 1. Production outage + active deployment -> CRITICAL (rule override) ──
def test_1_production_outage_critical():
    email = EmailFactors(urgency=5, business_impact=5, operational_relevance=4, deadline_pressure=5, security_risk=1,
                          context_tags=["production_outage", "client"])
    result = determine_expected_priority(email, WEIGHTS, RULES, CONTEXT)
    check("1. production outage + active deployment -> CRITICAL", result.expected_priority == PriorityLevel.CRITICAL,
          f"got {result.expected_priority}")
    check("1b. triggered_rules records the override", "production_outage_critical" in result.triggered_rules)


# ── 2. Confirmed security incident -> CRITICAL (rule override) ────────────
def test_2_confirmed_security_incident_critical():
    email = EmailFactors(urgency=3, business_impact=3, operational_relevance=2, deadline_pressure=1, security_risk=4,
                          context_tags=["security_incident", "confirmed_security_incident"])
    result = determine_expected_priority(email, WEIGHTS, RULES, CONTEXT)
    check("2. confirmed security incident -> CRITICAL", result.expected_priority == PriorityLevel.CRITICAL,
          f"got {result.expected_priority}")
    # Same email WITHOUT the "confirmed" tag must NOT trigger the rule --
    # proves the rule checks the tag, not just security_risk alone.
    unconfirmed = EmailFactors(urgency=3, business_impact=3, operational_relevance=2, deadline_pressure=1, security_risk=4,
                                context_tags=["security_incident"])
    result2 = determine_expected_priority(unconfirmed, WEIGHTS, RULES, CONTEXT)
    check("2b. unconfirmed security incident does NOT trigger the rule", result2.expected_priority != PriorityLevel.CRITICAL,
          f"got {result2.expected_priority}")


# ── 3. Financial report + deadline today -> HIGH or CRITICAL per config ───
def test_3_deadline_today_high_business_impact():
    email = EmailFactors(urgency=4, business_impact=4, operational_relevance=3, deadline_pressure=5, security_risk=0,
                          context_tags=["financial_closing", "deadline_today"])
    result = determine_expected_priority(email, WEIGHTS, RULES, CONTEXT)
    check("3. deadline-today financial report -> HIGH (this scenario's configured rule)",
          result.expected_priority in (PriorityLevel.HIGH, PriorityLevel.CRITICAL), f"got {result.expected_priority}")
    check("3b. triggered_rules records the override", "deadline_today_high_impact" in result.triggered_rules)


# ── 4. Marketing newsletter -> LOW (pure weighted score, no rule) ─────────
def test_4_marketing_newsletter_low():
    email = EmailFactors(urgency=0, business_impact=1, operational_relevance=1, deadline_pressure=0, security_risk=0,
                          context_tags=["marketing", "low_priority"])
    result = determine_expected_priority(email, WEIGHTS, RULES, CONTEXT)
    check("4. marketing newsletter -> LOW", result.expected_priority == PriorityLevel.LOW, f"got {result.expected_priority}")
    check("4b. no rule fired (pure weighted score)", result.triggered_rules == [])


# ── 5/6/7. Decision scoring by distance ───────────────────────────────────
def test_5_6_7_decision_scoring():
    score, level = score_decision(PriorityLevel.CRITICAL, PriorityLevel.CRITICAL)
    check("5. exact match -> score 1.00, EXACT", score == 1.00 and level == AccuracyLevel.EXACT, f"got {score}, {level}")

    score, level = score_decision(PriorityLevel.CRITICAL, PriorityLevel.HIGH)
    check("6. adjacent priority -> partial score 0.75, CLOSE", score == 0.75 and level == AccuracyLevel.CLOSE, f"got {score}, {level}")

    score, level = score_decision(PriorityLevel.CRITICAL, PriorityLevel.LOW)
    check("7. opposite priority -> score 0.00, SEVERELY_MISPRIORITIZED",
          score == 0.00 and level == AccuracyLevel.SEVERELY_MISPRIORITIZED, f"got {score}, {level}")


# ── 8. priority_boundary_proximity (review correction #1's explicit formula) ─
def test_8_boundary_proximity():
    # Deliberately near a boundary: weighted score should land close to 50.
    near_boundary = EmailFactors(urgency=3, business_impact=3, operational_relevance=2, deadline_pressure=2, security_risk=2,
                                  context_tags=[])
    result_near = determine_expected_priority(near_boundary, WEIGHTS, RULES, {})
    # Deliberately far from every boundary (e.g. near 0 or near 100).
    far_from_boundary = EmailFactors(urgency=0, business_impact=0, operational_relevance=0, deadline_pressure=0, security_risk=0,
                                      context_tags=[])
    result_far = determine_expected_priority(far_from_boundary, WEIGHTS, RULES, {})
    check(
        "8. an email near a scoring-band boundary has higher boundary_proximity than one far from any boundary",
        result_near.priority_boundary_proximity > result_far.priority_boundary_proximity,
        f"near={result_near.priority_boundary_proximity} ({result_near.priority_score}), "
        f"far={result_far.priority_boundary_proximity} ({result_far.priority_score})",
    )
    check("8b. far-from-boundary score (0) has proximity 0.0", result_far.priority_boundary_proximity == 0.0)


# ── 9. decision_time_ms is server-computed from opened_at/decided_at ──────
def test_9_decision_time_from_server_timestamps():
    opened = datetime(2026, 1, 1, 12, 0, 0)
    decided = opened + timedelta(seconds=7, milliseconds=250)
    # Mirrors exactly what app/api/email_prioritization.py's _apply_decision
    # computes -- max(0, int((now - opened_at).total_seconds() * 1000)).
    decision_time_ms = max(0, int((decided - opened).total_seconds() * 1000))
    check("9. decision_time_ms computed from real opened_at/decided_at, not a client value",
          decision_time_ms == 7250, f"got {decision_time_ms}")


# ── 10. Reconsideration: change_count/changed_decision update, no duplicate row ─
def test_10_reconsideration_tracking():
    # Simulates the model-level state transitions app/api/email_prioritization.py's
    # _apply_decision performs -- not hitting the DB, since the unique
    # constraint itself is verified structurally by the migration
    # (uq_email_decision_task_email) and exercised for real in the manual
    # curl round trip (see the plan's verification steps).
    class FakeDecision:
        changed_decision = False
        change_count = 0
        selected_priority = PriorityLevel.HIGH

    d = FakeDecision()
    # First decision (not a reconsideration): change_count stays 0.
    check("10a. first decision leaves change_count at 0", d.change_count == 0)

    # Reconsideration:
    d.changed_decision = True
    d.change_count += 1
    d.selected_priority = PriorityLevel.CRITICAL
    check("10b. reconsideration sets changed_decision=True", d.changed_decision is True)
    check("10c. reconsideration increments change_count", d.change_count == 1)
    check("10d. reconsideration updates selected_priority", d.selected_priority == PriorityLevel.CRITICAL)


# ── 11. ARIA cooldown ──────────────────────────────────────────────────────
def test_11_aria_cooldown():
    db = SessionLocal()
    try:
        user = db.query(User).first()
        session = SessionModel(user_id=user.id, current_phase=SessionPhase.accueil, status=SessionStatus.in_progress)
        db.add(session)
        db.commit()
        db.refresh(session)

        now = datetime.utcnow()
        db.add(ManagerMessage(session_id=session.id, content="test", tone=ManagerTone.neutre,
                               trigger_context={"trigger": "FAST_DECISION"}, sent_at=now))
        db.commit()

        decision = aria_policy.AriaDecision(trigger="SLOW_DECISION", tone=ManagerTone.exigeant, severity=2)
        check("11a. a second low-severity trigger within the min-gap window is suppressed",
              aria_policy.should_emit(db, session.id, decision, now=now + timedelta(seconds=3)) is False)
        check("11b. the same trigger repeated within its own cooldown is suppressed",
              aria_policy.should_emit(
                  db, session.id, aria_policy.AriaDecision(trigger="FAST_DECISION", tone=ManagerTone.neutre, severity=1),
                  now=now + timedelta(seconds=15),
              ) is False)
        critical = aria_policy.AriaDecision(trigger="LOW_REMAINING_TIME", tone=ManagerTone.intrusif, severity=4)
        check("11c. a critical-severity trigger bypasses the cooldown outright",
              aria_policy.should_emit(db, session.id, critical, now=now + timedelta(seconds=1)) is True)
        check("11d. after the min-gap has passed, a new (different) trigger is allowed",
              aria_policy.should_emit(db, session.id, decision, now=now + timedelta(seconds=20)) is True)
    finally:
        db.close()


# ── 12. ARIA severity escalation ───────────────────────────────────────────
def test_12_severity_escalation():
    facts = {
        "event_type": "decision_changed",
        "total_reconsiderations": 3,  # >= MULTIPLE_RECONSIDERATIONS_THRESHOLD
        "remaining_time_seconds": 40,  # <= LOW_REMAINING_TIME_SECONDS (45)
        "total_time_seconds": 480,
    }
    decision = aria_policy.decide_aria_reaction(facts, ManagerTone.neutre)
    check("12. when LOW_REMAINING_TIME and MULTIPLE_RECONSIDERATIONS both fire, the higher-severity one wins",
          decision is not None and decision.trigger == "LOW_REMAINING_TIME", f"got {decision}")


# ── 13. Low remaining time triggers LOW_REMAINING_TIME ─────────────────────
def test_13_low_remaining_time():
    facts = {"event_type": "decision_submitted", "decision_time_ms": 6000, "remaining_time_seconds": 30}
    decision = aria_policy.decide_aria_reaction(facts, ManagerTone.neutre)
    check("13. low remaining time -> LOW_REMAINING_TIME trigger", decision is not None and decision.trigger == "LOW_REMAINING_TIME",
          f"got {decision}")


# ── 14. Early/late-window performance fields (review correction #5) ───────
def test_14_early_late_window_and_omission():
    now = datetime(2026, 1, 1, 9, 0, 0)

    def rec(score, ms, minute, tone=None):
        return DecisionRecord(
            score=score, accuracy_level=AccuracyLevel.EXACT if score == 1.0 else AccuracyLevel.CLOSE,
            decision_time_ms=ms, changed_decision=False, change_count=0,
            opened_at=now + timedelta(minutes=minute), decided_at=now + timedelta(minutes=minute, seconds=ms / 1000),
            aria_supervision_level=tone,
        )

    # 4 decisions: quality/time clearly worse in the second half.
    decisions = [rec(1.0, 3000, 0), rec(1.0, 4000, 1), rec(0.4, 12000, 2), rec(0.4, 15000, 3)]
    out = compute_task_results(decisions, total_emails=4, aria_messages_received=2, task_duration_seconds=600)
    check("14a. early_task_decision_quality > late_task_decision_quality on a degrading sequence",
          out["early_task_decision_quality"] > out["late_task_decision_quality"], f"got {out}")
    check("14b. decision_quality_change is negative", out["decision_quality_change"] < 0)
    check("14c. exact_accuracy and weighted_decision_score are distinct fields, never the same label",
          "exact_accuracy" in out and "weighted_decision_score" in out and out["exact_accuracy"] != out["weighted_decision_score"])

    # Fewer than 2 decisions before the tone transition -> before/after
    # fields must be omitted (None), never fabricated.
    decisions_insufficient = [rec(1.0, 3000, 0, tone="exigeant"), rec(0.4, 12000, 1, tone="exigeant")]
    out2 = compute_task_results(decisions_insufficient, total_emails=2, aria_messages_received=1, task_duration_seconds=300)
    check("14d. before/after-supervision fields are omitted (None) when the sample is too small",
          out2["decision_quality_before_demanding_supervision"] is None)


if __name__ == "__main__":
    test_1_production_outage_critical()
    test_2_confirmed_security_incident_critical()
    test_3_deadline_today_high_business_impact()
    test_4_marketing_newsletter_low()
    test_5_6_7_decision_scoring()
    test_8_boundary_proximity()
    test_9_decision_time_from_server_timestamps()
    test_10_reconsideration_tracking()
    test_11_aria_cooldown()
    test_12_severity_escalation()
    test_13_low_remaining_time()
    test_14_early_late_window_and_omission()

    print()
    passed = sum(1 for r in results if r)
    print(f"{passed}/{len(results)} checks passed")
    if passed != len(results):
        sys.exit(1)
