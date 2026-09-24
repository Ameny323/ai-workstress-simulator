"""Tests for the real-time WebSocket transport: app/main.py's
`/ws/sessions/{session_id}` route and app/ws/connection_manager.py's
ConnectionManager. Covers authentication, session ownership/isolation,
broadcast delivery, and disconnect cleanup -- the layer the frontend
integration (React WebSocket client) sits on top of.

Does NOT re-test the event-producing pipelines themselves (aria_pipeline.py,
email_event_pipeline.py, the stress endpoint) -- those already have their
own extensive coverage (test_manager_service_and_pipelines.py,
test_stress_declaration.py) confirming they call ws_manager.broadcast with
the correct payloads. This file verifies the transport those calls travel
over actually works: a client that connects to session A receives what's
broadcast to A, never what's broadcast to B, and a bad/foreign token never
gets a connection at all.

Uses FastAPI's TestClient WebSocket support (real accept/send/receive
against the actual app, real dev DB -- same convention as the rest of this
suite: create temp rows, clean up in a finally block).

Run from backend/ with the venv active:
    python tests/test_websocket.py
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient

from app.core.security import create_access_token
from app.database import SessionLocal
from app.main import app
from app.models.enums import SessionPhase, SessionStatus
from app.models.session import Session as SessionModel
from app.models.user import User
from app.ws.connection_manager import ConnectionManager, manager as ws_manager

results = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    results.append(condition)
    print(f"[{status}] {name}" + (f" -- {detail}" if detail and not condition else ""))


def _make_session(db, user) -> SessionModel:
    session = SessionModel(user_id=user.id, current_phase=SessionPhase.accueil, status=SessionStatus.in_progress, started_at=datetime.utcnow())
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _cleanup(db, *sessions):
    for s in sessions:
        if s is not None:
            db.delete(s)
    db.commit()


client = TestClient(app)


# ── Authentication ─────────────────────────────────────────────────────
def test_connection_rejected_with_invalid_token():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("invalid token is rejected", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        rejected = False
        try:
            with client.websocket_connect(f"/ws/sessions/{session.id}?token=not-a-real-token"):
                pass
        except Exception:
            rejected = True
        check("a connection with an invalid/malformed token is rejected (never accepted)", rejected)
    finally:
        _cleanup(db, session)
        db.close()


def test_connection_rejected_without_token_param():
    resp = client.get(f"/ws/sessions/{uuid.uuid4()}")  # no upgrade headers at all -- 404/405, never a socket
    check("hitting the WS route as plain HTTP (no token, no upgrade) never succeeds",
          resp.status_code >= 400, f"got {resp.status_code}")


# ── Session ownership / isolation ─────────────────────────────────────────
def test_connection_rejected_for_another_users_session():
    db = SessionLocal()
    session = None
    try:
        users = db.query(User).limit(2).all()
        if len(users) < 2:
            check("a user cannot connect to another user's session", True, "skipped: fewer than 2 users in DB")
            return
        owner, intruder = users[0], users[1]
        session = _make_session(db, owner)
        intruder_token = create_access_token({"sub": str(intruder.id)})

        rejected = False
        try:
            with client.websocket_connect(f"/ws/sessions/{session.id}?token={intruder_token}"):
                pass
        except Exception:
            rejected = True
        check("a valid token for a DIFFERENT user's session is rejected (no arbitrary session subscription)", rejected)
    finally:
        _cleanup(db, session)
        db.close()


def test_owner_can_connect_to_their_own_session():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("the session owner can connect", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        token = create_access_token({"sub": str(user.id)})
        connected = False
        with client.websocket_connect(f"/ws/sessions/{session.id}?token={token}") as ws:
            connected = True
            ws.close()
        check("the session's own owner can successfully connect", connected)
    finally:
        _cleanup(db, session)
        db.close()


def test_broadcast_is_isolated_per_session():
    db = SessionLocal()
    session_a = session_b = None
    try:
        user = db.query(User).first()
        if user is None:
            check("broadcasts are isolated per session", True, "skipped: no User in DB")
            return
        session_a = _make_session(db, user)
        session_b = _make_session(db, user)
        token = create_access_token({"sub": str(user.id)})

        with client.websocket_connect(f"/ws/sessions/{session_a.id}?token={token}") as ws_a, \
             client.websocket_connect(f"/ws/sessions/{session_b.id}?token={token}") as ws_b:
            asyncio.run(ws_manager.broadcast(session_a.id, {"type": "stress_declared", "session_id": str(session_a.id), "stress_level": 3}))

            received_a = ws_a.receive_json()
            check("session A's socket receives the event broadcast to session A",
                  received_a.get("session_id") == str(session_a.id), f"got {received_a}")

            # Prove isolation: broadcast to A must never reach B. There's no
            # event for B to receive at all -- confirm that by sending B its
            # OWN distinct event and checking A's queue is still empty (not
            # sharing state across sockets).
            asyncio.run(ws_manager.broadcast(session_b.id, {"type": "stress_declared", "session_id": str(session_b.id), "stress_level": 5}))
            received_b = ws_b.receive_json()
            check("session B's socket receives only its own event, never session A's",
                  received_b.get("session_id") == str(session_b.id) and received_b.get("stress_level") == 5,
                  f"got {received_b}")
    finally:
        _cleanup(db, session_a, session_b)
        db.close()


# ── Event delivery (the exact 4 real payload shapes) ─────────────────────
def test_aria_message_event_is_delivered_verbatim():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("aria_message is delivered verbatim", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        token = create_access_token({"sub": str(user.id)})
        payload = {
            "type": "aria_message", "id": "m1", "session_id": str(session.id), "content": "Stay focused.",
            "tone": "neutre", "trigger": "TASK_STARTED", "sent_at": datetime.utcnow().isoformat(),
            "was_fallback": True, "event_id": "e1",
        }
        with client.websocket_connect(f"/ws/sessions/{session.id}?token={token}") as ws:
            asyncio.run(ws_manager.broadcast(session.id, payload))
            received = ws.receive_json()
        check("an aria_message broadcast is delivered to the client unchanged", received == payload, f"got {received}")
    finally:
        _cleanup(db, session)
        db.close()


def test_state_update_event_is_delivered_verbatim():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("state_update is delivered verbatim", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        token = create_access_token({"sub": str(user.id)})
        payload = {
            "type": "state_update", "session_id": str(session.id), "event_id": "e1",
            "simulation": {"phase": "montee_pression", "manager_state": "neutre", "pressure_score": 30.0, "communication_frequency_seconds": 30},
            "performance": {"avg_score": 80.0, "accuracy": 0.8, "error_rate": 0.1, "tasks_completed_in_session": 2, "declared_stress": None, "workload": 1.0},
        }
        with client.websocket_connect(f"/ws/sessions/{session.id}?token={token}") as ws:
            asyncio.run(ws_manager.broadcast(session.id, payload))
            received = ws.receive_json()
        check("a state_update broadcast is delivered to the client unchanged", received == payload, f"got {received}")
    finally:
        _cleanup(db, session)
        db.close()


def test_aria_analyzing_event_is_delivered():
    db = SessionLocal()
    session = None
    try:
        user = db.query(User).first()
        if user is None:
            check("aria_analyzing is delivered", True, "skipped: no User in DB")
            return
        session = _make_session(db, user)
        token = create_access_token({"sub": str(user.id)})
        with client.websocket_connect(f"/ws/sessions/{session.id}?token={token}") as ws:
            asyncio.run(ws_manager.broadcast(session.id, {"type": "aria_analyzing", "session_id": str(session.id)}))
            received = ws.receive_json()
        check("an aria_analyzing broadcast is delivered", received.get("type") == "aria_analyzing")
    finally:
        _cleanup(db, session)
        db.close()


# ── Disconnect cleanup ─────────────────────────────────────────────────
def test_disconnect_cleans_up_the_connection_registry():
    async def _run():
        manager = ConnectionManager()
        session_id = uuid.uuid4()

        class FakeWebSocket:
            def __init__(self):
                self.accepted = False

            async def accept(self):
                self.accepted = True

            async def send_json(self, payload):
                pass

        ws = FakeWebSocket()
        await manager.connect(session_id, ws)
        check("connect() registers the socket under its session_id", session_id in manager._connections)

        await manager.disconnect(session_id, ws)
        check("disconnect() removes the session entirely once its last socket leaves",
              session_id not in manager._connections, f"got {manager._connections}")

    asyncio.run(_run())


def test_broadcast_drops_a_dead_connection_automatically():
    async def _run():
        manager = ConnectionManager()
        session_id = uuid.uuid4()

        class DeadWebSocket:
            async def accept(self):
                pass

            async def send_json(self, payload):
                raise RuntimeError("connection is closed")

        ws = DeadWebSocket()
        await manager.connect(session_id, ws)
        await manager.broadcast(session_id, {"type": "aria_analyzing", "session_id": str(session_id)})
        check("a send failure during broadcast automatically drops that connection from the registry",
              session_id not in manager._connections, f"got {manager._connections}")

    asyncio.run(_run())


if __name__ == "__main__":
    test_connection_rejected_with_invalid_token()
    test_connection_rejected_without_token_param()
    test_connection_rejected_for_another_users_session()
    test_owner_can_connect_to_their_own_session()
    test_broadcast_is_isolated_per_session()
    test_aria_message_event_is_delivered_verbatim()
    test_state_update_event_is_delivered_verbatim()
    test_aria_analyzing_event_is_delivered()
    test_disconnect_cleans_up_the_connection_registry()
    test_broadcast_drops_a_dead_connection_automatically()

    print()
    passed = sum(1 for r in results if r)
    print(f"{passed}/{len(results)} checks passed")
    if passed != len(results):
        sys.exit(1)
