"""Instance generator + deterministic scorer for the email_writing task
family (cahier: "redaction de courriels"). Same generator/scorer split as
every other task family in this package (data_validation.py,
image_matching.py) -- generate_email_writing_instance_controlled is the
LLM-aware entry point task_engine.py calls, mirroring
document_organization.py's own controlled-generation wrapper: try
controlled LLM generation first, fall back to the deterministic
TaskTemplate-driven generator on any failure.

required_points/forbidden_points are included in instance_data (visible to
the frontend) deliberately -- unlike document_organization's
correct_category or image_matching's shared id, these are not an "answer
key" to hide; they're the task BRIEF (what a real work request would
actually specify), the same way a real assignment tells you what to
cover. The participant still has to actually write the response.
"""
import logging
from typing import Tuple

from app.ai import task_generation
from app.models.enums import GenerationType, TaskType

logger = logging.getLogger(__name__)

DEFAULT_MIN_LENGTH = 40
DEFAULT_MAX_LENGTH = 900


def generate_email_writing_instance(metadata: dict) -> dict:
    """Build instance_data for one email_writing task from template
    metadata (or, for a controlled/LLM-generated instance, from the
    generated content's own equivalent fields -- see task_generation.py).

    metadata looks like:
        {
            "sender": "...", "sender_role": "...", "subject": "...",
            "context": "...", "original_request": "...", "objective": "...",
            "urgency": 3, "required_points": ["...", ...],
            "forbidden_points": ["...", ...],
            "min_length": 40, "max_length": 900,
        }
    """
    return {
        "sender": metadata.get("sender", "Unknown Sender"),
        "sender_role": metadata.get("sender_role", ""),
        "subject": metadata.get("subject", "(no subject)"),
        "context": metadata.get("context", ""),
        "original_request": metadata.get("original_request", ""),
        "objective": metadata.get("objective", ""),
        "urgency": metadata.get("urgency", 3),
        "required_points": metadata.get("required_points", []),
        "forbidden_points": metadata.get("forbidden_points", []),
        "min_length": metadata.get("min_length", DEFAULT_MIN_LENGTH),
        "max_length": metadata.get("max_length", DEFAULT_MAX_LENGTH),
    }


def generate_email_writing_instance_controlled(metadata: dict) -> Tuple[dict, GenerationType, str]:
    """Task 03-style controlled generation (see app/tasks/document_
    organization.py's own function of the same shape): try LLM generation
    first, fall back to the deterministic template-driven generator above
    on any failure. Returns (instance_data, generation_type, prompt_version).
    """
    context = task_generation.EmailWritingGenerationContext(
        role=metadata.get("sender_role") or "Colleague",
        scenario_hint=metadata.get("context"),
    )
    try:
        instance_data = task_generation.generate_task(TaskType.email_writing, context)
        return instance_data, GenerationType.LLM, task_generation.TASK_GENERATION_PROMPT_VERSION
    except task_generation.GenerationError as exc:
        logger.warning("email_writing LLM generation failed, using deterministic fallback: %s", exc)
        return generate_email_writing_instance(metadata), GenerationType.FALLBACK, task_generation.TASK_GENERATION_PROMPT_VERSION


def score_email_writing_submission(instance_data: dict, submission_data: dict) -> dict:
    """Grade an email_writing submission deterministically.

    instance_data: required_points/forbidden_points/min_length/max_length
        (the task brief -- see module docstring).
    submission_data: {"written_response": "<the composed text>"}.

    Three independent, equally-simple checks, each contributing to the
    same 0-100 scale as every other scorer in this project:
      - how many required points were actually covered (substring match,
        case-insensitive -- a deliberately simple, explainable proxy for
        "did the response address what was asked," not an NLP judgment),
      - how many forbidden points were avoided,
      - whether the response met the length constraints.
    An empty/missing response scores 0 outright -- there's nothing to
    credit, and "the user never wrote anything" must never be
    indistinguishable from "the user wrote something imperfect."

    Returns {"content_score": int 0-100, "error_count": int,
    "required_points_included": int, "required_points_total": int,
    "forbidden_points_violated": int, "length_ok": bool,
    "character_count": int}. No DB access, no LLM call -- pure function,
    independently testable, same convention as every other scorer here.
    """
    text = (submission_data.get("written_response") or "").strip()
    required = instance_data.get("required_points", [])
    forbidden = instance_data.get("forbidden_points", [])
    min_length = instance_data.get("min_length", 0)
    max_length = instance_data.get("max_length", 10_000)

    character_count = len(text)

    if not text:
        return {
            "content_score": 0,
            "error_count": len(required) + len(forbidden) + 1,
            "required_points_included": 0,
            "required_points_total": len(required),
            "forbidden_points_violated": 0,
            "length_ok": False,
            "character_count": 0,
        }

    text_lower = text.lower()
    included = [p for p in required if p.lower() in text_lower]
    violated = [p for p in forbidden if p.lower() in text_lower]
    length_ok = min_length <= character_count <= max_length

    # +1 check slot for the length constraint, alongside one slot per
    # required/forbidden point -- keeps every task's checks on the same
    # per-item scale regardless of how many required/forbidden points a
    # given scenario happens to define.
    total_checks = len(required) + len(forbidden) + 1
    correct_checks = len(included) + (len(forbidden) - len(violated)) + (1 if length_ok else 0)
    error_count = (len(required) - len(included)) + len(violated) + (0 if length_ok else 1)
    content_score = round(100 * correct_checks / total_checks) if total_checks else 100

    return {
        "content_score": content_score,
        "error_count": error_count,
        "required_points_included": len(included),
        "required_points_total": len(required),
        "forbidden_points_violated": len(violated),
        "length_ok": length_ok,
        "character_count": character_count,
    }
