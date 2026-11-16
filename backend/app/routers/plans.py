from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.guest import block_guest_writes
from app.user_auth import get_current_user

router = APIRouter(prefix="/plans", tags=["plans"])


@router.post("", response_model=schemas.PlanOut, status_code=201)
def create_plan(
    payload: schemas.PlanCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(block_guest_writes),
):
    plan = models.Plan(user_id=current_user.id, name=payload.name, notes=payload.notes)
    for pe in payload.plan_exercises:
        if not db.get(models.Exercise, pe.exercise_id):
            raise HTTPException(status_code=404, detail=f"Exercise {pe.exercise_id} not found")
        plan.plan_exercises.append(models.PlanExercise(**pe.model_dump()))

    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.get("", response_model=list[schemas.PlanOut])
def list_my_plans(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(models.Plan).where(models.Plan.user_id == current_user.id)).all()


def _get_owned_plan_or_404(db: Session, plan_id: int, current_user: models.User) -> models.Plan:
    # 404, not 403, on a plan that exists but belongs to someone else - this
    # avoids confirming to the caller that a given plan_id exists at all for
    # another account.
    plan = db.get(models.Plan, plan_id)
    if not plan or plan.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.get("/{plan_id}", response_model=schemas.PlanOut)
def get_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return _get_owned_plan_or_404(db, plan_id, current_user)


@router.patch("/{plan_id}/activate", response_model=schemas.PlanOut)
def activate_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(block_guest_writes),
):
    plan = _get_owned_plan_or_404(db, plan_id, current_user)

    other_plans = db.scalars(
        select(models.Plan).where(models.Plan.user_id == current_user.id, models.Plan.id != plan_id)
    ).all()
    for other in other_plans:
        other.is_active = False
    plan.is_active = True

    db.commit()
    db.refresh(plan)
    return plan
