"""Instance generator for the image_matching task family.

Turns a TaskTemplate's `metadata` (pair_count + a pool of {id, label,
image_url, description} entries) into concrete instance content: a sample
of pairs, split into an image list and a description list, each shuffled
independently for display order. No LLM calls, no live image fetching —
pure, deterministic-shaped Python, same pattern as the other task_type
generators in this package.
"""
import random


def generate_matching_instance(metadata: dict) -> dict:
    """Build instance_data for one image_matching task from template metadata.

    metadata looks like:
        {
            "pair_count": 4,
            "pool": [
                {"id": 1, "label": "Cat", "image_url": "...", "description": "..."},
                ...
            ]
        }

    Returns {"items": [{"id", "image_url"}, ...], "descriptions": [{"id", "text"}, ...]}.
    Ground truth is the shared `id` between an item and its matching
    description — no separate correct-answer field needed, since the id
    itself is the pairing key (parallel to how correct_category is
    attached per-record in document_organization, just encoded via the
    shared id instead of a duplicated field). `label` is intentionally
    dropped — it would give the answer away.
    """
    pair_count = metadata.get("pair_count", 4)
    pool = metadata.get("pool", [])

    selected = random.sample(pool, min(pair_count, len(pool)))

    items = [{"id": entry["id"], "image_url": entry["image_url"]} for entry in selected]
    descriptions = [{"id": entry["id"], "text": entry["description"]} for entry in selected]

    random.shuffle(items)
    random.shuffle(descriptions)

    return {"items": items, "descriptions": descriptions}


def score_matching_submission(instance_data: dict, submission_data: dict) -> dict:
    """Grade an image_matching submission against its ground truth.

    instance_data: the task's generated content — instance_data["items"], each with
        "id" (ground truth: the correctly-matching description shares this same id,
        per generate_matching_instance above).
    submission_data: what the user submitted — {"matches": {image_id: description_id}}.

    An item is correct if the description_id the user picked for it equals
    the item's own id — a per-item "does the chosen value equal the correct
    value" comparison, not a binary flagged/not-flagged check. Structurally
    this is the same shape document_organization's correct_category
    comparison would use, not data_validation's is_valid check.

    Returns {"content_score": int 0-100, "error_count": int, "correct_count": int,
    "total_count": int}. No DB access — pure function, independently testable.
    """
    items = instance_data.get("items", [])
    raw_matches = submission_data.get("matches", {})
    # dict keys are always strings once round-tripped through JSON storage —
    # normalize regardless of whether this is called with fresh Pydantic
    # output (already int-keyed) or a value read back from the DB.
    matches = {int(k): v for k, v in raw_matches.items()}

    total_count = len(items)
    correct_count = sum(1 for item in items if matches.get(item["id"]) == item["id"])
    error_count = total_count - correct_count
    content_score = round(100 * correct_count / total_count) if total_count else 0

    return {
        "content_score": content_score,
        "error_count": error_count,
        "correct_count": correct_count,
        "total_count": total_count,
    }
