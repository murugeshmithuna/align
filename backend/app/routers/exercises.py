import logging

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.agent.exercise_validation import validate_exercise_name
from app.database import get_db

router = APIRouter(prefix="/exercises", tags=["exercises"])
logger = logging.getLogger(__name__)


@router.post("", response_model=schemas.ExerciseOut, status_code=201)
def create_exercise(payload: schemas.ExerciseCreate, db: Session = Depends(get_db)):
    existing = db.scalar(select(models.Exercise).where(models.Exercise.name == payload.name))
    if existing:
        raise HTTPException(status_code=409, detail="An exercise with this name already exists")

    # Before this, the exercise catalog had no validation anywhere - a typo
    # or a genuinely nonsensical entry (a real user asked "what if i enter
    # bananasmoothie?") would become a permanent shared catalog row that
    # then shows up in every user's exercise picker forever. Gate it with a
    # cheap forced-tool-call check (see exercise_validation.py) rather than
    # a hardcoded word list, which could never realistically cover every
    # real exercise name.
    try:
        result = validate_exercise_name(payload.name)
    except (RuntimeError, anthropic.APIError):
        logger.exception("Exercise name validation failed for %r", payload.name)
        raise HTTPException(
            status_code=503, detail="Couldn't validate this exercise name right now - please try again."
        ) from None
    if not result.get("is_valid"):
        reason = result.get("reason") or "That doesn't look like a real exercise."
        raise HTTPException(status_code=422, detail=reason)

    exercise = models.Exercise(**payload.model_dump())
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return exercise


@router.get("", response_model=list[schemas.ExerciseOut])
def list_exercises(db: Session = Depends(get_db)):
    return db.scalars(select(models.Exercise)).all()
