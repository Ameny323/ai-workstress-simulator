"""Insert every task-family's TaskTemplate seed rows into the DB.

Loads all `*_templates.json` files in this folder (one per task family —
data_validation_templates.json, document_organization_templates.json, ...),
so adding a new family only means dropping a new seed file here.

Run from backend/ with the venv active:
    python seeds/load_task_templates.py
"""
import json
import os
import sys
from pathlib import Path

# Make "app" importable when this script runs from the backend/ folder,
# matching the same trick alembic/env.py uses.
sys.path.append(os.getcwd())

from app.database import SessionLocal  # noqa: E402
from app.models.task_template import TaskTemplate  # noqa: E402

SEED_FILES = sorted(Path(__file__).parent.glob("*_templates.json"))


def load_task_templates() -> None:
    db = SessionLocal()
    try:
        inserted, skipped = 0, 0
        for seed_file in SEED_FILES:
            templates = json.loads(seed_file.read_text())
            for entry in templates:
                exists = (
                    db.query(TaskTemplate)
                    .filter(TaskTemplate.title == entry["title"])
                    .first()
                )
                if exists:
                    skipped += 1
                    continue

                db.add(
                    TaskTemplate(
                        title=entry["title"],
                        description=entry["description"],
                        task_type=entry["task_type"],
                        difficulty=entry["difficulty"],
                        phase=entry["phase"],
                        estimated_duration=entry["estimated_duration"],
                        default_priority=entry["default_priority"],
                        instructions=entry["instructions"],
                        metadata_json=entry["metadata"],
                        is_active=entry["is_active"],
                    )
                )
                inserted += 1

        db.commit()
        print(f"Inserted {inserted} template(s), skipped {skipped} already present.")
    finally:
        db.close()


if __name__ == "__main__":
    load_task_templates()
