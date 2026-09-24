"""Minimal WebSocket connection registry for real-time simulation events.

No WebSocket infrastructure existed anywhere in this project before Task
02 -- confirmed by an exhaustive grep (python-socketio/engineio/simple-
websocket are installed but completely unused, stray transitive deps).
This is deliberately the smallest thing that works: an in-memory registry
keyed by session_id, single-process. Appropriate for this project's
current scale (one uvicorn dev process, no broker) -- not a
horizontally-scalable pub/sub layer, and not meant to be one yet.
"""
import asyncio
import logging
import uuid
from typing import Any, Dict, List

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: Dict[uuid.UUID, List[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, session_id: uuid.UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.setdefault(session_id, []).append(websocket)

    async def disconnect(self, session_id: uuid.UUID, websocket: WebSocket) -> None:
        async with self._lock:
            conns = self._connections.get(session_id)
            if conns and websocket in conns:
                conns.remove(websocket)
            if conns is not None and not conns:
                self._connections.pop(session_id, None)

    async def broadcast(self, session_id: uuid.UUID, payload: Dict[str, Any]) -> None:
        conns = list(self._connections.get(session_id, []))
        for ws in conns:
            try:
                await ws.send_json(payload)
            except Exception:
                logger.warning("WebSocket broadcast failed for session %s; dropping connection", session_id)
                await self.disconnect(session_id, ws)


# One process-wide instance -- imported by both the WebSocket route
# (app/main.py) and the event pipeline (app/orchestrators/
# email_event_pipeline.py) that broadcasts into it.
manager = ConnectionManager()
