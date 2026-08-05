from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.models import _today

TOOL_SCHEMAS = [
    {
        "name": "generate_workout_plan",
        "description": (
            "Create a new training plan for the current user and persist it. The user's baseline "
            "profile (experience level, target frequency, available equipment, primary goals, "
            "physical limitations) is already provided as context - use it to choose appropriate "
            "exercises, sets/reps, and weekly frequency without asking the user to repeat any of it. "
            "Use this when the user wants a new plan or a full program, not a tweak to an existing one."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "plan_name": {"type": "string", "description": "Short name for the plan"},
                "notes": {"type": "string", "description": "Rationale or coaching notes for this plan"},
                "exercises": {
                    "type": "array",
                    "description": "Exercises that make up the plan",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "Exercise name, e.g. 'Back Squat'"},
                            "muscle_group": {"type": "string"},
                            "day_of_week": {
                                "type": "integer",
                                "description": "0=Monday .. 6=Sunday",
                            },
                            "sets": {"type": "integer"},
                            "reps": {"type": "integer"},
                            "target_weight": {"type": "number"},
                        },
                        "required": ["name"],
                    },
                },
            },
            "required": ["plan_name", "exercises"],
        },
    },
    {
        "name": "adjust_plan",
        "description": (
            "Modify an existing plan for the current user based on logged performance or "
            "recovery data - e.g. reduce volume after a hard week, or progress load after "
            "consistent completion."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "plan_id": {"type": "integer", "description": "ID of the plan to adjust"},
                "notes": {"type": "string", "description": "Updated coaching notes for the plan"},
                "updates": {
                    "type": "array",
                    "description": "Per-exercise-slot changes to apply",
                    "items": {
                        "type": "object",
                        "properties": {
                            "plan_exercise_id": {"type": "integer"},
                            "sets": {"type": "integer"},
                            "reps": {"type": "integer"},
                            "target_weight": {"type": "number"},
                            "day_of_week": {"type": "integer"},
                        },
                        "required": ["plan_exercise_id"],
                    },
                },
            },
            "required": ["plan_id"],
        },
    },
    {
        "name": "suggest_supplements",
        "description": (
            "Gather the current user's goals, experience level, and recent training/soreness "
            "history so a supplement recommendation can be grounded in real data rather than "
            "generic advice. Returns facts only - compose the actual recommendation yourself "
            "in your final response."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "ask_schedule",
        "description": (
            "Gather the current user's active plan schedule (which exercises fall on which day) and "
            "recent training history, so you can answer scheduling questions - e.g. 'when should I "
            "train legs again?' or 'what's next?' - grounded in their real data rather than generic "
            "advice. Returns facts only - compose the actual answer yourself. If your answer implies "
            "a schedule change the user wants, follow up with adjust_plan in the same turn."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
]


def execute_generate_workout_plan(db: Session, user_id: int, tool_input: dict) -> dict:
    plan = models.Plan(
        user_id=user_id,
        name=tool_input["plan_name"],
        notes=tool_input.get("notes"),
    )
    for ex in tool_input.get("exercises", []):
        exercise = db.scalar(select(models.Exercise).where(models.Exercise.name == ex["name"]))
        if not exercise:
            exercise = models.Exercise(name=ex["name"], muscle_group=ex.get("muscle_group"))
            db.add(exercise)
            db.flush()
        plan.plan_exercises.append(
            models.PlanExercise(
                exercise_id=exercise.id,
                day_of_week=ex.get("day_of_week"),
                sets=ex.get("sets"),
                reps=ex.get("reps"),
                target_weight=ex.get("target_weight"),
            )
        )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return {
        "plan_id": plan.id,
        "name": plan.name,
        "exercise_count": len(plan.plan_exercises),
    }


def execute_adjust_plan(db: Session, user_id: int, tool_input: dict) -> dict:
    plan = db.get(models.Plan, tool_input["plan_id"])
    if not plan or plan.user_id != user_id:
        return {"error": "plan not found for this user"}

    if "notes" in tool_input:
        plan.notes = tool_input["notes"]

    updated_ids = []
    for upd in tool_input.get("updates", []):
        plan_exercise = db.get(models.PlanExercise, upd["plan_exercise_id"])
        if not plan_exercise or plan_exercise.plan_id != plan.id:
            continue
        for field in ("sets", "reps", "target_weight", "day_of_week"):
            if field in upd:
                setattr(plan_exercise, field, upd[field])
        updated_ids.append(plan_exercise.id)

    db.commit()
    return {"plan_id": plan.id, "updated_plan_exercise_ids": updated_ids, "notes": plan.notes}


def execute_suggest_supplements(db: Session, user_id: int, tool_input: dict) -> dict:
    user = db.get(models.User, user_id)
    if not user:
        return {"error": "user not found"}

    logs = db.scalars(
        select(models.WorkoutLog)
        .where(models.WorkoutLog.user_id == user_id)
        .order_by(models.WorkoutLog.performed_at.desc())
        .limit(20)
    ).all()
    soreness_notes = db.scalars(
        select(models.SorenessNote)
        .where(models.SorenessNote.user_id == user_id)
        .order_by(models.SorenessNote.noted_at.desc())
        .limit(10)
    ).all()

    return {
        "primary_goals": user.primary_goals,
        "experience_level": user.experience_level,
        "physical_limitations": user.physical_limitations,
        "recent_log_count": len(logs),
        "recent_logs": [
            {
                "exercise_id": log.exercise_id,
                "sets": log.sets,
                "reps": log.reps,
                "weight": log.weight,
                "rpe": log.rpe,
            }
            for log in logs
        ],
        "recent_soreness": [
            {"muscle_group": note.muscle_group, "severity": note.severity} for note in soreness_notes
        ],
    }


def execute_ask_schedule(db: Session, user_id: int, tool_input: dict) -> dict:
    user = db.get(models.User, user_id)
    if not user:
        return {"error": "user not found"}

    plans = db.scalars(
        select(models.Plan).where(models.Plan.user_id == user_id).order_by(models.Plan.created_at.desc())
    ).all()
    plan = next((p for p in plans if p.is_active), plans[0] if plans else None)

    plan_schedule = []
    if plan:
        for pe in plan.plan_exercises:
            plan_schedule.append(
                {
                    "exercise": pe.exercise.name,
                    "muscle_group": pe.exercise.muscle_group,
                    "day_of_week": pe.day_of_week,  # 0=Monday .. 6=Sunday
                    "sets": pe.sets,
                    "reps": pe.reps,
                }
            )

    recent_logs = db.scalars(
        select(models.WorkoutLog)
        .where(models.WorkoutLog.user_id == user_id)
        .order_by(models.WorkoutLog.performed_at.desc())
        .limit(20)
    ).all()

    return {
        "today_day_of_week": _today().weekday(),  # 0=Monday .. 6=Sunday
        "active_plan_name": plan.name if plan else None,
        "plan_schedule": plan_schedule,
        "recent_logs": [
            {
                "exercise": log.exercise.name,
                "muscle_group": log.exercise.muscle_group,
                "performed_at": log.performed_at.isoformat(),
            }
            for log in recent_logs
        ],
    }


TOOL_EXECUTORS = {
    "generate_workout_plan": execute_generate_workout_plan,
    "adjust_plan": execute_adjust_plan,
    "suggest_supplements": execute_suggest_supplements,
    "ask_schedule": execute_ask_schedule,
}
