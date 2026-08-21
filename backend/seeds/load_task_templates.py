"""Insert the data_validation TaskTemplate seed rows into the DB.

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

SEED_FILE = Path(__file__).parent / "data_validation_templates.json"


def load_task_templates() -> None:
    templates = json.loads(SEED_FILE.read_text())

    db = SessionLocal()
    try:
        inserted, skipped = 0, 0
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
