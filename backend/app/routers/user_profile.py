import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.agent.orchestrator import run_agent_turn
from app.database import get_db

router = APIRouter(prefix="/user", tags=["user-profile"])
logger = logging.getLogger(__name__)


@router.post("/profile", response_model=schemas.UserOut)
def upsert_user_profile(payload: schemas.UserProfileUpdate, db: Session = Depends(get_db)):
    user = db.get(models.User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    for field, value in payload.model_dump(exclude={"user_id"}, exclude_unset=True).items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)

    # The baseline plan must exist automatically from profile settings, with
    # no chat message required - generate one the first time onboarding
    # completes (i.e. no plan exists yet). Re-saving the profile later never
    # regenerates it; that's what the chat's adjust_plan tool is for.
    has_plan = db.scalar(select(models.Plan).where(models.Plan.user_id == user.id)) is not None
    if user.experience_level and not has_plan:
        try:
            run_agent_turn(db, user.id, "Generate my baseline workout plan from my saved profile.")
        except Exception:
            logger.exception("Baseline plan auto-generation failed for user %s", user.id)

    return user


@router.get("/profile/{user_id}", response_model=schemas.UserOut)
def get_user_profile(user_id: int, db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
