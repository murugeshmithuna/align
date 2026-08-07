from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import ADMIN_EMAILS
from app.database import get_db

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(requester_id: int, db: Session) -> models.User:
    requester = db.get(models.User, requester_id)
    if requester is None or requester.email.lower() not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Admin access required")
    return requester


def _count(db: Session, model, user_id: int) -> int:
    return db.scalar(select(func.count()).select_from(model).where(model.user_id == user_id)) or 0


@router.get("/users", response_model=list[schemas.AdminUserSummary])
def list_all_users(requester_id: int, db: Session = Depends(get_db)):
    _require_admin(requester_id, db)
    users = db.scalars(select(models.User).order_by(models.User.created_at.desc())).all()
    return [
        schemas.AdminUserSummary(
            id=u.id,
            name=u.name,
            email=u.email,
            created_at=u.created_at,
            signed_in_with_google=u.google_sub is not None,
            plan_count=_count(db, models.Plan, u.id),
            log_count=_count(db, models.WorkoutLog, u.id),
            meal_count=_count(db, models.MealAnalysis, u.id),
            checkin_count=_count(db, models.CheckIn, u.id),
        )
        for u in users
    ]


@router.get("/users/{user_id}", response_model=schemas.AdminUserDetail)
def get_user_detail(user_id: int, requester_id: int, db: Session = Depends(get_db)):
    _require_admin(requester_id, db)
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    plans = db.scalars(
        select(models.Plan).where(models.Plan.user_id == user_id).order_by(models.Plan.created_at.desc())
    ).all()
    logs = db.scalars(
        select(models.WorkoutLog)
        .where(models.WorkoutLog.user_id == user_id)
        .order_by(models.WorkoutLog.performed_at.desc())
        .limit(20)
    ).all()
    meals = db.scalars(
        select(models.MealAnalysis)
        .where(models.MealAnalysis.user_id == user_id)
        .order_by(models.MealAnalysis.analyzed_at.desc())
        .limit(20)
    ).all()
    checkins = db.scalars(
        select(models.CheckIn)
        .where(models.CheckIn.user_id == user_id)
        .order_by(models.CheckIn.checkin_date.desc())
        .limit(20)
    ).all()
    soreness_notes = db.scalars(
        select(models.SorenessNote)
        .where(models.SorenessNote.user_id == user_id)
        .order_by(models.SorenessNote.noted_at.desc())
        .limit(20)
    ).all()

    return schemas.AdminUserDetail(
        user=schemas.UserOut.model_validate(user),
        plans=[schemas.PlanOut.model_validate(p) for p in plans],
        recent_logs=[schemas.LogOut.model_validate(log) for log in logs],
        recent_meals=[schemas.MealAnalysisOut.model_validate(m) for m in meals],
        recent_checkins=[schemas.CheckInOut.model_validate(c) for c in checkins],
        recent_soreness_notes=[schemas.SorenessNoteOut.model_validate(s) for s in soreness_notes],
    )
