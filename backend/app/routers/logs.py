from collections import defaultdict

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


@router.get("/user/{user_id}/progress", response_model=schemas.ProgressOut)
def get_progress(user_id: int, db: Session = Depends(get_db)):
    if not db.get(models.User, user_id):
        raise HTTPException(status_code=404, detail="User not found")

    stmt = (
        select(models.WorkoutLog, models.Exercise.name)
        .join(models.Exercise, models.WorkoutLog.exercise_id == models.Exercise.id)
        .where(models.WorkoutLog.user_id == user_id)
        .order_by(models.WorkoutLog.performed_at.asc())
    )
    rows = db.execute(stmt).all()

    volume_by_date: dict = defaultdict(float)
    exercise_names: dict[int, str] = {}
    exercise_history: dict[int, list[dict]] = defaultdict(list)
    running_max: dict[int, float] = {}

    for log, exercise_name in rows:
        day = log.performed_at.date()
        volume_by_date[day] += (log.sets or 0) * (log.reps or 0) * (log.weight or 0)

        exercise_names[log.exercise_id] = exercise_name
        current_weight = log.weight or 0
        prev_max = running_max.get(log.exercise_id, 0)
        is_pr = current_weight > 0 and current_weight >= prev_max
        if current_weight > prev_max:
            running_max[log.exercise_id] = current_weight

        exercise_history[log.exercise_id].append(
            {
                "performed_at": log.performed_at,
                "weight": log.weight,
                "reps": log.reps,
                "sets": log.sets,
                "is_pr": is_pr,
            }
        )

    return {
        "volume_by_date": [{"date": d, "total_volume": v} for d, v in sorted(volume_by_date.items())],
        "exercises": [
            {"exercise_id": eid, "exercise_name": exercise_names[eid], "history": hist}
            for eid, hist in exercise_history.items()
        ],
    }
