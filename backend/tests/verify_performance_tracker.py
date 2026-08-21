"""Eyeball verification for get_performance_snapshot against real + constructed data.

Not an assert-based test — prints the raw completed-task history alongside
the computed snapshot for each case, so a human can check the numbers by
hand. Run: python tests/verify_performance_tracker.py
"""
import os
import sys
import uuid
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.enums import Priority, SessionPhase, SessionStatus, TaskStatus, TaskType
from app.models.session import Session as SessionModel
from app.models.task import Task
from app.models.user import User
from app.orchestrators.performance_tracker import get_performance_snapshot


def show(db, session_id: uuid.UUID, label: str, window_size: int = 4):
    tasks = (
        db.query(Task)
        .filter(Task.session_id == session_id, Task.status == TaskStatus.completed)
        .order_by(Task.completed_at.desc())
        .all()
    )
    print(f"--- {label} ---")
    print(f"session_id: {session_id}")
    if not tasks:
        print("  (no completed tasks)")
    for t in tasks:
        print(f"  completed_at={t.completed_at} | content_score={t.content_score} | error_count={t.error_count}")

    snapshot = get_performance_snapshot(db, session_id, window_size=window_size)
    print(f"  -> {snapshot}")
    print()
    return snapshot


def make_session(db, user_id) -> SessionModel:
    s = SessionModel(user_id=user_id, current_phase=SessionPhase.accueil, status=SessionStatus.in_progress)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def make_completed_task(db, session_id, minutes_ago: float, content_score, error_count, task_type=TaskType.data_validation):
    t = Task(
        session_id=session_id,
        type=task_type,
        title="synthetic task",
        status=TaskStatus.completed,
        priority=Priority.medium,
        completed_at=datetime.utcnow() - timedelta(minutes=minutes_ago),
        content_score=content_score,
        error_count=error_count,
    )
    db.add(t)
    return t


db = SessionLocal()
user = db.query(User).first()

# Case A: a real session with genuine mixed history (some scored, some not
# — from earlier scoring tests) — eyeball this against the printed list.
show(db, uuid.UUID("4a68023c-94aa-484a-8604-d1b21dc920d0"), "A: real session, natural mixed history")

# Case B: a brand-new session with zero completed tasks.
empty_session = make_session(db, user.id)
show(db, empty_session.id, "B: brand-new session, zero completed tasks")

# Case C: completed tasks exist, but ALL of them are null-scored (simulates
# a task type with no scorer yet). window_size must report the true count
# (3), not 0 — 0 is reserved for "no completed tasks existed at all", a
# different situation from "tasks existed but weren't scorable".
null_scored_session = make_session(db, user.id)
for i in range(3):
    make_completed_task(db, null_scored_session.id, minutes_ago=3 - i, content_score=None, error_count=None, task_type=TaskType.email_writing)
db.commit()
show(db, null_scored_session.id, "C: 3 completed tasks, ALL null-scored (unscored task type)")

# Case D: constructed so "streak stopping at first clean task" and "naive
# count of error tasks in the window" would disagree, to prove which one
# the implementation actually does. Oldest -> newest: err=2, clean, err=1,
# err=5. Most-recent-first: [err=5, err=1, clean, err=2].
#   naive count-in-window (tasks with error_count > 0): 3 (err=5, err=1, err=2)
#   correct streak (stop at first clean, walking backwards): 2 (err=5, err=1 — the
#     clean task breaks the streak before ever reaching the err=2 task)
streak_session = make_session(db, user.id)
make_completed_task(db, streak_session.id, minutes_ago=4, content_score=80, error_count=2)
make_completed_task(db, streak_session.id, minutes_ago=3, content_score=100, error_count=0)  # clean, breaks the streak
make_completed_task(db, streak_session.id, minutes_ago=2, content_score=60, error_count=1)
make_completed_task(db, streak_session.id, minutes_ago=1, content_score=20, error_count=5)
db.commit()
snapshot = show(db, streak_session.id, "D: streak vs naive-count-in-window (expect streak=2, NOT naive=3)")
print(f"  naive count-in-window would be 3; streak-based consecutive_errors is {snapshot.consecutive_errors}")
print(f"  {'PASS: streak semantics confirmed' if snapshot.consecutive_errors == 2 else 'FAIL: got naive-count or something else entirely'}")

db.close()
