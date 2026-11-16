from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.models import _today, plan_status_for_score
from app.user_auth import get_current_user

router = APIRouter(prefix="/user", tags=["checkin"])


@router.post("/checkin", response_model=schemas.CheckInOut)
def submit_checkin(
    payload: schemas.CheckInCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    today = _today()
    status = plan_status_for_score(payload.score)
    checkin = db.scalar(
        select(models.CheckIn).where(
            models.CheckIn.user_id == current_user.id,
            models.CheckIn.checkin_date == today,
        )
    )
    if checkin:
        checkin.score = payload.score
        checkin.plan_status = status
    else:
        checkin = models.CheckIn(
            user_id=current_user.id, checkin_date=today, score=payload.score, plan_status=status
        )
        db.add(checkin)

    db.commit()
    db.refresh(checkin)
    return checkin


@router.get("/checkin/today", response_model=schemas.CheckInOut)
def get_todays_checkin(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    checkin = db.scalar(
        select(models.CheckIn).where(
            models.CheckIn.user_id == current_user.id,
            models.CheckIn.checkin_date == _today(),
        )
    )
    if not checkin:
        raise HTTPException(status_code=404, detail="No check-in submitted today")
    return checkin


@router.get("/checkin/history", response_model=list[schemas.CheckInOut])
def get_checkin_history(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Every check-in a user has ever submitted, most recent first - unlike
    /checkin/today (single row, 404 if unset), this is a read-only list used
    by the Calendar page to mark which past days had a readiness check-in."""
    stmt = (
        select(models.CheckIn)
        .where(models.CheckIn.user_id == current_user.id)
        .order_by(models.CheckIn.checkin_date.desc())
    )
    return db.scalars(stmt).all()
