"""Unified Coach Resolution - replaces the earlier multi-agent "Coach Debate"
(a Strength Coach and Recovery Coach arguing, resolved by a Head Coach). That
adversarial framing read as unconfident; this is a single master-strategist
call instead. One Claude call, forced strict tool_choice, so the decision
comes back as directly-usable structured data (a list of factors, one
authoritative resolution, and optionally concrete plan_exercise adjustments)
rather than a persona-flavored paragraph to parse."""

import logging

import anthropic
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.agent.orchestrator import _AGENT_CALL_FAILURE_MESSAGE, _get_client, _get_user_or_raise
from app.config import CLAUDE_MODEL
from app.models import _today

logger = logging.getLogger(__name__)

DEFAULT_QUESTION = "Should I push hard in training today, or back off?"

RESOLUTION_TOOL = {
    "name": "report_coach_resolution",
    "description": "Report the unified coaching decision for this training dilemma.",
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "factors_evaluated": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "2-4 short phrases naming the concrete trade-offs actually weighed - e.g. "
                    "'Fatigue levels vs. weekly progression goals'. Specific to this user's real data, "
                    "not generic categories."
                ),
            },
            "resolution": {
                "type": "string",
                "description": (
                    "The clear, authoritative decision - 2-4 sentences telling the user exactly what to "
                    "do. No hedging, no 'it depends', no presenting both sides as equally valid - make "
                    "the call."
                ),
            },
            "plan_adjustments": {
                "type": "array",
                "description": (
                    "Concrete changes to today's plan exercises that implement the resolution - each "
                    "must reference a real plan_exercise_id from the plan given below. Empty array if the "
                    "resolution doesn't require a plan change (purely informational advice) or there's no "
                    "active plan."
                ),
                "items": {
                    "type": "object",
                    "properties": {
                        "plan_exercise_id": {"type": "integer"},
                        "sets": {"type": "integer"},
                        "reps": {"type": "integer"},
                        "target_weight": {"type": "number"},
                    },
                    "required": ["plan_exercise_id"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["factors_evaluated", "resolution", "plan_adjustments"],
        "additionalProperties": False,
    },
}

RESOLUTION_SYSTEM_PROMPT = """You are the Head Coach - a single, unified master strategist, not one \
voice in a debate. You're given this user's real recent training performance, recovery/readiness data, \
and their active plan's exercises. Weigh the performance and recovery angles together yourself and hand \
down ONE clear, authoritative decision - never present two sides as equally valid, never hedge. If the \
decision implies a concrete change to today's plan (reduce weight, change sets/reps), propose those exact \
changes referencing real plan_exercise_id values from the plan provided - don't invent IDs."""


def _build_performance_context(db: Session, user_id: int) -> str:
    rows = db.execute(
        select(models.WorkoutLog, models.Exercise.name)
        .join(models.Exercise, models.WorkoutLog.exercise_id == models.Exercise.id)
        .where(models.WorkoutLog.user_id == user_id)
        .order_by(models.WorkoutLog.performed_at.desc())
        .limit(10)
    ).all()
    if not rows:
        return "No training logs yet."
    return "\n".join(
        f"- {log.performed_at.date()}: {name} - {log.sets}x{log.reps} @ {log.weight or 'bodyweight'}"
        + (f", RPE {log.rpe}" if log.rpe else "")
        for log, name in rows
    )


def _build_recovery_context(db: Session, user_id: int) -> str:
    lines = []

    checkin = db.scalar(
        select(models.CheckIn).where(
            models.CheckIn.user_id == user_id, models.CheckIn.checkin_date == _today()
        )
    )
    lines.append(
        f"Today's readiness check-in: {checkin.score}/5 ({checkin.label}), "
        f"plan status: {checkin.plan_status_label}"
        if checkin
        else "No readiness check-in submitted today."
    )

    soreness = db.scalars(
        select(models.SorenessNote)
        .where(models.SorenessNote.user_id == user_id)
        .order_by(models.SorenessNote.noted_at.desc())
        .limit(10)
    ).all()
    if soreness:
        lines.append("Recent soreness notes:")
        lines.extend(f"- {s.noted_at.date()}: {s.muscle_group} (severity {s.severity}/5)" for s in soreness)
    else:
        lines.append("No soreness notes logged.")

    return "\n".join(lines)


def _build_plan_detail(db: Session, user_id: int) -> tuple[int | None, str]:
    """Same idea as orchestrator.py's _build_plan_context, but includes real
    plan_exercise_id values in the text - the resolution tool needs to
    reference them to propose appliable adjustments, not just describe the
    schedule."""
    plans = db.scalars(
        select(models.Plan).where(models.Plan.user_id == user_id).order_by(models.Plan.created_at.desc())
    ).all()
    plan = next((p for p in plans if p.is_active), plans[0] if plans else None)
    if not plan:
        return None, "No active plan - do not propose plan_adjustments."

    lines = [
        f"- plan_exercise_id={pe.id}: {pe.exercise.name} - {pe.sets}x{pe.reps} "
        f"@ {pe.target_weight or 'bodyweight'}"
        for pe in plan.plan_exercises
    ]
    detail = f'Active plan "{plan.name}" (plan_id={plan.id}):\n' + "\n".join(lines)
    return plan.id, detail


def generate_coach_resolution(db: Session, user_id: int, question: str | None = None) -> dict:
    client = _get_client()
    _get_user_or_raise(db, user_id)
    question = question or DEFAULT_QUESTION

    performance_context = _build_performance_context(db, user_id)
    recovery_context = _build_recovery_context(db, user_id)
    plan_id, plan_detail = _build_plan_detail(db, user_id)

    prompt = (
        f"Training dilemma: {question}\n\n"
        f"Recent training performance:\n{performance_context}\n\n"
        f"Recovery data:\n{recovery_context}\n\n"
        f"{plan_detail}"
    )

    # This call had NO error handling at all until caught live here: a
    # transient upstream failure (the Manifest proxy this project routes
    # through, same class of hiccup documented elsewhere in this app - e.g.
    # AIMessageBar's one-off "M102: anthropic subscription credentials could
    # not be refreshed") propagated straight out of this function as a raw
    # anthropic.APIError, past the router's `except RuntimeError` (which
    # only catches the RuntimeError this except now raises, not the SDK's own
    # exception type) into an unhandled 500 with no CORS headers on the
    # error response - which the browser then reports as a misleading "CORS
    # policy" error, masking the real cause. Reproduced directly against the
    # running server: ~2 of 3 sequential calls to POST /agent/coach-resolution
    # returned a bare 500. Fixed the same way orchestrator.py's run_agent_turn/
    # stream_agent_turn already handle the identical failure mode - catch
    # anthropic.APIError, log it, and surface a clean, generic 503 instead.
    try:
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=600,
            system=RESOLUTION_SYSTEM_PROMPT,
            tools=[RESOLUTION_TOOL],
            tool_choice={"type": "tool", "name": "report_coach_resolution"},
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.APIError:
        logger.exception("Coach Resolution Claude call failed")
        raise RuntimeError(_AGENT_CALL_FAILURE_MESSAGE) from None

    tool_block = next((b for b in response.content if b.type == "tool_use"), None)
    if tool_block is None:
        logger.error("Coach Resolution call returned no tool_use block despite forced tool_choice")
        raise RuntimeError(_AGENT_CALL_FAILURE_MESSAGE)

    result = tool_block.input
    # RESOLUTION_TOOL's schema lists plan_adjustments as required (and
    # "strict": True on top of that) - but caught live, reproducibly, against
    # the real running server: the model sometimes still omits it from the
    # tool call's input when the resolution is purely informational (no plan
    # change), despite the schema. schemas.CoachResolutionOut's
    # `plan_adjustments: list[PlanAdjustmentItem]` (non-optional) then fails
    # FastAPI's response validation with a raw, unhandled 500 - which has no
    # CORS headers on the error response, so the browser reports it as a
    # misleading "CORS policy" failure that obscures the real cause. Directly
    # reproduced: ~2 of 3 sequential POST /agent/coach-resolution calls
    # against the live server failed this way. Defaulting the missing field
    # here (the schema already treats an empty list as "no plan changes
    # proposed" - see CoachResolution.jsx's `hasAdjustments` check) is a safe,
    # meaning-preserving fallback, not a guess.
    result.setdefault("plan_adjustments", [])
    result["question"] = question
    result["plan_id"] = plan_id
    return result
