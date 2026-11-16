from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.guest import block_guest_writes
from app.user_auth import get_current_user

router = APIRouter(prefix="/soreness", tags=["soreness"])


@router.post("", response_model=schemas.SorenessNoteOut, status_code=201)
def create_soreness_note(
    payload: schemas.SorenessNoteCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(block_guest_writes),
):
    if not 1 <= payload.severity <= 5:
        raise HTTPException(status_code=422, detail="severity must be between 1 and 5")

    note = models.SorenessNote(user_id=current_user.id, **payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.get("", response_model=list[schemas.SorenessNoteOut])
def list_my_soreness(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = (
        select(models.SorenessNote)
        .where(models.SorenessNote.user_id == current_user.id)
        .order_by(models.SorenessNote.noted_at.desc())
    )
    return db.scalars(stmt).all()
