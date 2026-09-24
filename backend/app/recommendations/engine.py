"""generate_recommendations: rule-based, IF/THEN, same style as
app/orchestrators/adaptation.py -- deterministic and explainable, no LLM
call, for the same reason the adaptive difficulty engine is rule-based.

Each rule checks a SPECIFIC component signal from app/reports/fatigue.py
(the exact same functions compute_fatigue_score itself calls, not a
re-derivation -- no risk of the two drifting apart), not just the blended
fatigue_score alone. "Your errors clustered in the second half" is a more
defensible justification than "the fatigue score was high" if a specific
piece of advice ever needs explaining. fatigue_score itself is only used
directly where the recommendation IS fundamentally about overall session
quality (the stress/fatigue mismatch rule, the good-session rule) --
never as the sole reason for a specific, actionable suggestion.

Rules are independently evaluated, not first-match-wins like
resolve_difficulty_pool: a session can genuinely warrant more than one
piece of advice at once (late error clustering and a stress/fatigue
mismatch can both be true simultaneously), so every matching rule's
message is included, not just the first.

Each recommendation is a structured (title, observation, advice) triple
-- never a single opaque sentence -- so the final-report UI can render
"what we saw" separately from "what to do about it" without having to
parse a string. Text is English, matching the report's own user-facing
language (cahier section 2/12). This module never diagnoses: every
observation describes what was measured, every piece of advice is a
concrete, non-judgmental action -- never a claim about the person's
psychological state.
"""
from dataclasses import dataclass
from typing import List, Optional

from app.reports.aggregation import SessionReportData
from app.reports.behavioral_evaluation import BehavioralEvaluationData
from app.reports.fatigue import (
    declared_stress_score,
    error_trend_score,
    performance_decline_score,
    slowdown_score,
)

# Thresholds live on the same 0-100 component scale as fatigue.py's
# components. Not independently re-tuned from the fatigue formula's own
# (not-yet-empirically-tuned) weights -- same day-7 tuning pass applies.
ERROR_CLUSTERING_THRESHOLD = 60
SLOWDOWN_THRESHOLD = 50
STRESS_MISMATCH_STRESS_THRESHOLD = 70
STRESS_MISMATCH_FATIGUE_CEILING = 40
LOW_SCORE_THRESHOLD = 50
LOW_DECLINE_THRESHOLD = 15
GOOD_SESSION_FATIGUE_CEILING = 25
# A pause episode is already defined (aggregation.py's PAUSE_THRESHOLD_SECONDS,
# reused from ARIA's own HIGH_IDLE_SECONDS) as a notable inactivity gap --
# this only asks "did that happen often enough across the session to be a
# pacing pattern, not a one-off."
FREQUENT_PAUSES_THRESHOLD = 3
# app/features/tasks/useTypingTelemetry.ts's own variation is a standard
# deviation of characters/second between keystroke intervals -- a value
# above this means composition speed swung noticeably rather than staying
# steady, worth a review-your-reply nudge, nothing more.
HIGH_TYPING_VARIATION_THRESHOLD = 3.0
STRESS_INCREASE_THRESHOLD = 1


@dataclass
class Recommendation:
    title: str
    observation: str
    advice: str
    # Additive: the behavioral_evaluation observation code (see
    # app/reports/behavioral_evaluation.py) this rule's firing correlates
    # with, when a clean 1:1 mapping exists. None is the default and
    # remains correct for every rule below unless a mapping is added
    # explicitly at that rule's call site -- this is PARTIAL traceability
    # (not every rule maps to one behavioral_evaluation signal), not a
    # claim that every recommendation is now fully sourced.
    source_observation: Optional[str] = None


def generate_recommendations(
    report: SessionReportData,
    fatigue_score: int,
    behavioral_evaluation: Optional[BehavioralEvaluationData] = None,
) -> List[Recommendation]:
    decline = performance_decline_score(report)
    slowdown = slowdown_score(report)
    error_trend = error_trend_score(report.error_count_trend)
    stress = declared_stress_score(report)

    # Same threshold Step 1 itself uses to decide whether a first/second
    # half split means anything (aggregation.py's enough_for_trend). Below
    # this, decline/fatigue_score read as 0 purely because the None-guards
    # defaulted through with nothing to measure -- that's absence of
    # evidence, not evidence of a good session, and rule 5 below must not
    # mistake one for the other.
    has_enough_data = report.total_tasks_completed >= 2

    recommendations: List[Recommendation] = []

    # 1. Errors clustered late -> pacing/breaks. Cites the clustering
    # itself, not the blended score.
    if error_trend >= ERROR_CLUSTERING_THRESHOLD:
        recommendations.append(
            Recommendation(
                title="Verification under pressure",
                observation="The observed errors were concentrated in the second half of the simulation.",
                advice="Take a few extra seconds to check critical elements before submitting a task, especially toward the end of the session.",
                source_observation="ERRORS_INCREASING" if behavioral_evaluation and behavioral_evaluation.errors.evolution == "INCREASING" else None,
            )
        )

    # 2. Meaningful slowdown -> pacing. Cites the time increase itself.
    if slowdown >= SLOWDOWN_THRESHOLD:
        recommendations.append(
            Recommendation(
                title="Work pace",
                observation="The average time per task increased noticeably in the second half of the session.",
                advice="Consider pacing your effort more evenly or taking a short break midway through the session.",
                source_observation="PACE_SLOWING" if behavioral_evaluation and behavioral_evaluation.pace.evolution == "SLOWING" else None,
            )
        )

    # 3. Stress/fatigue mismatch -- the case named explicitly in the spec:
    # high declared_stress with a low blended fatigue_score should note
    # the mismatch rather than staying silent just because the headline
    # number looks fine.
    if stress >= STRESS_MISMATCH_STRESS_THRESHOLD and fatigue_score < STRESS_MISMATCH_FATIGUE_CEILING:
        has_stress_stable_signal = behavioral_evaluation is not None and any(
            o.code == "STRESS_STABLE_PERFORMANCE" for o in behavioral_evaluation.observations
        )
        recommendations.append(
            Recommendation(
                title="Gap between felt pressure and performance",
                observation="A high pressure level was declared at some point in the session, while the observed performance and pace remained stable.",
                advice="The declared level doesn't always show up in the performance indicators -- this remains useful information to keep in mind independently of the numbers.",
                source_observation="STRESS_STABLE_PERFORMANCE" if has_stress_stable_signal else None,
            )
        )

    # 4. Consistently low score with no decline -- the skill/task-difficulty
    # signal fatigue.py's own docstring explicitly distinguishes from
    # fatigue. Cites avg_score_overall and the (near-zero) decline
    # directly, not fatigue_score.
    #
    # Requires has_enough_data explicitly (calibration review finding): the
    # observation text below asserts a SUSTAINED pattern ("throughout the
    # session"), which a single completed task cannot support. This
    # brings the rule in line with the same n>=2 minimum every other
    # trend/change claim in this project already requires (aggregation.py's
    # enough_for_trend, fatigue.py's decline/slowdown component functions,
    # and every behavioral_evaluation.py evolution function) -- rule 4 was
    # previously the one exception to that convention, not a deliberate
    # design choice.
    if (
        has_enough_data
        and report.avg_score_overall is not None
        and report.avg_score_overall < LOW_SCORE_THRESHOLD
        and decline < LOW_DECLINE_THRESHOLD
    ):
        recommendations.append(
            Recommendation(
                title="Response accuracy",
                observation="Performance stayed consistently low throughout the session, with no progressive decline.",
                advice="This points more toward a mismatch with the difficulty level than a fatigue effect -- re-reading the instructions before answering may help.",
            )
        )

    # 5. Frequent pause episodes -- a pacing signal fatigue.py doesn't
    # weight into the headline score at all (pause_stats isn't one of its
    # four components), but is real, already-persisted behavioral data
    # worth its own targeted advice.
    if report.pause_stats.pause_count >= FREQUENT_PAUSES_THRESHOLD:
        recommendations.append(
            Recommendation(
                title="Task pacing",
                observation=f"{report.pause_stats.pause_count} prolonged idle periods were observed during the session.",
                advice="Planning short, deliberate breaks between tasks can help maintain a steady pace rather than unplanned interruptions.",
            )
        )

    # 6. High typing-speed variation on written responses -- only ever
    # fires when a typing task actually happened (typing_metrics is None
    # otherwise, never a fabricated zero). Explicitly non-psychological:
    # advice is about reviewing the reply, never about inferring stress
    # from typing rhythm.
    if (
        report.typing_metrics is not None
        and report.typing_metrics.average_typing_speed_variation >= HIGH_TYPING_VARIATION_THRESHOLD
    ):
        recommendations.append(
            Recommendation(
                title="Writing responses",
                observation="A notable variation in typing speed was observed while writing responses.",
                advice="Taking a moment to re-read a response before sending it can improve the clarity of the final message.",
            )
        )

    # 7. Declared stress increased over the session -- distinct from rule 3
    # (which needs a HIGH peak alongside a LOW fatigue score). This fires
    # on the simple fact of an upward trend, acknowledged without
    # diagnosis, exactly as the cahier requires.
    if (
        len(report.stress_declarations) >= 2
        and (report.stress_declarations[-1].value - report.stress_declarations[0].value) >= STRESS_INCREASE_THRESHOLD
    ):
        recommendations.append(
            Recommendation(
                title="Declared pressure trend",
                observation="The declared pressure level increased between the start and end of the session.",
                advice="This trend is noted for informational purposes only -- it is not subject to any interpretation or diagnosis.",
                source_observation="STRESS_INCREASING" if behavioral_evaluation and behavioral_evaluation.stress.evolution == "INCREASING" else None,
            )
        )

    # 8. Genuinely good session -- positive reinforcement. Legitimately
    # about overall session quality, so fatigue_score is the right signal
    # here, paired with decline. Requires has_enough_data explicitly: with
    # fewer than 2 completed tasks, fatigue_score and decline both read as
    # 0 purely because there's nothing to measure, not because performance
    # was actually good -- caught live, a 0-task session was claiming "a
    # strong, sustainable pace" before this guard existed.
    #
    # Also excludes a low avg_score_overall (same LOW_SCORE_THRESHOLD rule
    # 4 checks): low fatigue/decline only means "consistent," not "good" --
    # someone scoring 30/100 all session is consistent too, and calling
    # that "a strong, sustainable pace" reads as contradictory praise
    # sitting next to rule 4's task-difficulty-mismatch message. None (no
    # scorer for this task type yet) is let through unchanged -- there's
    # no score evidence to contradict, and rule 4 can't have fired either
    # since it requires avg_score_overall is not None too.
    if (
        has_enough_data
        and fatigue_score < GOOD_SESSION_FATIGUE_CEILING
        and decline < LOW_DECLINE_THRESHOLD
        and (report.avg_score_overall is None or report.avg_score_overall >= LOW_SCORE_THRESHOLD)
    ):
        recommendations.append(
            Recommendation(
                title="Sustained work pace",
                observation="Performance remained consistent throughout the session, with few signs of decline.",
                advice="This work pace appears sustainable over the observed duration.",
            )
        )

    # 9. Fallback -- nothing specific enough triggered above. Only shown
    # when the list would otherwise be empty. Two genuinely different
    # reasons that can happen, worth two different honest messages: too
    # little data to say anything (don't claim a "normal range" when
    # there's no range to have measured), versus real data that just
    # didn't cross any threshold.
    if not recommendations:
        if not has_enough_data:
            recommendations.append(
                Recommendation(
                    title="Insufficient data",
                    observation="Too few tasks were completed during this session to identify a trend.",
                    advice="A longer session would allow for a more complete behavioral analysis.",
                )
            )
        else:
            recommendations.append(
                Recommendation(
                    title="Balanced session",
                    observation="No notable behavioral signal was detected during this session.",
                    advice="Performance and pace stayed within a typical range throughout the simulation.",
                )
            )

    return recommendations
