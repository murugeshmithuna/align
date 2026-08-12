from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import models, schemas
from app.models import _today
from app.schemas import REPS_BOUNDS, RPE_BOUNDS, SETS_BOUNDS, WEIGHT_BOUNDS

TOOL_SCHEMAS = [
    {
        "name": "generate_workout_plan",
        "description": (
            "Create a new training plan for the current user and persist it, replacing any existing plan "
            "as their one active plan. The user's baseline profile (experience level, target frequency, "
            "available equipment, primary goals, physical limitations) is already provided as context - "
            "use it to choose appropriate exercises, sets/reps, and weekly frequency without asking the "
            "user to repeat any of it. Use this when the user wants a new plan or a full program, not a "
            "tweak to an existing one. ALWAYS build a genuinely COMPLETE plan: schedule exercises across a "
            "number of distinct days equal to the user's target training frequency (default 3 if "
            "unspecified), with 4-6 well-chosen exercises per training day matching their goals/equipment "
            "- never a single-exercise 'starter' or placeholder plan, even if asked for something quick."
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
            "Modify an existing plan for the current user: `updates` changes sets/reps/weight/day for "
            "exercises ALREADY on the plan (e.g. reduce volume after a hard week, progress load after "
            "consistent completion), `additions` inserts brand-new exercises onto the plan (e.g. 'add a "
            "glute exercise to today'), and `removals` deletes exercises from the plan entirely (e.g. 'no "
            "sumo squat', 'remove the extra exercise you just added', 'take out X'). These are three "
            "different operations - an item in `updates` needs a real existing plan_exercise_id from the "
            "plan context above; never invent one or put a new exercise there, since that silently does "
            "nothing. A request to ADD something the plan doesn't already have always goes in `additions`, "
            "not `updates`. A request to remove/undo/take out an exercise always goes in `removals` - "
            "NEVER just say you removed something without actually including its plan_exercise_id in "
            "`removals`; there is no other way to delete an exercise, and claiming success without calling "
            "this leaves the exercise on the plan while telling the user it's gone."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "plan_id": {"type": "integer", "description": "ID of the plan to adjust"},
                "notes": {"type": "string", "description": "Updated coaching notes for the plan"},
                "updates": {
                    "type": "array",
                    "description": "Changes to exercises already on the plan - plan_exercise_id must be a real ID from the plan context",
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
                "additions": {
                    "type": "array",
                    "description": "Brand-new exercises to insert onto the plan - use this to add something the plan doesn't already have",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "Exercise name, e.g. 'Hip Thrust'"},
                            "muscle_group": {"type": "string", "description": "Only used if this exercise doesn't exist yet"},
                            "day_of_week": {"type": "integer", "description": "0=Monday .. 6=Sunday"},
                            "sets": {"type": "integer"},
                            "reps": {"type": "integer"},
                            "target_weight": {"type": "number"},
                        },
                        "required": ["name", "day_of_week"],
                    },
                },
                "removals": {
                    "type": "array",
                    "description": (
                        "plan_exercise_id values to delete from the plan entirely - use this whenever the "
                        "user wants an exercise taken out, undone, or removed. Must be real IDs from the "
                        "plan context above; never invent one."
                    ),
                    "items": {"type": "integer"},
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
    {
        "name": "analyze_form",
        "description": (
            "Gather the current user's most recent uploaded squat-video analysis (MediaPipe pose "
            "detection: rep count, and per-rep depth/knee-tracking/back-angle pass-fail flags), so you "
            "can answer questions like 'how was my squat form?' or 'what should I work on?' grounded in "
            "real measurements rather than generic cues. When a specific issue is detected, also "
            "returns 1-2 relevant coaching-knowledge excerpts retrieved for that issue - ground your "
            "critique in those excerpts when present. Returns facts only - compose the actual critique "
            "yourself. If there's no analysis yet, say so and suggest uploading a squat video on the "
            "Live Session page."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "ask_nutrition",
        "description": (
            "Gather the current user's recent uploaded meal-photo analyses (Claude Vision: description, "
            "estimated calories/macros, goal-aware assessment per meal), so you can answer nutrition "
            "questions - e.g. 'how's my protein been this week?' or 'am I eating enough for my goals?' - "
            "grounded in their actual logged meals. Returns facts only - compose the actual answer "
            "yourself. If there's no meal analysis yet, say so and suggest uploading a meal photo on the "
            "Meal Photo page."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "log_workout",
        "description": (
            "Record a workout the user says they ALREADY completed (e.g. 'log 3x10 squats at 135lb', "
            "'I just did 4 sets of pull-ups') as a permanent history entry. This is distinct from "
            "adjust_plan: adjust_plan changes the future plan's prescription, log_workout records what "
            "actually happened today so it shows up in progress charts and history - use log_workout "
            "whenever the user reports something they did, not something they want to change going "
            "forward. Fuzzy-match the exercise name against a sensible canonical name (e.g. 'squats' -> "
            "'Back Squat') the same way generate_workout_plan would name it; a new exercise catalog entry "
            "is created automatically if no match exists."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "exercise_name": {"type": "string", "description": "Canonical exercise name, e.g. 'Back Squat'"},
                "muscle_group": {"type": "string", "description": "Only used if this exercise doesn't exist yet"},
                "sets": {"type": "integer"},
                "reps": {"type": "integer"},
                "weight": {"type": "number", "description": "Weight used, in the user's usual units"},
                "rpe": {"type": "number", "description": "Rate of perceived exertion, 0-10, if mentioned"},
                "notes": {"type": "string", "description": "Any other detail the user mentioned"},
            },
            "required": ["exercise_name"],
        },
    },
    {
        "name": "update_log",
        "description": (
            "Correct a workout the user already logged (e.g. 'that squat entry was actually 5 sets not "
            "3', 'change today's bench weight to 155'). Only ever use a log_id from the real recent "
            "activity log listed in context above - never invent one. Only the fields provided are "
            "changed; anything omitted is left as-is."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "log_id": {"type": "integer", "description": "Real log_id from the recent activity log context"},
                "sets": {"type": "integer"},
                "reps": {"type": "integer"},
                "weight": {"type": "number"},
                "rpe": {"type": "number"},
                "notes": {"type": "string"},
            },
            "required": ["log_id"],
        },
    },
    {
        "name": "delete_log",
        "description": (
            "Remove a workout log entry entirely (e.g. 'delete that entry, I didn't actually do it', "
            "'remove today's squat log'). Only ever use a log_id from the real recent activity log listed "
            "in context above - never invent one. This is permanent - use update_log instead if the user "
            "just wants to correct a number, not erase the entry."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "log_id": {"type": "integer", "description": "Real log_id from the recent activity log context"},
            },
            "required": ["log_id"],
        },
    },
]


def _in_bounds(value, bounds: dict) -> bool:
    return bounds["ge"] <= value <= bounds["le"]


def _out_of_bounds_fields(payload: dict) -> list[str]:
    """generate_workout_plan and adjust_plan previously wrote sets/reps/
    target_weight straight into the database with NO validation at all -
    unlike logs, which always go through LogCreate's bounds. A truly
    implausible value (e.g. a 5000kg target weight) would be silently
    persisted and rendered on the plan as if it were fact. This is a hard
    backstop underneath the SYSTEM_PROMPT's SAFETY CHECK instruction, not a
    replacement for it - the prompt handles judgment calls relative to a
    specific user's actual profile (bodyweight, experience level, noted
    limitations/soreness), while this catches values that are absurd for
    anyone regardless of profile."""
    bad = []
    for field, bounds in (("sets", SETS_BOUNDS), ("reps", REPS_BOUNDS), ("target_weight", WEIGHT_BOUNDS)):
        value = payload.get(field)
        if value is not None and not _in_bounds(value, bounds):
            bad.append(field)
    return bad


def execute_generate_workout_plan(db: Session, user_id: int, tool_input: dict) -> dict:
    # A new plan must become the user's ONE AND ONLY active plan - Dashboard,
    # PlanDetail, Calendar, and the orchestrator's own _build_plan_context()
    # all assume at most one is_active=True row per user. Plan.is_active
    # defaults to True, so without this, generating a second plan (e.g. "build
    # out a full program" after an earlier single-exercise starter) left BOTH
    # plans active at once: the orchestrator's context picks the newest active
    # plan (ordered by created_at desc) and confidently reports the new plan,
    # but the frontend's `plans.find(p => p.is_active)` has no such ordering
    # and returns whichever active plan the backend's unordered response lists
    # first - typically the OLDER one. Confirmed live as the real cause of
    # "coach said he added exercises but the plan still only shows the old
    # bicep curl" - the coach and the UI were looking at two different plans.
    db.execute(update(models.Plan).where(models.Plan.user_id == user_id).values(is_active=False))
    plan = models.Plan(
        user_id=user_id,
        name=tool_input["plan_name"],
        notes=tool_input.get("notes"),
        is_active=True,
    )
    skipped_exercises = []
    for ex in tool_input.get("exercises", []):
        bad_fields = _out_of_bounds_fields(ex)
        if bad_fields:
            skipped_exercises.append(f"{ex.get('name', '?')} ({', '.join(bad_fields)})")
            continue
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
    result = {
        "plan_id": plan.id,
        "name": plan.name,
        "exercise_count": len(plan.plan_exercises),
    }
    if skipped_exercises:
        result["warning"] = (
            f"Skipped {len(skipped_exercises)} exercise(s) with implausible values: "
            f"{'; '.join(skipped_exercises)}. Sets must be {SETS_BOUNDS['ge']}-{SETS_BOUNDS['le']}, reps "
            f"{REPS_BOUNDS['ge']}-{REPS_BOUNDS['le']}, weight {WEIGHT_BOUNDS['ge']}-{WEIGHT_BOUNDS['le']} "
            "(kg or lb) - tell the user plainly rather than silently omitting these."
        )
    return result


def execute_adjust_plan(db: Session, user_id: int, tool_input: dict) -> dict:
    plan = db.get(models.Plan, tool_input["plan_id"])
    if not plan or plan.user_id != user_id:
        return {"error": "plan not found for this user"}

    if "notes" in tool_input:
        plan.notes = tool_input["notes"]

    updated_ids = []
    skipped_updates = 0
    invalid_updates = []
    for upd in tool_input.get("updates", []):
        plan_exercise = db.get(models.PlanExercise, upd["plan_exercise_id"])
        if not plan_exercise or plan_exercise.plan_id != plan.id:
            skipped_updates += 1
            continue
        bad_fields = _out_of_bounds_fields(upd)
        if bad_fields:
            invalid_updates.append(f"plan_exercise_id={upd['plan_exercise_id']} ({', '.join(bad_fields)})")
            continue
        # Skip explicit nulls, not just absent keys - a client that echoes
        # back a full adjustment object (e.g. the Coach Resolution "Apply"
        # flow, which round-trips a Pydantic model serializing every field
        # including unset ones as null) would otherwise silently blank out
        # sets/reps/target_weight it never actually meant to change.
        for field in ("sets", "reps", "target_weight", "day_of_week"):
            if upd.get(field) is not None:
                setattr(plan_exercise, field, upd[field])
        updated_ids.append(plan_exercise.id)

    # Brand-new exercises the plan doesn't already have - `updates` above can
    # only ever change a real, existing plan_exercise row, so a request to
    # ADD something previously had no valid path at all: the model would
    # reference a plan_exercise_id that doesn't exist, which silently no-ops
    # via the `continue` above, then narrate a change that never happened.
    # Reuses the exact find-or-create Exercise pattern execute_generate_
    # workout_plan already uses, so exercise naming/catalog behavior matches.
    added_ids = []
    invalid_additions = []
    existing_order_indexes = [pe.order_index for pe in plan.plan_exercises]
    next_order_index = (max(existing_order_indexes) + 1) if existing_order_indexes else 0
    for addition in tool_input.get("additions", []):
        bad_fields = _out_of_bounds_fields(addition)
        if bad_fields:
            invalid_additions.append(f"{addition.get('name', '?')} ({', '.join(bad_fields)})")
            continue
        exercise = db.scalar(select(models.Exercise).where(models.Exercise.name == addition["name"]))
        if not exercise:
            exercise = models.Exercise(name=addition["name"], muscle_group=addition.get("muscle_group"))
            db.add(exercise)
            db.flush()
        plan_exercise = models.PlanExercise(
            plan_id=plan.id,
            exercise_id=exercise.id,
            day_of_week=addition.get("day_of_week"),
            sets=addition.get("sets"),
            reps=addition.get("reps"),
            target_weight=addition.get("target_weight"),
            order_index=next_order_index,
        )
        next_order_index += 1
        db.add(plan_exercise)
        db.flush()
        added_ids.append(plan_exercise.id)

    # Deletes exercises from the plan entirely - until this was added,
    # adjust_plan had NO way to remove a plan_exercise at all (only `updates`,
    # which modifies a row in place, and `additions`, which inserts new
    # rows). Confirmed live as a real bug: a user asked to remove an exercise
    # the coach had just added, the model replied "Done - removed the sumo
    # squat," and the exercise stayed on the plan untouched - there was
    # simply no tool call capable of deleting it, so the model's confident
    # narration was never backed by any actual database change.
    removed_ids = []
    skipped_removals = 0
    for plan_exercise_id in tool_input.get("removals", []):
        plan_exercise = db.get(models.PlanExercise, plan_exercise_id)
        if not plan_exercise or plan_exercise.plan_id != plan.id:
            skipped_removals += 1
            continue
        db.delete(plan_exercise)
        removed_ids.append(plan_exercise_id)

    db.commit()
    result = {
        "plan_id": plan.id,
        "updated_plan_exercise_ids": updated_ids,
        "added_plan_exercise_ids": added_ids,
        "removed_plan_exercise_ids": removed_ids,
        "notes": plan.notes,
    }
    warnings = []
    if skipped_updates:
        # Explicit so the model can never mistake silence for success - an
        # update referencing an ID that doesn't exist on this plan is always
        # worth surfacing, not swallowing.
        warnings.append(
            f"{skipped_updates} update(s) referenced a plan_exercise_id not found on this plan and were "
            "skipped - if you meant to add a new exercise rather than change an existing one, use "
            "`additions` instead."
        )
    if skipped_removals:
        warnings.append(
            f"{skipped_removals} removal(s) referenced a plan_exercise_id not found on this plan and were "
            "skipped - never tell the user something was removed unless its ID actually appears in "
            "removed_plan_exercise_ids above."
        )
    if invalid_updates:
        warnings.append(
            f"Skipped update(s) with implausible values: {'; '.join(invalid_updates)}. Sets must be "
            f"{SETS_BOUNDS['ge']}-{SETS_BOUNDS['le']}, reps {REPS_BOUNDS['ge']}-{REPS_BOUNDS['le']}, weight "
            f"{WEIGHT_BOUNDS['ge']}-{WEIGHT_BOUNDS['le']} (kg or lb) - tell the user plainly."
        )
    if invalid_additions:
        warnings.append(
            f"Skipped addition(s) with implausible values: {'; '.join(invalid_additions)}. Same bounds as "
            "above - tell the user plainly rather than silently omitting these."
        )
    if warnings:
        result["warning"] = " ".join(warnings)
    return result


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


def execute_analyze_form(db: Session, user_id: int, tool_input: dict) -> dict:
    analysis = db.scalar(
        select(models.FormAnalysis)
        .where(models.FormAnalysis.user_id == user_id)
        .order_by(models.FormAnalysis.analyzed_at.desc())
    )
    if not analysis:
        return {"has_analysis": False}

    result = {
        "has_analysis": True,
        "exercise_name": analysis.exercise_name,
        "analyzed_at": analysis.analyzed_at.isoformat(),
        "rep_count": analysis.rep_count,
        "reps_with_good_depth": analysis.reps_with_good_depth,
        "reps_with_good_knee_tracking": analysis.reps_with_good_knee_tracking,
        "reps_with_good_back_angle": analysis.reps_with_good_back_angle,
    }

    # RAG augmentation (backend/app/rag/) - only ever adds a new key, never
    # changes anything above. If no flag is raised, or retrieval finds
    # nothing above the relevance threshold, or retrieval fails for any
    # reason, `tips` is [] and this key is not added at all - the returned
    # dict is byte-identical to today's.
    flagged_topics = [
        topic
        for topic, good_count in (
            ("depth", analysis.reps_with_good_depth),
            ("knee_tracking", analysis.reps_with_good_knee_tracking),
            ("back_angle", analysis.reps_with_good_back_angle),
        )
        if good_count < analysis.rep_count
    ]
    if flagged_topics:
        # Imported here, not at module top - this is the one place in the
        # whole app that needs chromadb/sentence-transformers/torch, and
        # they should only ever load when a form issue is actually flagged,
        # not merely because tools.py (imported at app startup) exists.
        from app.rag.retrieve import get_relevant_form_tips

        tips = get_relevant_form_tips(analysis.exercise_name, flagged_topics)
        if tips:
            result["relevant_form_guidance"] = tips

    return result


def execute_ask_nutrition(db: Session, user_id: int, tool_input: dict) -> dict:
    analyses = db.scalars(
        select(models.MealAnalysis)
        .where(models.MealAnalysis.user_id == user_id)
        .order_by(models.MealAnalysis.analyzed_at.desc())
        .limit(10)
    ).all()

    if not analyses:
        return {"has_analyses": False}

    return {
        "has_analyses": True,
        "recent_meals": [
            {
                "analyzed_at": a.analyzed_at.isoformat(),
                "description": a.description,
                "estimated_calories": a.estimated_calories,
                "protein_g": a.protein_g,
                "carbs_g": a.carbs_g,
                "fat_g": a.fat_g,
                "macro_summary": a.macro_summary,
                "quick_tip": a.quick_tip,
                "timing_note": a.timing_note,
            }
            for a in analyses
        ],
    }


def execute_log_workout(db: Session, user_id: int, tool_input: dict) -> dict:
    user = db.get(models.User, user_id)
    if not user:
        return {"error": "user not found"}

    name = (tool_input.get("exercise_name") or "").strip()
    if not name:
        return {"error": "exercise_name is required"}

    # Same find-or-create-by-name pattern as execute_generate_workout_plan,
    # so a chat-logged exercise ("Squats") and a plan-generated one ("Back
    # Squat") both land in the same shared catalog table rather than a
    # second, divergent way of creating an Exercise row.
    exercise = db.scalar(select(models.Exercise).where(models.Exercise.name == name))
    if not exercise:
        exercise = models.Exercise(name=name, muscle_group=tool_input.get("muscle_group"))
        db.add(exercise)
        db.flush()

    # Validated through the exact same Pydantic schema POST /logs uses
    # (sets/reps/weight/rpe bounds) rather than a second, hand-rolled set of
    # limits that could quietly drift out of sync with the REST endpoint's.
    # A ValidationError here propagates up to _run_tool's catch-all, which
    # turns it into a normal tool_result the model can react to.
    validated = schemas.LogCreate(
        user_id=user_id,
        exercise_id=exercise.id,
        sets=tool_input.get("sets"),
        reps=tool_input.get("reps"),
        weight=tool_input.get("weight"),
        rpe=tool_input.get("rpe"),
        notes=tool_input.get("notes"),
    )

    log = models.WorkoutLog(**validated.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)

    return {
        "log_id": log.id,
        "exercise_name": exercise.name,
        "sets": log.sets,
        "reps": log.reps,
        "weight": log.weight,
        "rpe": log.rpe,
        "performed_at": log.performed_at.isoformat(),
    }


def execute_update_log(db: Session, user_id: int, tool_input: dict) -> dict:
    log = db.get(models.WorkoutLog, tool_input["log_id"])
    if not log or log.user_id != user_id:
        return {"error": "log entry not found for this user"}

    field_bounds = {"sets": SETS_BOUNDS, "reps": REPS_BOUNDS, "weight": WEIGHT_BOUNDS, "rpe": RPE_BOUNDS}
    for field, bounds in field_bounds.items():
        value = tool_input.get(field)
        if value is not None and not _in_bounds(value, bounds):
            return {"error": f"{field}={value} is outside the allowed range {bounds['ge']}-{bounds['le']}"}

    # Only overwrite fields actually provided - same "skip absent, not just
    # null" pattern as execute_adjust_plan, so a correction to one field
    # never silently blanks out the others.
    for field in ("sets", "reps", "weight", "rpe", "notes"):
        if tool_input.get(field) is not None:
            setattr(log, field, tool_input[field])

    db.commit()
    db.refresh(log)
    return {
        "log_id": log.id,
        "exercise_name": log.exercise.name,
        "sets": log.sets,
        "reps": log.reps,
        "weight": log.weight,
        "rpe": log.rpe,
        "notes": log.notes,
    }


def execute_delete_log(db: Session, user_id: int, tool_input: dict) -> dict:
    log = db.get(models.WorkoutLog, tool_input["log_id"])
    if not log or log.user_id != user_id:
        return {"error": "log entry not found for this user"}

    exercise_name = log.exercise.name
    db.delete(log)
    db.commit()
    return {"deleted_log_id": tool_input["log_id"], "exercise_name": exercise_name}


TOOL_EXECUTORS = {
    "generate_workout_plan": execute_generate_workout_plan,
    "adjust_plan": execute_adjust_plan,
    "suggest_supplements": execute_suggest_supplements,
    "ask_schedule": execute_ask_schedule,
    "analyze_form": execute_analyze_form,
    "ask_nutrition": execute_ask_nutrition,
    "log_workout": execute_log_workout,
    "update_log": execute_update_log,
    "delete_log": execute_delete_log,
}
