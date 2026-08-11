import logging

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
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


@router.delete("/{exercise_id}", status_code=204)
def delete_exercise(exercise_id: int, db: Session = Depends(get_db)):
    """Removes a bad shared-catalog entry - real need: name validation
    (added above) only stops NEW junk from being created, it doesn't clean
    up anything that got in before validation existed (e.g. "banana
    smoothie", created and logged against on production before this
    endpoint or the validation check existed). A catalog entry can already
    be referenced by real logs/plan_exercises by the time someone notices
    it's bad, so this cascades to remove those too - if the exercise itself
    was never valid, anything logged against it is equally invalid, not
    real history worth preserving. This is a deliberate, rare cleanup
    action (an admin manually removing a bad catalog row), not routine data
    management, which is why a cascade is acceptable here but not
    elsewhere."""
    exercise = db.get(models.Exercise, exercise_id)
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")

    db.execute(delete(models.WorkoutLog).where(models.WorkoutLog.exercise_id == exercise_id))
    db.execute(delete(models.PlanExercise).where(models.PlanExercise.exercise_id == exercise_id))
    db.delete(exercise)
    db.commit()
