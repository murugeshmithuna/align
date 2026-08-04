from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.models import _today, plan_status_for_score

router = APIRouter(prefix="/user", tags=["checkin"])


@router.post("/checkin", response_model=schemas.CheckInOut)
def submit_checkin(payload: schemas.CheckInCreate, db: Session = Depends(get_db)):
    if not db.get(models.User, payload.user_id):
        raise HTTPException(status_code=404, detail="User not found")
    if not 1 <= payload.score <= 5:
        raise HTTPException(status_code=422, detail="score must be between 1 and 5")

    today = _today()
    status = plan_status_for_score(payload.score)
    checkin = db.scalar(
        select(models.CheckIn).where(
            models.CheckIn.user_id == payload.user_id,
            models.CheckIn.checkin_date == today,
        )
    )
    if checkin:
        checkin.score = payload.score
        checkin.plan_status = status
    else:
        checkin = models.CheckIn(
            user_id=payload.user_id, checkin_date=today, score=payload.score, plan_status=status
        )
        db.add(checkin)

    db.commit()
    db.refresh(checkin)
    return checkin


@router.get("/checkin/today/{user_id}", response_model=schemas.CheckInOut)
def get_todays_checkin(user_id: int, db: Session = Depends(get_db)):
    if not db.get(models.User, user_id):
        raise HTTPException(status_code=404, detail="User not found")

    checkin = db.scalar(
        select(models.CheckIn).where(
            models.CheckIn.user_id == user_id,
            models.CheckIn.checkin_date == _today(),
        )
    )
    if not checkin:
        raise HTTPException(status_code=404, detail="No check-in submitted today")
    return checkin
