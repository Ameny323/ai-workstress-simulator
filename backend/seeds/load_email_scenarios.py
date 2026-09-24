"""Insert Task 02 (Email Prioritization) scenario seed rows into the DB.

Same idempotent, glob-discoverable pattern as load_task_templates.py --
loads every *.json file under seeds/email_scenarios/, one scenario per
file, so adding a new scenario later only means dropping in a new file
here. For each email, PriorityEvaluationService computes and persists
priority_score/expected_priority/triggered_rules/evaluation_rationale/
priority_boundary_proximity ONCE, here -- the engine is the only place
that ever decides those values (see app/orchestrators/priority_
evaluation.py's module docstring).

Run from backend/ with the venv active:
    python seeds/load_email_scenarios.py
"""
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Make "app" importable when this script runs from the backend/ folder,
# matching the same trick alembic/env.py and load_task_templates.py use.
sys.path.append(os.getcwd())

from app.database import SessionLocal  # noqa: E402
from app.models.email_scenario import EmailScenario  # noqa: E402
from app.models.email_task_item import EmailTaskItem  # noqa: E402
from app.orchestrators.priority_evaluation import EmailFactors, determine_expected_priority  # noqa: E402

SEED_FILES = sorted(Path(__file__).parent.glob("email_scenarios/*.json"))


def load_email_scenarios() -> None:
    db = SessionLocal()
    try:
        inserted_scenarios, skipped_scenarios, inserted_emails = 0, 0, 0
        for seed_file in SEED_FILES:
            data = json.loads(seed_file.read_text(encoding="utf-8"))

            existing = db.query(EmailScenario).filter(EmailScenario.name == data["name"]).first()
            if existing:
                skipped_scenarios += 1
                continue

            scenario = EmailScenario(
                name=data["name"],
                role=data["role"],
                context_description=data["context_description"],
                context_tags=data["context_tags"],
                context_attributes=data["context_attributes"],
                priority_weights=data["priority_weights"],
                priority_rules=data["priority_rules"],
                is_active=True,
            )
            db.add(scenario)
            db.flush()  # assigns scenario.id for the FK below

            base_time = datetime.utcnow().replace(hour=8, minute=30, second=0, microsecond=0)
            for entry in data["emails"]:
                factors = EmailFactors(
                    urgency=entry["urgency"],
                    business_impact=entry["business_impact"],
                    operational_relevance=entry["operational_relevance"],
                    deadline_pressure=entry["deadline_pressure"],
                    security_risk=entry["security_risk"],
                    context_tags=entry["context_tags"],
                )
                result = determine_expected_priority(
                    factors, scenario.priority_weights, scenario.priority_rules, scenario.context_attributes
                )

                db.add(
                    EmailTaskItem(
                        scenario_id=scenario.id,
                        sender=entry["sender"],
                        sender_role=entry["sender_role"],
                        subject=entry["subject"],
                        body=entry["body"],
                        received_at=base_time + timedelta(minutes=entry.get("received_at_offset_minutes", 0)),
                        deadline=entry.get("deadline"),
                        has_attachment=entry["has_attachment"],
                        attachments=entry["attachments"],
                        urgency=entry["urgency"],
                        business_impact=entry["business_impact"],
                        operational_relevance=entry["operational_relevance"],
                        deadline_pressure=entry["deadline_pressure"],
                        security_risk=entry["security_risk"],
                        context_tags=entry["context_tags"],
                        priority_score=result.priority_score,
                        expected_priority=result.expected_priority,
                        triggered_rules=result.triggered_rules,
                        evaluation_rationale=result.evaluation_rationale,
                        priority_boundary_proximity=result.priority_boundary_proximity,
                    )
                )
                inserted_emails += 1

            inserted_scenarios += 1

        db.commit()
        print(
            f"Inserted {inserted_scenarios} scenario(s) with {inserted_emails} email(s); "
            f"skipped {skipped_scenarios} scenario(s) already present."
        )
    finally:
        db.close()


if __name__ == "__main__":
    load_email_scenarios()
