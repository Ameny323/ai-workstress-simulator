import uuid

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError

from app.core.config import CORS_ORIGINS
from app.core.security import decode_access_token
from app.database import SessionLocal
from app.api import auth, sessions, tasks, email_prioritization
from app.models.session import Session as SessionModel
from app.ws.connection_manager import manager as ws_manager

app = FastAPI(title="AI Work Stress Simulator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
app.include_router(tasks.router, tags=["tasks"])
app.include_router(email_prioritization.router, tags=["email-prioritization"])


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}


@app.websocket("/ws/sessions/{session_id}")
async def websocket_session(websocket: WebSocket, session_id: uuid.UUID, token: str):
    """Minimal WebSocket channel for Task 02's real-time aria_message /
    state_update pushes (app/orchestrators/email_event_pipeline.py). Auth
    reuses the exact same JWT decode as get_current_user -- a browser
    WebSocket can't send a normal Authorization header, so the token comes
    as a query param instead, but it's the same token/same decode function.
    """
    db = SessionLocal()
    try:
        try:
            payload = decode_access_token(token)
            user_id = payload.get("sub")
            if user_id is None:
                raise JWTError("missing sub claim")
        except JWTError:
            await websocket.close(code=4401)
            return

        session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if not session or str(session.user_id) != user_id:
            await websocket.close(code=4403)
            return
    finally:
        db.close()

    await ws_manager.connect(session_id, websocket)
    try:
        while True:
            # This channel is push-only (server -> client); any client
            # message is just ignored, we only need receive() to detect
            # disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(session_id, websocket)
