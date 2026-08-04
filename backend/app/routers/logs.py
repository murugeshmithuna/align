from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/logs", tags=["logs"])


@router.post("", response_model=schemas.LogOut, status_code=201)
def create_log(payload: schemas.LogCreate, db: Session = Depends(get_db)):
    if not db.get(models.User, payload.user_id):
        raise HTTPException(status_code=404, detail="User not found")
    if not db.get(models.Exercise, payload.exercise_id):
        raise HTTPException(status_code=404, detail="Exercise not found")
    if payload.plan_id is not None and not db.get(models.Plan, payload.plan_id):
        raise HTTPException(status_code=404, detail="Plan not found")

    log = models.WorkoutLog(**payload.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("/user/{user_id}", response_model=list[schemas.LogOut])
def list_logs_for_user(user_id: int, db: Session = Depends(get_db)):
    stmt = (
        select(models.WorkoutLog)
        .where(models.WorkoutLog.user_id == user_id)
        .order_by(models.WorkoutLog.performed_at.desc())
    )
    return db.scalars(stmt).all()
