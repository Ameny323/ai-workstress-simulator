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
