"""Instance generator for the document_organization task family.

Turns a TaskTemplate's `metadata` (item_count + categories + document_pool)
into concrete instance content: a shuffled sample of documents drawn from
the pool, each tagged with its ground-truth category. No LLM calls — pure,
deterministic-shaped Python, same pattern as app/tasks/data_validation.py.

generate_document_organization_instance_controlled() below (Task 03,
automatic task generation) is the LLM-aware entry point task_engine.py
actually calls: it tries controlled LLM generation first, constrained to
this template's own category set, and falls back to the deterministic
generator above on ANY failure -- the simulation never stalls or breaks
because of a bad/slow/missing OpenAI response.
"""
import logging
import random
from typing import Tuple

from app.ai import task_generation
from app.models.enums import GenerationType, TaskType

logger = logging.getLogger(__name__)


def generate_document_organization_instance(metadata: dict) -> dict:
    """Build instance_data for one document_organization task from template metadata.

    metadata looks like:
        {
            "item_count": 6,
            "categories": ["Finance", "HR", "Legal"],
            "document_pool": {"Finance": ["invoice.pdf", ...], "HR": [...], ...}
        }

    Returns {"categories": [...], "records": [{"id", "filename", "correct_category"}, ...]}.
    correct_category is the ground truth (parallel to data_validation's
    is_valid) — used for scoring later, not necessarily shown in the UI.
    """
    item_count = metadata.get("item_count", 6)
    categories = metadata.get("categories", [])
    document_pool = metadata.get("document_pool", {})

    all_documents = [
        (filename, category)
        for category in categories
        for filename in document_pool.get(category, [])
    ]
    random.shuffle(all_documents)
    selected = all_documents[:item_count]

    records = [
        {"id": i + 1, "filename": filename, "correct_category": category}
        for i, (filename, category) in enumerate(selected)
    ]

    return {"categories": categories, "records": records}


def generate_document_organization_instance_controlled(metadata: dict) -> Tuple[dict, GenerationType, str]:
    """Task 03: try controlled LLM generation for this document_organization
    instance, constrained to THIS template's own category set (never a
    hardcoded global list -- see task_generation.py's own note on why
    categories are per-template in this project). Falls back to the
    deterministic generate_document_organization_instance() above on any
    GenerationError (missing key, timeout, malformed output, or failed
    content validation) -- logged, never raised further.

    Returns (instance_data, generation_type, generation_prompt_version) --
    the caller (task_engine.py) persists all three on the Task row.
    """
    categories = metadata.get("categories", [])
    item_count = metadata.get("item_count", 6)
    context = task_generation.DocumentOrganizationGenerationContext(categories=categories, item_count=item_count)
    try:
        instance_data = task_generation.generate_task(TaskType.document_organization, context)
        return instance_data, GenerationType.LLM, task_generation.TASK_GENERATION_PROMPT_VERSION
    except task_generation.GenerationError as exc:
        logger.warning("document_organization LLM generation failed, using deterministic fallback: %s", exc)
        return generate_document_organization_instance(metadata), GenerationType.FALLBACK, task_generation.TASK_GENERATION_PROMPT_VERSION


def score_document_organization_submission(instance_data: dict, submission_data: dict) -> dict:
    """Grade a document_organization submission against its ground truth.

    instance_data: the task's generated content -- instance_data["records"], each with
        "id" and "correct_category" (ground truth).
    submission_data: what the user submitted -- {"assignments": {id: category, ...}},
        the category each document was dragged into (as a string-keyed dict once it
        round-trips through JSON, so ids are compared as strings).

    A record is correct if the user assigned it to exactly its correct_category. An
    unassigned record (never dragged into any folder) counts as an error, same as a
    wrong-folder assignment -- both mean the document wasn't correctly organized.

    Returns {"content_score": int 0-100, "error_count": int, "correct_count": int,
    "total_count": int}. No DB access -- pure function, independently testable, same
    shape/convention as score_validation_submission (app/tasks/data_validation.py).
    """
    records = instance_data.get("records", [])
    assignments = submission_data.get("assignments", {}) or {}
    # Dict keys arrive as strings over JSON/HTTP regardless of the Python-side
    # int id -- normalize once here rather than trusting either representation.
    assignments = {str(k): v for k, v in assignments.items()}

    total_count = len(records)
    correct_count = sum(
        1 for record in records if assignments.get(str(record["id"])) == record["correct_category"]
    )
    error_count = total_count - correct_count
    content_score = round(100 * correct_count / total_count) if total_count else 0

    return {
        "content_score": content_score,
        "error_count": error_count,
        "correct_count": correct_count,
        "total_count": total_count,
    }
