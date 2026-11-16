from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.agent.fatigue import assess_injury_risk, check_asymmetry, compute_banister_series, daily_loads
from app.database import get_db
from app.user_auth import get_current_user

router = APIRouter(prefix="/fatigue", tags=["fatigue"])


@router.get("", response_model=schemas.FatigueOut)
def get_my_fatigue(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(models.WorkoutLog).where(models.WorkoutLog.user_id == current_user.id)
    logs = db.scalars(stmt).all()

    loads = daily_loads(
        [
            {
                "performed_at": log.performed_at,
                "sets": log.sets,
                "reps": log.reps,
                "weight": log.weight,
                "rpe": log.rpe,
            }
            for log in logs
        ]
    )
    series = compute_banister_series(loads)
    risk = assess_injury_risk(series)
    return {"series": series, "risk": risk}


@router.post("/asymmetry", response_model=schemas.AsymmetryOut)
def post_asymmetry(payload: schemas.AsymmetryRequest, current_user: models.User = Depends(get_current_user)):
    try:
        return check_asymmetry(payload.left_values, payload.right_values, payload.metric_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
