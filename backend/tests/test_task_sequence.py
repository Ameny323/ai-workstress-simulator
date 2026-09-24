"""Tests for the sequential simulation flow: a session-scoped, backend-
authoritative, ordered list of tasks (app/core/sequence_config.py's
DEFAULT_TASK_SEQUENCE) that the participant must complete in order, one at
a time, with no free task-type navigation and no way to reopen a previous
task or jump ahead.

Hits the real dev DB directly via fastapi.testclient.TestClient (same
convention as tests/test_stress_declaration.py) -- register/login real
users, create real sessions, complete real tasks through the actual HTTP
endpoints. No mocked scoring, no fabricated telemetry.

Same plain-assert / PASS-FAIL convention as the rest of this suite (no
pytest installed).

Run from backend/ with the venv active:
    python tests/test_task_sequence.py
"""
import os
import sys
import time
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

from app.core.sequence_config import DEFAULT_TASK_SEQUENCE
from app.database import SessionLocal
from app.main import app
from app.models.enums import SessionPhase
from app.models.session import Session as SessionModel
from app.models.task import Task

results = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    results.append(condition)
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))


client = TestClient(app)


def register_and_login(suffix: str) -> dict:
    email = f"seqtest.{suffix}.{int(time.time() * 1000)}@example.com"
    r = client.post("/auth/register", json={"full_name": "Seq Test", "email": email, "password": "TestPass123!"})
    assert r.status_code == 201, r.text
    r = client.post("/auth/login", data={"username": email, "password": "TestPass123!"})
    assert r.status_code == 200, r.text
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def create_session(headers: dict) -> str:
    r = client.post("/sessions/", headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def complete_current(task: dict, headers: dict) -> dict:
    """Build a correct submission for whatever task type is currently
    active and complete it -- real scoring, no shortcuts."""
    t = task["type"]
    instance = task["instance_data"]
    if t == "data_validation":
        flagged = [rec["id"] for rec in instance["records"] if not rec["is_valid"]]
        submission = {"flagged_ids": flagged}
    elif t == "document_organization":
        submission = {"assignments": {str(r["id"]): r["correct_category"] for r in instance["records"]}}
    elif t == "email_writing":
        text = "Reply. " + " ".join(instance["required_points"]) + " Regards."
        submission = {"written_response": text}
    elif t == "urgent_request":
        submission = {"selected_action": instance["correct_action"]}
    else:
        submission = {}
    r = client.post(f"/tasks/{task['id']}/complete", headers=headers, json=submission)
    assert r.status_code == 200, r.text
    return r.json()


# ── 1-3: default sequence, initial position, first task type ──────────────
headers = register_and_login("basic")
session_id = create_session(headers)

db = SessionLocal()
session_row = db.query(SessionModel).filter(SessionModel.id == session_id).first()
check("session receives the configured default sequence", session_row.task_sequence == DEFAULT_TASK_SEQUENCE)
check("sequence position starts at 0", session_row.task_sequence_position == 0)
db.close()

r = client.get(f"/sessions/{session_id}/next-task", headers=headers)
check("first next-task call succeeds", r.status_code == 200, r.text)
task1 = r.json()
check("first task is data_validation (sequence[0])", task1["type"] == "data_validation")
check("first task carries sequence_index=0", task1["sequence_index"] == 0)
check("first task carries sequence_total matching the configured sequence length", task1["sequence_total"] == len(DEFAULT_TASK_SEQUENCE))

# ── 4: client cannot override the task type via the query param ───────────
r = client.get(f"/sessions/{session_id}/next-task?task_type=email_writing", headers=headers)
check(
    "client-supplied task_type is ignored once a sequence is active (still data_validation)",
    r.status_code == 200 and r.json()["type"] == "data_validation",
    r.text,
)
check("the SAME task row is returned, not a second one generated", r.json()["id"] == task1["id"])

# ── 10: refresh returns the same active task (repeat the same call again) ─
r = client.get(f"/sessions/{session_id}/next-task", headers=headers)
check("a repeated fetch (simulated refresh) returns the identical task id", r.json()["id"] == task1["id"])

# ── 8: future task cannot be accessed (no task exists yet for position 2+) ─
r = client.get(f"/tasks/{task1['id']}/complete")  # sanity: wrong verb/no auth just to keep client warm
future_probe = client.get(f"/sessions/{session_id}/tasks", headers=headers)
check("no task exists yet for a future sequence position", len(future_probe.json()) == 1)

# ── 5-6: completing task #1 activates task #2, in the configured order ────
result1 = complete_current(task1, headers)
check("task #1 completion returns a real score", result1["content_score"] is not None)

r = client.get(f"/sessions/{session_id}/next-task", headers=headers)
check("next-task call after completion succeeds", r.status_code == 200, r.text)
task2 = r.json()
check("second task is data_validation again (sequence[1])", task2["type"] == "data_validation")
check("second task carries sequence_index=1", task2["sequence_index"] == 1)
check("second task is a genuinely different row than the first", task2["id"] != task1["id"])

db = SessionLocal()
session_row = db.query(SessionModel).filter(SessionModel.id == session_id).first()
check("sequence position advanced to 1 after one completion", session_row.task_sequence_position == 1)
db.close()

# ── 7: previous (completed) task cannot be reopened/re-completed ──────────
r = client.post(f"/tasks/{task1['id']}/complete", headers=headers, json={"flagged_ids": []})
check("re-completing the already-completed task #1 is rejected", r.status_code == 400, r.text)

# ── 9: duplicate completion cannot advance the sequence twice ─────────────
# task2 is now active; complete it once for real, then attempt again.
result2 = complete_current(task2, headers)
db = SessionLocal()
session_row = db.query(SessionModel).filter(SessionModel.id == session_id).first()
position_after_first_complete = session_row.task_sequence_position
db.close()
check("sequence position advanced to 2 after completing task #2", position_after_first_complete == 2)

r = client.post(f"/tasks/{task2['id']}/complete", headers=headers, json={"flagged_ids": []})
check("duplicate completion of task #2 is rejected (already completed)", r.status_code == 400, r.text)
db = SessionLocal()
session_row = db.query(SessionModel).filter(SessionModel.id == session_id).first()
check("sequence position did NOT advance a second time from the duplicate attempt", session_row.task_sequence_position == 2)
db.close()

# ── continue to the end of the sequence (positions 2..5): document_organization x2, email_writing, urgent_request
task_types_seen = [task1["type"], task2["type"]]
current = client.get(f"/sessions/{session_id}/next-task", headers=headers).json()
while True:
    task_types_seen.append(current["type"])
    complete_current(current, headers)
    r = client.get(f"/sessions/{session_id}/next-task", headers=headers)
    if r.status_code != 200:
        break
    current = r.json()

check("all six tasks were produced in the exact configured order", task_types_seen == DEFAULT_TASK_SEQUENCE, str(task_types_seen))

# ── 12: final task completion transitions the session to debriefing ───────
db = SessionLocal()
session_row = db.query(SessionModel).filter(SessionModel.id == session_id).first()
check("session phase is debriefing once the sequence is exhausted", session_row.current_phase == SessionPhase.debriefing)
db.close()

r = client.get(f"/sessions/{session_id}/next-task", headers=headers)
check("requesting a next task after the sequence is complete is rejected (409)", r.status_code == 409, r.text)

# ── 14: sequence_index is persisted correctly on every Task row ───────────
db = SessionLocal()
all_tasks = (
    db.query(Task)
    .filter(Task.session_id == session_row.id)
    .order_by(Task.sequence_index.asc())
    .all()
)
check(
    "every completed task has the correct, distinct sequence_index (0..5)",
    [t.sequence_index for t in all_tasks] == list(range(len(DEFAULT_TASK_SEQUENCE))),
    str([t.sequence_index for t in all_tasks]),
)
db.close()

# ── 17-18: urgent_request generation + completion/scoring work for real ───
urgent_task = next((t for t in all_tasks if t.type.value == "urgent_request"), None)
check("a real urgent_request task was generated as part of the sequence", urgent_task is not None)
if urgent_task is not None:
    check("urgent_request instance_data has the real backend contract shape", "options" in (urgent_task.instance_data or {}) and "correct_action" in (urgent_task.instance_data or {}))
    check("urgent_request was scored (content_score is not null)", urgent_task.content_score is not None)


# ── 13: global timeout prevents new task assignment ────────────────────────
headers_b = register_and_login("timeout")
session_b_id = create_session(headers_b)
db = SessionLocal()
session_b = db.query(SessionModel).filter(SessionModel.id == session_b_id).first()
session_b.started_at = datetime.utcnow() - timedelta(seconds=session_b.max_duration_seconds + 60)
db.add(session_b)
db.commit()
db.close()

r = client.get(f"/sessions/{session_b_id}/next-task", headers=headers_b)
check("next-task is rejected once global simulation time has expired", r.status_code == 409, r.text)
db = SessionLocal()
session_b = db.query(SessionModel).filter(SessionModel.id == session_b_id).first()
check("global timeout transitions the session to debriefing", session_b.current_phase == SessionPhase.debriefing)
db.close()


# ── 15-16: ownership enforcement, another user cannot access this session ─
headers_c = register_and_login("intruder")
r = client.get(f"/sessions/{session_id}/next-task", headers=headers_c)
check("another user cannot fetch this session's current task", r.status_code == 403, r.text)

r = client.post(f"/tasks/{all_tasks[0].id}/complete", headers=headers_c, json={"flagged_ids": []})
check("another user cannot complete a task belonging to this session", r.status_code == 403, r.text)

r = client.get(f"/sessions/{session_id}/next-task")  # no auth header at all
check("an unauthenticated request is rejected", r.status_code == 401, r.text)


# ── legacy/manual session (no configured sequence) keeps the old behavior ──
headers_d = register_and_login("legacy")
session_d_id = create_session(headers_d)
db = SessionLocal()
session_d = db.query(SessionModel).filter(SessionModel.id == session_d_id).first()
session_d.task_sequence = None
db.add(session_d)
db.commit()
db.close()

r = client.get(f"/sessions/{session_d_id}/next-task?task_type=document_organization", headers=headers_d)
check(
    "a session with no configured sequence still honors an explicit task_type (legacy behavior preserved)",
    r.status_code == 200 and r.json()["type"] == "document_organization",
    r.text,
)
check("legacy-session task has no sequence_index (outside the sequence)", r.json().get("sequence_index") is None)


total = len(results)
passed = sum(results)
print(f"\n{passed}/{total} checks passed")
if passed != total:
    sys.exit(1)
