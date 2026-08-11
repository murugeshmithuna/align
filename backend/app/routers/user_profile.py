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
    # regenerates it; from then on, all plan changes go through Coach
    # Resolution exclusively (the general chat no longer has generate_
    # workout_plan/adjust_plan in its own tool list at all - see
    # orchestrator.py's _tools_for_chat). allow_plan_tools=True is what lets
    # THIS specific internal call still use generate_workout_plan - it runs
    # before the user has ever seen a plan to send to Coach Resolution about.
    has_plan = db.scalar(select(models.Plan).where(models.Plan.user_id == user.id)) is not None
    if user.experience_level and not has_plan:
        try:
            # Explicit and directive on purpose: a vaguer prompt here ("generate
            # my baseline plan") once produced a single-exercise "starter" plan
            # ("Arm Starter" - just a bicep curl, with notes promising to "build
            # this out into a full weekly program whenever you're ready") that
            # the user then had no chat turn to correct, since this call is
            # synchronous and never shown to them. This is the ONE call in the
            # whole app that has no back-and-forth to fall back on, so it has to
            # ask for a genuinely complete plan up front, not a placeholder.
            frequency = user.target_frequency or 3
            run_agent_turn(
                db,
                user.id,
                "Generate my complete baseline workout plan from my saved profile. It must be a full, "
                f"ready-to-follow program covering exactly {frequency} distinct training days per week "
                "(spread across different days of the week, not stacked on one day), with a balanced set "
                "of 4-6 exercises per training day appropriate to my goals, experience level, and "
                "available equipment. Do not create a single-exercise placeholder or 'starter' plan - "
                "this is the only plan I will have until I ask for changes.",
                allow_plan_tools=True,
            )
        except Exception:
            logger.exception("Baseline plan auto-generation failed for user %s", user.id)

    return user


@router.get("/profile/{user_id}", response_model=schemas.UserOut)
def get_user_profile(user_id: int, db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
