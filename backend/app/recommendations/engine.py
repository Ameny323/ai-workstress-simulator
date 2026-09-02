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
"""
from typing import List

from app.reports.aggregation import SessionReportData
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


def generate_recommendations(report: SessionReportData, fatigue_score: int) -> List[str]:
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

    recommendations: List[str] = []

    # 1. Errors clustered late -> pacing/breaks. Cites the clustering
    # itself, not the blended score.
    if error_trend >= ERROR_CLUSTERING_THRESHOLD:
        recommendations.append(
            "Errors were concentrated in the second half of this session. Consider shorter "
            "work sprints with scheduled breaks to reduce late-session mistakes."
        )

    # 2. Meaningful slowdown -> pacing. Cites the time increase itself.
    if slowdown >= SLOWDOWN_THRESHOLD:
        recommendations.append(
            "Average time per task increased notably in the second half of the session, a "
            "common sign of declining stamina. Consider pacing work more evenly or building "
            "in a mid-session break."
        )

    # 3. Stress/fatigue mismatch -- the case named explicitly in the spec:
    # high declared_stress with a low blended fatigue_score should note
    # the mismatch rather than staying silent just because the headline
    # number looks fine.
    if stress >= STRESS_MISMATCH_STRESS_THRESHOLD and fatigue_score < STRESS_MISMATCH_FATIGUE_CEILING:
        recommendations.append(
            "Stress was self-reported as high at some point in this session, even though "
            "overall performance and pace held up. Self-reported stress doesn't always show "
            "up in output metrics -- worth checking in on well-being regardless of the numbers."
        )

    # 4. Consistently low score with no decline -- the skill/task-difficulty
    # signal fatigue.py's own docstring explicitly distinguishes from
    # fatigue. Cites avg_score_overall and the (near-zero) decline
    # directly, not fatigue_score.
    if (
        report.avg_score_overall is not None
        and report.avg_score_overall < LOW_SCORE_THRESHOLD
        and decline < LOW_DECLINE_THRESHOLD
    ):
        recommendations.append(
            "Performance was consistently low throughout the session without a late decline. "
            "This looks more like a task-difficulty mismatch than fatigue -- consider "
            "reviewing whether the assigned difficulty level was appropriate."
        )

    # 5. Genuinely good session -- positive reinforcement. Legitimately
    # about overall session quality, so fatigue_score is the right signal
    # here, paired with decline. Requires has_enough_data explicitly: with
    # fewer than 2 completed tasks, fatigue_score and decline both read as
    # 0 purely because there's nothing to measure, not because performance
    # was actually good -- caught live, a 0-task session was claiming "a
    # strong, sustainable pace" before this guard existed.
    if has_enough_data and fatigue_score < GOOD_SESSION_FATIGUE_CEILING and decline < LOW_DECLINE_THRESHOLD:
        recommendations.append(
            "Performance stayed consistent throughout the session with minimal signs of "
            "fatigue. A strong, sustainable pace."
        )

    # 6. Fallback -- nothing specific enough triggered above. Only shown
    # when the list would otherwise be empty. Two genuinely different
    # reasons that can happen, worth two different honest messages: too
    # little data to say anything (don't claim a "normal range" when
    # there's no range to have measured), versus real data that just
    # didn't cross any threshold.
    if not recommendations:
        if not has_enough_data:
            recommendations.append(
                "Not enough tasks were completed in this session to assess a fatigue trend."
            )
        else:
            recommendations.append(
                "No strong fatigue signals were detected in this session. Performance and pace "
                "stayed within a normal range throughout."
            )

    return recommendations
