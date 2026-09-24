"""Instance generator + deterministic scorer for the urgent_request task
family (cahier: "reponse a des demandes urgentes") -- a distinct
interaction from Task 02's email PRIORITIZATION: here the user reads one
urgent situation and chooses a single best RESPONSE ACTION from a fixed
set of options, rather than ranking/triaging a batch of emails by
priority level. Same generator/scorer split and controlled-generation
wrapper pattern as every other task family in this package.
"""
import logging
from typing import Tuple

from app.ai import task_generation
from app.models.enums import GenerationType, TaskType

logger = logging.getLogger(__name__)


def generate_urgent_request_instance(metadata: dict) -> dict:
    """Build instance_data for one urgent_request task from template
    metadata (or LLM-generated content -- see task_generation.py).

    metadata looks like:
        {
            "sender": "...", "sender_role": "...", "subject": "...",
            "message": "...", "urgency": 4,
            "options": [{"id": "escalate", "label": "..."}, ...],
            "correct_action": "escalate",
        }

    correct_action is included in instance_data, following this project's
    own established precedent (document_organization's correct_category
    and image_matching's shared id are likewise present in instance_data,
    not hidden from the frontend) -- the participant is trusted not to
    read it off the payload; the deterministic evaluator is what actually
    decides correctness regardless of what the UI shows.
    """
    return {
        "sender": metadata.get("sender", "Unknown Sender"),
        "sender_role": metadata.get("sender_role", ""),
        "subject": metadata.get("subject", "(no subject)"),
        "message": metadata.get("message", ""),
        "urgency": metadata.get("urgency", 4),
        "options": metadata.get("options", []),
        "correct_action": metadata.get("correct_action", ""),
    }


def generate_urgent_request_instance_controlled(metadata: dict) -> Tuple[dict, GenerationType, str]:
    """Same controlled-generation-with-deterministic-fallback pattern as
    app/tasks/document_organization.py and app/tasks/email_writing.py."""
    context = task_generation.UrgentRequestGenerationContext(
        role=metadata.get("sender_role") or "Colleague",
        scenario_hint=metadata.get("message"),
    )
    try:
        instance_data = task_generation.generate_task(TaskType.urgent_request, context)
        return instance_data, GenerationType.LLM, task_generation.TASK_GENERATION_PROMPT_VERSION
    except task_generation.GenerationError as exc:
        logger.warning("urgent_request LLM generation failed, using deterministic fallback: %s", exc)
        return generate_urgent_request_instance(metadata), GenerationType.FALLBACK, task_generation.TASK_GENERATION_PROMPT_VERSION


def score_urgent_request_submission(instance_data: dict, submission_data: dict) -> dict:
    """Grade an urgent_request submission deterministically: binary
    correct/incorrect against the scenario's single correct_action --
    matches the simplicity of the underlying decision (there is exactly
    one clearly-best response action per scenario, unlike Task 02's
    ordinal 4-level priority scale, which is why that scorer's
    distance-based partial credit doesn't apply here).

    submission_data: {"selected_action": "<option id>",
    "reconsideration_count": <int, client-reported -- see
    UrgentRequestTask.tsx>}. reconsideration_count is recorded as
    telemetry only; it never affects the score.

    Returns {"content_score": 0 or 100, "error_count": 0 or 1,
    "correct_action": str, "selected_action": str|None}. No DB access, no
    LLM call.
    """
    correct = instance_data.get("correct_action")
    selected = submission_data.get("selected_action")
    is_correct = selected is not None and selected == correct

    return {
        "content_score": 100 if is_correct else 0,
        "error_count": 0 if is_correct else 1,
        "correct_action": correct,
        "selected_action": selected,
    }
