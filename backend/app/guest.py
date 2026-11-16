"""Read-only enforcement, plus seed/reset data, for the shared public demo
account (see routers/auth.py's POST /auth/guest and POST /auth/guest/reset).

The guest account is one fixed, shared row every "Try demo" visitor signs
in as - real enough to render a genuine dashboard/fatigue chart/coach
reply, but writable by nobody, since any visitor's edit would otherwise be
visible to the next visitor. `block_guest_writes` is a drop-in replacement
for `get_current_user` on every route that persists a change (profile
save, check-in, log/plan/soreness-note creation, plan activation, meal
save, live-session-form submission, applying a Coach Resolution).

The agent chat endpoints are a separate case: a guest should still get a
real conversational reply and read-only tool calls (ask_schedule,
analyze_form, ask_nutrition, suggest_supplements), just never one of the
tools that actually writes. That's enforced once, at the single real
tool-execution chokepoint (orchestrator.py's `_run_tool`), not by blocking
the whole chat endpoint - see `WRITE_TOOL_NAMES` below.
"""

from datetime import timedelta

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.config import GUEST_EMAIL
from app.models import _today, _utcnow
from app.user_auth import get_current_user

GUEST_READ_ONLY_MESSAGE = (
    "This is a shared, read-only demo account - sign in with your own Google account to save changes."
)

# Every tool that writes to the database - kept in one place so
# orchestrator.py's _run_tool can block exactly these for the guest account
# without needing to know anything else about what each tool does.
WRITE_TOOL_NAMES = {"generate_workout_plan", "adjust_plan", "log_workout", "update_log", "delete_log"}


def is_guest(user: models.User) -> bool:
    return user.email.lower() == GUEST_EMAIL.lower()


def block_guest_writes(current_user: models.User = Depends(get_current_user)) -> models.User:
    if is_guest(current_user):
        raise HTTPException(status_code=403, detail=GUEST_READ_ONLY_MESSAGE)
    return current_user


def get_or_create_guest_user(db: Session) -> models.User:
    """Idempotent - safe to call on every /auth/guest hit. Only creates the
    row and its baseline profile the first time; never touches it again
    here (real history seeding is reseed_guest_data's job, run separately
    so a sign-in never accidentally wipes a demo mid-visit)."""
    user = db.scalar(select(models.User).where(models.User.email == GUEST_EMAIL))
    if user:
        return user

    user = models.User(
        name="Demo Account",
        email=GUEST_EMAIL,
        experience_level="intermediate",
        target_frequency=4,
        available_equipment_csv="Barbell,Dumbbells,Bodyweight",
        primary_goals_csv="Strength,Muscle Gain",
        height_cm=178.0,
        weight_kg=82.0,
        preferred_units="imperial",
        age=29,
        sex="male",
        activity_level="moderate",
        daily_calorie_target=2800,
        daily_protein_target=180.0,
        daily_carbs_target=300.0,
        daily_fat_target=80.0,
        daily_fiber_target=32.0,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# Realistic progressive-overload squat series (3x/week) plus a couple of
# accessory lifts, the same pattern CLAUDE.md's own live-verification
# sections describe seeding to exercise the fatigue model and PR detection -
# reused here for the exact same reason: real, varied, physiologically
# sensible numbers a recruiter can actually explore, not placeholder rows.
_DEMO_EXERCISES = [
    ("Back Squat", "Legs", "Barbell"),
    ("Bench Press", "Push", "Barbell"),
    ("Deadlift", "Pull", "Barbell"),
    ("Pull-Up", "Pull", "Bodyweight"),
    ("Overhead Press", "Push", "Barbell"),
]


def _get_or_create_exercise(db: Session, name: str, muscle_group: str, equipment: str) -> models.Exercise:
    exercise = db.scalar(select(models.Exercise).where(models.Exercise.name == name))
    if exercise:
        return exercise
    exercise = models.Exercise(name=name, muscle_group=muscle_group, equipment=equipment)
    db.add(exercise)
    db.commit()
    db.refresh(exercise)
    return exercise


def reseed_guest_data(db: Session) -> None:
    """Wipes and rebuilds three weeks of realistic history for the guest
    account - the actual "reset script" the demo depends on to stay clean
    across visitors, callable both by scripts/seed_guest.py (first manual
    seed) and POST /auth/guest/reset (the scheduled job, see
    .github/workflows/reset-guest-demo.yml)."""
    user = get_or_create_guest_user(db)
    exercises = {name: _get_or_create_exercise(db, name, mg, eq) for name, mg, eq in _DEMO_EXERCISES}

    # Wipe this account's own history only - never touches another user's
    # rows, and never touches the shared Exercise catalog itself.
    db.query(models.WorkoutLog).filter(models.WorkoutLog.user_id == user.id).delete()
    db.query(models.PlanExercise).filter(
        models.PlanExercise.plan_id.in_(select(models.Plan.id).where(models.Plan.user_id == user.id))
    ).delete(synchronize_session=False)
    db.query(models.Plan).filter(models.Plan.user_id == user.id).delete()
    db.query(models.CheckIn).filter(models.CheckIn.user_id == user.id).delete()
    db.query(models.MealAnalysis).filter(models.MealAnalysis.user_id == user.id).delete()
    db.query(models.SorenessNote).filter(models.SorenessNote.user_id == user.id).delete()
    db.commit()

    today = _today()

    plan = models.Plan(user_id=user.id, name="Upper/Lower Strength Split", is_active=True)
    plan.plan_exercises = [
        models.PlanExercise(exercise_id=exercises["Back Squat"].id, day_of_week=0, sets=5, reps=5, target_weight=225, order_index=0),
        models.PlanExercise(exercise_id=exercises["Bench Press"].id, day_of_week=0, sets=5, reps=5, target_weight=165, order_index=1),
        models.PlanExercise(exercise_id=exercises["Deadlift"].id, day_of_week=2, sets=3, reps=5, target_weight=275, order_index=0),
        models.PlanExercise(exercise_id=exercises["Pull-Up"].id, day_of_week=2, sets=4, reps=8, order_index=1),
        models.PlanExercise(exercise_id=exercises["Overhead Press"].id, day_of_week=4, sets=5, reps=5, target_weight=105, order_index=0),
    ]
    db.add(plan)
    db.commit()
    db.refresh(plan)

    # 21 days of history ending today: squats progress steadily (so PR
    # detection and the Banister fitness/fatigue chart both have something
    # real to show), bench/deadlift/press rotate in on their plan days.
    squat_start_weight = 185.0
    for days_ago in range(20, -1, -1):
        day = today - timedelta(days=days_ago)
        weekday = day.weekday()  # Monday=0
        if weekday == 0:
            progressed = squat_start_weight + (20 - days_ago) * 2.0
            db.add(models.WorkoutLog(
                user_id=user.id, exercise_id=exercises["Back Squat"].id, plan_id=plan.id,
                performed_at=_utcnow() - timedelta(days=days_ago), sets=5, reps=5, weight=round(progressed, 1), rpe=8,
            ))
            db.add(models.WorkoutLog(
                user_id=user.id, exercise_id=exercises["Bench Press"].id, plan_id=plan.id,
                performed_at=_utcnow() - timedelta(days=days_ago), sets=5, reps=5, weight=165, rpe=7,
            ))
        elif weekday == 2:
            db.add(models.WorkoutLog(
                user_id=user.id, exercise_id=exercises["Deadlift"].id, plan_id=plan.id,
                performed_at=_utcnow() - timedelta(days=days_ago), sets=3, reps=5, weight=275, rpe=8,
            ))
            db.add(models.WorkoutLog(
                user_id=user.id, exercise_id=exercises["Pull-Up"].id, plan_id=plan.id,
                performed_at=_utcnow() - timedelta(days=days_ago), sets=4, reps=8, weight=None, rpe=7,
            ))
        elif weekday == 4:
            db.add(models.WorkoutLog(
                user_id=user.id, exercise_id=exercises["Overhead Press"].id, plan_id=plan.id,
                performed_at=_utcnow() - timedelta(days=days_ago), sets=5, reps=5, weight=105, rpe=7,
            ))

        # Readiness check-ins most days, with one genuinely sore/low day to
        # give the fatigue model's injury-risk read something real to flag.
        if days_ago % 2 == 0:
            score = 2 if days_ago == 6 else 4
            db.add(models.CheckIn(
                user_id=user.id, checkin_date=day, score=score,
                plan_status="scaled_down" if score <= 2 else "normal",
            ))

    db.add(models.SorenessNote(
        user_id=user.id, noted_at=_utcnow() - timedelta(days=6),
        muscle_group="Legs", severity=4, notes="Quads still sore from Monday's squats.",
    ))

    meals = [
        ("Grilled chicken breast, brown rice, steamed broccoli", 620, 52.0, 58.0, 14.0,
         "High protein, balanced carbs.", "Solid post-workout meal.", "Good timing after a lift."),
        ("Greek yogurt with berries and granola", 380, 24.0, 48.0, 9.0,
         "Protein-forward breakfast.", "Add a scoop of nut butter for more fat.", "Great pre-workout option."),
        ("Salmon, quinoa, roasted asparagus", 580, 44.0, 42.0, 22.0,
         "Great omega-3 source.", "One of your best-balanced meals this week.", "Works well any time of day."),
    ]
    for days_ago, (desc, cal, protein, carbs, fat, summary, tip, timing) in zip([1, 2, 4], meals, strict=True):
        db.add(models.MealAnalysis(
            user_id=user.id, analyzed_at=_utcnow() - timedelta(days=days_ago),
            description=desc, estimated_calories=cal, protein_g=protein, carbs_g=carbs, fat_g=fat,
            macro_summary=summary, quick_tip=tip, timing_note=timing,
        ))

    db.commit()
