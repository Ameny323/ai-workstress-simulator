"""Instance generator for the data_validation task family.

Turns a TaskTemplate's `metadata` (row_count + record_pool rules) into
concrete instance content: a list of fake records, some deliberately
broken, each tagged with the ground-truth `is_valid` flag. No LLM calls —
just deterministic-shaped, randomized Python.
"""
import random

FIRST_NAMES = [
    "James", "Maria", "Ahmed", "Sophie", "Liam", "Aisha", "Noah", "Elena",
    "Lucas", "Fatima", "Yusuf", "Chloe", "Mateo", "Ingrid", "Omar", "Priya",
]
LAST_NAMES = [
    "Smith", "Garcia", "Khan", "Dubois", "Muller", "Ivanov", "Rossi", "Nguyen",
    "Brown", "Silva", "Andersson", "Kowalski", "Haddad", "Novak", "Diallo",
]
EMAIL_DOMAINS = ["gmail.com", "outlook.com", "company.com", "yahoo.com"]


def _random_name() -> str:
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


def _valid_email(name: str) -> str:
    local = name.lower().replace(" ", ".")
    return f"{local}@{random.choice(EMAIL_DOMAINS)}"


def _broken_email(name: str) -> str:
    local = name.lower().replace(" ", ".")
    domain = random.choice(EMAIL_DOMAINS)
    variant = random.choice([
        f"{local}{domain}",                     # missing @
        f"{local}@{domain.replace('.', '')}",   # missing dot in domain
        f"{local}@@{domain}",                   # doubled @
        f"{local} @{domain}",                   # stray space
        f"{local}@",                            # domain missing entirely
    ])
    return variant


def _valid_phone() -> str:
    return f"({random.randint(200, 999)}) {random.randint(200, 999)}-{random.randint(1000, 9999)}"


def _broken_phone() -> str:
    return random.choice([
        f"{random.randint(10, 99)}-{random.randint(100, 999)}",   # too few digits
        f"({random.randint(200, 999)}) {random.randint(1, 99)}",  # incomplete
        random.choice(["call me", "N/A", "unknown", "ask reception"]),  # non-numeric junk
        f"+{random.randint(1, 9)}-{random.randint(20, 99)}",       # malformed intl
    ])


FIELD_GENERATORS = {
    "Name": {"valid": lambda name: name, "broken": lambda name: name},
    "Email": {"valid": _valid_email, "broken": _broken_email},
    "Phone": {"valid": lambda _name: _valid_phone(), "broken": lambda _name: _broken_phone()},
}


def generate_validation_instance(metadata: dict) -> dict:
    """Build instance_data for one data_validation task from template metadata.

    metadata looks like:
        {"row_count": 8, "record_pool": {"field_names": [...], "error_rate": 0.3}}

    Returns {"columns": [...], "records": [{...fields..., "is_valid": bool}, ...]}.
    Name is never the broken field — only Email/Phone are corruptible, since
    those are the only fields with a checkable format.
    """
    row_count = metadata.get("row_count", 8)
    record_pool = metadata.get("record_pool", {})
    field_names = record_pool.get("field_names", ["Name", "Email", "Phone"])
    error_rate = record_pool.get("error_rate", 0.3)

    breakable_fields = [f for f in field_names if f in ("Email", "Phone")]

    records = []
    for i in range(row_count):
        name = _random_name()
        is_valid = True
        broken_field = None
        if breakable_fields and random.random() < error_rate:
            is_valid = False
            broken_field = random.choice(breakable_fields)

        record = {"id": i + 1}
        for field in field_names:
            generator = FIELD_GENERATORS.get(field)
            if generator is None:
                record[field] = ""
                continue
            use_broken = field == broken_field
            record[field] = generator["broken" if use_broken else "valid"](name)
        record["is_valid"] = is_valid
        records.append(record)

    return {"columns": field_names, "records": records}


def score_validation_submission(instance_data: dict, submission_data: dict) -> dict:
    """Grade a data_validation submission against its ground truth.

    instance_data: the task's generated content — instance_data["records"], each with
        "id" and "is_valid" (ground truth).
    submission_data: what the user submitted — {"flagged_ids": [...]}, the record ids
        they marked as invalid.

    A record is correct if (id in flagged_ids) == (not is_valid) — i.e. the user
    flagged exactly the invalid records and left the valid ones unchecked. Both false
    positives (flagged a valid record) and false negatives (missed an invalid record)
    count as errors.

    Returns {"content_score": int 0-100, "error_count": int, "correct_count": int,
    "total_count": int}. No DB access — pure function, independently testable.
    """
    records = instance_data.get("records", [])
    flagged_ids = set(submission_data.get("flagged_ids", []))

    total_count = len(records)
    correct_count = sum(
        1
        for record in records
        if (record["id"] in flagged_ids) == (not record["is_valid"])
    )
    error_count = total_count - correct_count
    content_score = round(100 * correct_count / total_count) if total_count else 0

    return {
        "content_score": content_score,
        "error_count": error_count,
        "correct_count": correct_count,
        "total_count": total_count,
    }
