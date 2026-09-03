"""Eyeball verification for the two new read-only endpoints' underlying
queries: GET /sessions/{id}/manager-messages and
GET /sessions/{id}/performance-snapshot.

Not an assert-based test -- prints raw DB rows alongside what the route
would actually return (including the Pydantic schema round-trip), so a
human can check both the query and the serialization by hand.
Run: python tests/verify_manager_endpoints.py
"""
import os
import sys
import uuid
from dataclasses import asdict

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.manager_message import ManagerMessage
from app.orchestrators.performance_tracker import get_performance_snapshot
from app.schemas.manager_message import ManagerMessageOut
from app.schemas.performance_snapshot import PerformanceSnapshotOut

# A real session with genuine ManagerMessage history (9 rows, mix of
# trigger events/tones), found via a live DB query rather than constructed.
REAL_SESSION_ID = uuid.UUID("92735385-df94-4255-b57a-8b964d537081")

db = SessionLocal()

print(f"--- manager-messages: session {REAL_SESSION_ID} ---")
rows = (
    db.query(ManagerMessage)
    .filter(ManagerMessage.session_id == REAL_SESSION_ID)
    .order_by(ManagerMessage.sent_at.asc())
    .all()
)
print(f"  {len(rows)} row(s), oldest first")
for r in rows:
    print(
        f"  sent_at={r.sent_at} | tone={r.tone.value} | was_fallback={r.was_fallback} | "
        f"trigger={r.trigger_context.get('event_type') if r.trigger_context else None} | "
        f"content={r.content[:70]!r}"
    )

# Confirm the route's actual return path (ORM rows -> response_model=List[ManagerMessageOut])
# serializes cleanly, same object FastAPI would produce.
serialized = [ManagerMessageOut.model_validate(r) for r in rows]
print(f"  Pydantic round-trip OK: {len(serialized)} of {len(rows)} rows validated")
print()

print(f"--- performance-snapshot: session {REAL_SESSION_ID} ---")
snapshot = get_performance_snapshot(db, REAL_SESSION_ID, window_size=4)
print(f"  raw dataclass: {snapshot}")
out = PerformanceSnapshotOut(**asdict(snapshot))
print(f"  schema round-trip: {out.model_dump()}")

db.close()
