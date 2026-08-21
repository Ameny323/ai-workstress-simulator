"""Eyeball verification for the fully-wired adaptive TaskEngine.

Three scripted sequences against real DB state (temp templates/sessions,
cleaned up after): (a) escalation under consistently high scores, (b)
de-escalation under error-heavy scores, (c) an adversarial cooldown case
constructed so that at one specific step, the rules genuinely want a
DIFFERENT pool than the one being reused — not a coincidental match.

Run: python tests/verify_adaptive_task_engine.py
"""
import os
import sys
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.enums import Priority, SessionPhase, SessionStatus, TaskDifficulty, TaskStatus, TaskType
from app.models.session import Session as SessionModel
from app.models.task_template import TaskTemplate
from app.models.user import User
from app.orchestrators.adaptation import resolve_difficulty_pool
from app.orchestrators.performance_tracker import get_performance_snapshot
from app.orchestrators.task_engine import TaskEngine, resolve_difficulty_pool_with_cooldown

db = SessionLocal()
user = db.query(User).first()
engine = TaskEngine(db)

created_templates = []
created_sessions = []


def make_template(phase, difficulty, tag):
    t = TaskTemplate(
        title=f"TEMP verify-engine {phase.value}/{difficulty.value} {tag} (will be deleted)",
        description="temp verification template",
        task_type=TaskType.data_validation,
        difficulty=difficulty,
        phase=phase,
        estimated_duration=200,
        default_priority=Priority.medium,
        instructions="temp",
        metadata_json={"row_count": 4, "record_pool": {"field_names": ["Name", "Email", "Phone"], "error_rate": 0.3}},
        is_active=True,
    )
    db.add(t)
    created_templates.append(t)
    return t


def make_session(phase):
    s = SessionModel(user_id=user.id, current_phase=phase, status=SessionStatus.in_progress)
    db.add(s)
    db.commit()
    db.refresh(s)
    created_sessions.append(s)
    return s


def complete(task, score, errors):
    task.status = TaskStatus.completed
    task.completed_at = datetime.utcnow()
    task.content_score = score
    task.error_count = errors
    db.commit()


def show_step(session, phase, label):
    snapshot = get_performance_snapshot(db, session.id)
    raw_candidate = [d.value for d in resolve_difficulty_pool(snapshot, phase)]
    # authoritative + persists if it actually changes -- exactly what
    # generate_next_task will independently arrive at moments later
    actual_pool_enum = resolve_difficulty_pool_with_cooldown(db, session, phase)
    actual_pool = [d.value for d in actual_pool_enum]
    db.refresh(session)

    print(f"  {label}")
    print(
        f"    snapshot: avg_score={snapshot.avg_score} consecutive_errors={snapshot.consecutive_errors} "
        f"window_size={snapshot.window_size} total_completed={snapshot.tasks_completed_in_session}"
    )
    print(f"    raw rule candidate (no cooldown):  {raw_candidate}")
    print(f"    actual pool in effect (cooldown):  {actual_pool}  (anchor={session.difficulty_pool_set_at_task_count})")
    if raw_candidate != actual_pool:
        print(f"    *** COOLDOWN SUPPRESSED A GENUINE CHANGE: rules want {raw_candidate}, pool stayed {actual_pool} ***")


def run_initial_task(session, phase):
    task = engine.generate_next_task(session.id, phase)
    print(f"  [initial, 0 history] difficulty={task.difficulty.value} priority={task.priority.value} deadline_seconds={task.deadline_seconds}")
    return task


def run_step(session, phase, task, score, errors, step_num):
    complete(task, score, errors)
    show_step(session, phase, f"after completion {step_num} (score={score}, errors={errors})")
    task = engine.generate_next_task(session.id, phase)
    print(f"    -> next task: difficulty={task.difficulty.value} priority={task.priority.value} deadline_seconds={task.deadline_seconds}")
    return task


try:
    print("=" * 70)
    print("SEQUENCE (a): consistently high scores -> escalation (montee_pression)")
    print("default pool=[easy,medium]; rule3 (avg>90, non-accueil)=[medium,hard]")
    print("=" * 70)
    phase_a = SessionPhase.montee_pression
    make_template(phase_a, TaskDifficulty.easy, "A")
    make_template(phase_a, TaskDifficulty.medium, "A")
    make_template(phase_a, TaskDifficulty.hard, "A")
    db.commit()

    session_a = make_session(phase_a)
    task = run_initial_task(session_a, phase_a)
    for i, score in enumerate([95, 95, 95, 95, 95], start=1):
        task = run_step(session_a, phase_a, task, score, 0, i)
    print()

    print("=" * 70)
    print("SEQUENCE (b): consistently error-heavy scores -> de-escalation (pic_charge)")
    print("default pool=[medium,hard]; rule2 (consecutive_errors>=3)=[easy,medium]")
    print("=" * 70)
    phase_b = SessionPhase.pic_charge
    make_template(phase_b, TaskDifficulty.easy, "B")
    make_template(phase_b, TaskDifficulty.medium, "B")
    make_template(phase_b, TaskDifficulty.hard, "B")
    db.commit()

    session_b = make_session(phase_b)
    task = run_initial_task(session_b, phase_b)
    for i, (score, errors) in enumerate([(20, 2), (10, 3), (10, 4), (10, 3), (10, 3)], start=1):
        task = run_step(session_b, phase_b, task, score, errors, i)
    print()

    print("=" * 70)
    print("SEQUENCE (c): adversarial cooldown test (pic_charge, reusing (b)'s templates)")
    print("Constructed so completion 4 makes the rules genuinely want a DIFFERENT")
    print("pool than the one just set at completion 3 -- cooldown must suppress it.")
    print("=" * 70)
    session_c = make_session(phase_b)
    task = run_initial_task(session_c, phase_b)
    for i, (score, errors) in enumerate([(10, 1), (10, 1), (10, 1), (95, 0), (95, 0)], start=1):
        task = run_step(session_c, phase_b, task, score, errors, i)
    print()

finally:
    for s in created_sessions:
        db.delete(s)  # cascades to delete its tasks (Session.tasks has delete-orphan)
    db.commit()
    for t in created_templates:
        db.delete(t)
    db.commit()
    print("cleaned up all temp sessions/templates")
    db.close()
