"""Instance generator for the document_organization task family.

Turns a TaskTemplate's `metadata` (item_count + categories + document_pool)
into concrete instance content: a shuffled sample of documents drawn from
the pool, each tagged with its ground-truth category. No LLM calls — pure,
deterministic-shaped Python, same pattern as app/tasks/data_validation.py.
"""
import random


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
