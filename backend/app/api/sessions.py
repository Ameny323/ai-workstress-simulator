import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.session import Session as SessionModel
from app.models.stress_declaration import StressDeclaration
from app.schemas.session import SessionOut, StressOut, StressUpdate

router = APIRouter()


def get_owned_session(
    session_id: uuid.UUID, db: DBSession, current_user: User
) -> SessionModel:
    """Fetch a session and make sure it belongs to the current user."""
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this session",
        )
    return session


@router.post("/", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def start_session(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = SessionModel(user_id=current_user.id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/", response_model=List[SessionOut])
def list_my_sessions(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(SessionModel)
        .filter(SessionModel.user_id == current_user.id)
        .order_by(SessionModel.started_at.desc())
        .all()
    )


@router.post("/{session_id}/stress", response_model=StressOut, status_code=status.HTTP_201_CREATED)
def declare_stress(
    session_id: uuid.UUID,
    payload: StressUpdate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Insert a new stress declaration. Never overwrites — the "current"
    value is whichever row is most recent, read fresh by
    get_performance_snapshot. No decay/expiry: the last value reported
    stays in effect indefinitely.
    """
    get_owned_session(session_id, db, current_user)

    declaration = StressDeclaration(session_id=session_id, stress_level=payload.stress)
    db.add(declaration)
    db.commit()
    db.refresh(declaration)

    return {"stress": declaration.stress_level, "declared_at": declaration.declared_at}
