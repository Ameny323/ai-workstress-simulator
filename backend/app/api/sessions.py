from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.session import Session as SessionModel
from app.schemas.session import SessionOut

router = APIRouter()


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
