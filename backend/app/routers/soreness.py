from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/soreness", tags=["soreness"])


@router.post("", response_model=schemas.SorenessNoteOut, status_code=201)
def create_soreness_note(payload: schemas.SorenessNoteCreate, db: Session = Depends(get_db)):
    if not db.get(models.User, payload.user_id):
        raise HTTPException(status_code=404, detail="User not found")
    if not 1 <= payload.severity <= 5:
        raise HTTPException(status_code=422, detail="severity must be between 1 and 5")

    note = models.SorenessNote(**payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.get("/user/{user_id}", response_model=list[schemas.SorenessNoteOut])
def list_soreness_for_user(user_id: int, db: Session = Depends(get_db)):
    stmt = (
        select(models.SorenessNote)
        .where(models.SorenessNote.user_id == user_id)
        .order_by(models.SorenessNote.noted_at.desc())
    )
    return db.scalars(stmt).all()
