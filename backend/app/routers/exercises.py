from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/exercises", tags=["exercises"])


@router.post("", response_model=schemas.ExerciseOut, status_code=201)
def create_exercise(payload: schemas.ExerciseCreate, db: Session = Depends(get_db)):
    existing = db.scalar(select(models.Exercise).where(models.Exercise.name == payload.name))
    if existing:
        raise HTTPException(status_code=409, detail="An exercise with this name already exists")

    exercise = models.Exercise(**payload.model_dump())
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return exercise


@router.get("", response_model=list[schemas.ExerciseOut])
def list_exercises(db: Session = Depends(get_db)):
    return db.scalars(select(models.Exercise)).all()
