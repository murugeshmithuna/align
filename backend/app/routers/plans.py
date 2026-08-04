from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/plans", tags=["plans"])


@router.post("", response_model=schemas.PlanOut, status_code=201)
def create_plan(payload: schemas.PlanCreate, db: Session = Depends(get_db)):
    if not db.get(models.User, payload.user_id):
        raise HTTPException(status_code=404, detail="User not found")

    plan = models.Plan(user_id=payload.user_id, name=payload.name, notes=payload.notes)
    for pe in payload.plan_exercises:
        if not db.get(models.Exercise, pe.exercise_id):
            raise HTTPException(status_code=404, detail=f"Exercise {pe.exercise_id} not found")
        plan.plan_exercises.append(models.PlanExercise(**pe.model_dump()))

    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.get("/user/{user_id}", response_model=list[schemas.PlanOut])
def list_plans_for_user(user_id: int, db: Session = Depends(get_db)):
    return db.scalars(select(models.Plan).where(models.Plan.user_id == user_id)).all()


@router.get("/{plan_id}", response_model=schemas.PlanOut)
def get_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.get(models.Plan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan
