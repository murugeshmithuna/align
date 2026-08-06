import json
from collections.abc import Iterator
from datetime import timedelta

import anthropic
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.agent.tools import TOOL_EXECUTORS, TOOL_SCHEMAS
from app.config import ANTHROPIC_API_KEY, CLAUDE_MODEL, FAST_MODEL
from app.models import _today, _utcnow

SYSTEM_PROMPT = """You are the orchestrator agent for the AI Fitness Agent, a coach that watches, \
listens, and adapts.

ROLE: The user's baseline training plan is generated automatically from their profile settings - you \
are a fine-tuning assistant and Q&A expert, not the primary plan generator in normal conversation. Use \
adjust_plan when the user wants to tweak their existing plan, generate_workout_plan only when there's \
no active plan yet or they explicitly want a full replacement, ask_schedule for grounded scheduling \
questions ("when should I train legs again?", "what's next?"), suggest_supplements for supplement \
questions, analyze_form for squat-form questions ("how was my squat form?", "what should I work on?"), \
ask_nutrition for meal/nutrition questions ("how's my protein been?", "am I eating enough?"), and plain \
conversation for everything else.

ask_schedule, analyze_form, and ask_nutrition return facts only (the user's training history, most \
recent squat video analysis, or recent meal-photo analyses) - compose the actual answer yourself from \
those facts. If your answer implies a schedule or volume change the user wants, follow up by calling \
adjust_plan in the same turn rather than just describing the change. If analyze_form or ask_nutrition \
report no analysis yet, tell the user to upload a squat video on the Live Session page or a meal photo \
on the Meal Photo page, respectively.

CONTEXT YOU ALREADY HAVE, provided below on every turn: the user's onboarding profile (experience \
level, target frequency, available equipment, primary goals/focus areas, physical limitations), their \
active plan and its full weekly schedule, and today's readiness check-in score. These are already known \
facts, not open questions - NEVER ask the user to restate, re-confirm, or re-select their equipment, \
goals, experience level, or current plan. If the profile says "Dumbbells", use dumbbells without asking.

NO TEXT QUESTIONNAIRES. When you genuinely need the user to choose or confirm something before you can \
proceed - session length, which muscle groups to focus on, whether to apply a proposed change - call \
present_choice. Never ask a question as a numbered list, a bulleted list, or multiple prose questions in \
a row; present_choice renders as real buttons/checkboxes in the UI and the user's next message is their \
selection, so it always replaces a text question, never supplements one.

ACT FIRST. For standard requests ("abs workout", "leg day", "adjust today's session"), IMMEDIATELY call \
generate_workout_plan or adjust_plan using the existing profile/plan/check-in context - do not ask about \
session length, exercise preferences, or baseline details first. Output the result directly. Only use \
present_choice when something is truly impossible to proceed without (e.g. the request is genuinely \
open-ended, like "give me a session" with no other detail); in every other case, act first and explain \
your choice afterward in at most one sentence.

Today's plan status (see context below) may already be auto-adjusted based on a low readiness score \
before the user ever opens chat: a low score (1-2) means today's baseline routine has already been \
marked "Scaled Down" or "Rest / Mobility" in the database, with no chat message required. If the user \
asks about today's session, reflect that status, and if they want the specifics use adjust_plan to \
apply the actual reduced sets/reps/intensity. A high score (4-5) means the planned volume/intensity is \
fine, or can be nudged up if the user wants to push.

Only call a domain tool (generate_workout_plan, adjust_plan, suggest_supplements, ask_schedule, \
analyze_form, ask_nutrition) when the request requires a database change or grounded data lookup. For \
general conversation, respond directly without calling a tool. Every tool call is automatically scoped \
to the current user - never ask the user for their user_id.

OUTPUT FORMAT: at most 2 short sentences of explanation, then the result (the plan/adjustment, or a \
present_choice widget) immediately after - no greetings, no "I'd be happy to help!", no "Here is your \
tailored plan", no restating the user's question back to them."""

MAX_TURNS = 6

# A "soft" tool - it never touches the database. Calling it pauses the loop
# and hands a structured widget spec back to the frontend to render as real
# buttons/checkboxes instead of the model asking a question in prose. Kept
# separate from tools.py's TOOL_SCHEMAS/TOOL_EXECUTORS since those are all
# real DB-executing actions; this one is UI-only and handled inline below.
PRESENT_CHOICE_TOOL = {
    "name": "present_choice",
    "description": (
        "Ask the user to choose or confirm something via an interactive UI widget instead of asking a "
        "question in plain text. Use this ANY time you need input to proceed: 'single_choice' for one-of "
        "several options (e.g. session length), 'multi_select' for choosing several (e.g. muscle focus "
        "areas), or 'confirm' for a single yes/apply action (e.g. 'apply these changes to the plan?'). "
        "Never ask a question as prose or a numbered/bulleted list - always call this instead."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": "The question or explanation - at most 2 short sentences, no fluff.",
            },
            "widget_type": {
                "type": "string",
                "enum": ["single_choice", "multi_select", "confirm"],
            },
            "options": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Choices to render as buttons/checkboxes. For 'confirm', provide exactly one label "
                    "(e.g. 'Apply Updates to Plan')."
                ),
            },
        },
        "required": ["prompt", "widget_type", "options"],
    },
}

# The routing pass only ever needs to name a tool, never fill in its full
# arguments (that's the heavier model's job) - so it gets its own tiny schema.
# Handing the router the *real* tool schemas made the fast model try to write
# out a whole exercise list itself, which routinely hit max_tokens mid-JSON
# and got silently misread as "no tool needed".
ROUTING_TOOL = {
    "name": "route_to_tool",
    "description": (
        "Call this ONLY if the user's request requires generate_workout_plan, adjust_plan, "
        "suggest_supplements, ask_schedule, analyze_form, or ask_nutrition - i.e. it needs a database "
        "change or a grounded data lookup. For general conversation, questions, or advice that doesn't "
        "need one of those, do not call this - just answer directly with text instead."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "tool_name": {
                "type": "string",
                "enum": [
                    "generate_workout_plan",
                    "adjust_plan",
                    "suggest_supplements",
                    "ask_schedule",
                    "analyze_form",
                    "ask_nutrition",
                ],
                "description": "Which tool this request needs.",
            }
        },
        "required": ["tool_name"],
    },
}


def _build_profile_context(user: models.User) -> str:
    equipment = ", ".join(user.available_equipment) or "not specified"
    goals = ", ".join(user.primary_goals) or "not specified"
    frequency = f"{user.target_frequency} days/week" if user.target_frequency else "not specified"
    return (
        "User onboarding profile (do not ask the user to repeat any of this):\n"
        f"- Experience level: {user.experience_level or 'not specified'}\n"
        f"- Target training frequency: {frequency}\n"
        f"- Available equipment: {equipment}\n"
        f"- Primary goals: {goals}\n"
        f"- Physical limitations: {user.physical_limitations or 'none noted'}"
    )


_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _build_plan_context(db: Session, user_id: int) -> str:
    plans = db.scalars(
        select(models.Plan).where(models.Plan.user_id == user_id).order_by(models.Plan.created_at.desc())
    ).all()
    plan = next((p for p in plans if p.is_active), plans[0] if plans else None)
    if not plan:
        return "Active plan: none yet - the user has no training plan (offer to generate one)."

    by_day: dict[str, list[str]] = {}
    for pe in plan.plan_exercises:
        day = _DAY_NAMES[pe.day_of_week] if pe.day_of_week is not None else "unscheduled"
        by_day.setdefault(day, []).append(f"{pe.exercise.name} ({pe.sets}x{pe.reps})")
    schedule = "\n".join(f"- {day}: {', '.join(exs)}" for day, exs in by_day.items()) or "no exercises yet"

    return (
        f'Active plan (do not ask the user to restate any of this): "{plan.name}" (plan_id={plan.id}).\n'
        f"Weekly schedule:\n{schedule}"
    )


def _build_checkin_context(db: Session, user_id: int) -> str:
    checkin = db.scalar(
        select(models.CheckIn).where(
            models.CheckIn.user_id == user_id,
            models.CheckIn.checkin_date == _today(),
        )
    )
    if not checkin:
        return "Today's readiness check-in: not submitted yet. Today's plan status: normal."
    return (
        f"Today's readiness check-in: {checkin.score}/5 ({checkin.label}). "
        f"Today's plan status (already auto-marked in the database, no chat needed): "
        f"{checkin.plan_status_label}."
    )


def _get_client() -> anthropic.Anthropic:
    if not ANTHROPIC_API_KEY:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Add it to backend/.env (see .env.example) to use the agent."
        )
    # The Manifest proxy expects `Authorization: Bearer <key>` rather than
    # Anthropic's default `x-api-key` header, hence `auth_token` instead of `api_key`.
    return anthropic.Anthropic(auth_token=ANTHROPIC_API_KEY)


def _get_user_or_raise(db: Session, user_id: int) -> models.User:
    user = db.get(models.User, user_id)
    if not user:
        raise ValueError(f"user {user_id} not found")
    return user


def _run_tool(db: Session, user_id: int, block) -> dict:
    executor = TOOL_EXECUTORS.get(block.name)
    return executor(db, user_id, block.input) if executor is not None else {"error": f"unknown tool {block.name}"}


def _serialize_content(content) -> list[dict]:
    """Converts SDK response content blocks into plain JSON-safe dicts - both
    for shipping back to the frontend as `history` and for feeding straight
    back into a later `messages.create()` call. Deliberately only keeps the
    fields the API accepts as *input* on a content block - `block.model_dump()`
    also includes response-only fields (e.g. `parsed_output`) that the API
    rejects with a 400 ("Extra inputs are not permitted") if echoed back."""
    serialized = []
    for block in content:
        if block.type == "text":
            serialized.append({"type": "text", "text": block.text})
        elif block.type == "tool_use":
            serialized.append({"type": "tool_use", "id": block.id, "name": block.name, "input": block.input})
    return serialized


def run_agent_turn(db: Session, user_id: int, message: str, history: list[dict] | None = None) -> dict:
    """`history` is the full prior conversation (as returned in a previous
    call's `history` field) - this API is stateless, so the caller is
    responsible for echoing it back on every turn. Without it, a short reply
    like "2" or "yes" has no context to resolve against and looks like a
    non-sequitur to the model."""
    client = _get_client()
    user = _get_user_or_raise(db, user_id)
    system_prompt = (
        f"{SYSTEM_PROMPT}\n\n{_build_profile_context(user)}\n\n{_build_plan_context(db, user_id)}\n\n"
        f"{_build_checkin_context(db, user_id)}"
    )

    history = list(history or [])

    if not history:
        # Fast routing pass: a cheap model answers directly whenever no tool is
        # needed, so plain conversation never touches the heavier reasoning
        # model. Only applies to a brand-new conversation - once there's
        # history, a short reply needs the full context to interpret, so
        # continuing threads always go straight to the reasoning model below.
        router_response = client.messages.create(
            model=FAST_MODEL,
            max_tokens=1024,
            system=system_prompt,
            tools=[ROUTING_TOOL],
            messages=[{"role": "user", "content": message}],
        )
        if router_response.stop_reason != "tool_use":
            reply = "".join(block.text for block in router_response.content if block.type == "text")
            new_history = [
                {"role": "user", "content": message},
                {"role": "assistant", "content": _serialize_content(router_response.content)},
            ]
            return {"reply": reply, "tool_calls": [], "widget": None, "history": new_history}

    # Tool path: the heavier reasoning model actually authors the plan/
    # adjustment, and can pause the turn via present_choice for real
    # structured user input instead of guessing or asking in prose.
    messages: list[dict] = history + [{"role": "user", "content": message}]
    tool_call_log: list[dict] = []

    for _ in range(MAX_TURNS):
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=4096,
            system=system_prompt,
            tools=TOOL_SCHEMAS + [PRESENT_CHOICE_TOOL],
            messages=messages,
        )
        messages.append({"role": "assistant", "content": _serialize_content(response.content)})

        if response.stop_reason != "tool_use":
            final_text = "".join(block.text for block in response.content if block.type == "text")
            return {"reply": final_text, "tool_calls": tool_call_log, "widget": None, "history": messages}

        widget_payload = None
        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            if block.name == "present_choice":
                # No real tool_result to give back - the actual "result" is
                # whatever the user picks, which arrives as a later message.
                # Still satisfy the API's tool_use/tool_result pairing so this
                # turn is a valid prefix for the next call's history.
                widget_payload = block.input
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps({"status": "presented_to_user_awaiting_response"}),
                    }
                )
                continue
            result = _run_tool(db, user_id, block)
            tool_call_log.append({"name": block.name, "input": block.input, "result": result})
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result),
                }
            )
        messages.append({"role": "user", "content": tool_results})

        if widget_payload is not None:
            return {
                "reply": widget_payload.get("prompt", ""),
                "tool_calls": tool_call_log,
                "widget": widget_payload,
                "history": messages,
            }

    return {
        "reply": "I couldn't finish that within the allotted steps - please try rephrasing.",
        "tool_calls": tool_call_log,
        "widget": None,
        "history": messages,
    }


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


def stream_agent_turn(db: Session, user_id: int, message: str, history: list[dict] | None = None) -> Iterator[str]:
    """Yields SSE-formatted `data: {...}\\n\\n` frames as the agent responds.

    Frame shapes: {"content": "<token>"} for streamed text, {"tool": name,
    "status": "running"|"done"} while a tool executes, {"widget": {...}} when
    the model pauses for structured user input via present_choice instead of
    asking in prose, {"error": "..."} on failure, {"history": [...]} carrying
    the updated conversation state the client must echo back as `history` on
    its next request (this endpoint is stateless - see run_agent_turn), and a
    final {"done": true}.
    """
    try:
        client = _get_client()
        user = _get_user_or_raise(db, user_id)
    except (RuntimeError, ValueError) as exc:
        yield _sse({"error": str(exc)})
        return

    system_prompt = (
        f"{SYSTEM_PROMPT}\n\n{_build_profile_context(user)}\n\n{_build_plan_context(db, user_id)}\n\n"
        f"{_build_checkin_context(db, user_id)}"
    )

    history = list(history or [])

    if not history:
        # Fast routing pass: stream the cheap model's tokens immediately. If it
        # answers directly (no tool needed) that IS the final response.
        with client.messages.stream(
            model=FAST_MODEL,
            max_tokens=1024,
            system=system_prompt,
            tools=[ROUTING_TOOL],
            messages=[{"role": "user", "content": message}],
        ) as stream:
            for text in stream.text_stream:
                yield _sse({"content": text})
            router_response = stream.get_final_message()

        if router_response.stop_reason != "tool_use":
            new_history = [
                {"role": "user", "content": message},
                {"role": "assistant", "content": _serialize_content(router_response.content)},
            ]
            yield _sse({"history": new_history})
            yield _sse({"done": True})
            return

    # Tool path: hand off to the heavier reasoning model, which can pause the
    # turn via present_choice for real structured user input.
    messages: list[dict] = history + [{"role": "user", "content": message}]

    for _ in range(MAX_TURNS):
        with client.messages.stream(
            model=CLAUDE_MODEL,
            max_tokens=4096,
            system=system_prompt,
            tools=TOOL_SCHEMAS + [PRESENT_CHOICE_TOOL],
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield _sse({"content": text})
            response = stream.get_final_message()

        messages.append({"role": "assistant", "content": _serialize_content(response.content)})

        if response.stop_reason != "tool_use":
            yield _sse({"history": messages})
            yield _sse({"done": True})
            return

        widget_payload = None
        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            if block.name == "present_choice":
                widget_payload = block.input
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps({"status": "presented_to_user_awaiting_response"}),
                    }
                )
                continue
            yield _sse({"tool": block.name, "status": "running"})
            result = _run_tool(db, user_id, block)
            yield _sse({"tool": block.name, "status": "done"})
            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result),
                }
            )
        messages.append({"role": "user", "content": tool_results})

        if widget_payload is not None:
            yield _sse({"widget": widget_payload})
            yield _sse({"history": messages})
            yield _sse({"done": True})
            return

    yield _sse({"content": "\n\nI couldn't finish that within the allotted steps - please try rephrasing."})
    yield _sse({"history": messages})
    yield _sse({"done": True})


def generate_weekly_recap(db: Session, user_id: int) -> str:
    """Summarizes the user's last 7 days of logs/check-ins in plain language.
    Pure text generation (no tools, no plan changes) - uses the fast model
    since this is a summarization task, not multi-step reasoning."""
    client = _get_client()
    _get_user_or_raise(db, user_id)

    since_dt = _utcnow() - timedelta(days=7)
    since_date = _today() - timedelta(days=7)

    log_rows = db.execute(
        select(models.WorkoutLog, models.Exercise.name)
        .join(models.Exercise, models.WorkoutLog.exercise_id == models.Exercise.id)
        .where(models.WorkoutLog.user_id == user_id, models.WorkoutLog.performed_at >= since_dt)
        .order_by(models.WorkoutLog.performed_at.asc())
    ).all()

    checkins = db.scalars(
        select(models.CheckIn)
        .where(models.CheckIn.user_id == user_id, models.CheckIn.checkin_date >= since_date)
        .order_by(models.CheckIn.checkin_date.asc())
    ).all()

    if not log_rows and not checkins:
        return (
            "No activity logged in the past week yet - log a few sessions and check in daily, "
            "and I'll be able to summarize your week."
        )

    log_lines = (
        "\n".join(
            f"- {log.performed_at.date()}: {name} - {log.sets}x{log.reps} @ {log.weight or 'bodyweight'}"
            + (f", RPE {log.rpe}" if log.rpe else "")
            for log, name in log_rows
        )
        or "none logged"
    )
    checkin_lines = (
        "\n".join(f"- {c.checkin_date}: {c.score}/5 ({c.label})" for c in checkins) or "none logged"
    )

    prompt = (
        "Summarize this user's past 7 days of training in a short, encouraging weekly recap "
        "(3-5 sentences). Mention notable trends (volume, consistency, readiness), and end with "
        "one concrete, specific suggestion for next week.\n\n"
        f"Workout logs (last 7 days):\n{log_lines}\n\n"
        f"Daily readiness check-ins (last 7 days):\n{checkin_lines}"
    )

    response = client.messages.create(
        model=FAST_MODEL,
        max_tokens=500,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(block.text for block in response.content if block.type == "text")


WEEKLY_DIGEST_TOOL = {
    "name": "report_weekly_digest",
    "description": "Report the three-bullet weekly training/nutrition digest.",
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "biggest_win": {
                "type": "string",
                "description": "The single most notable positive from this week - specific, one sentence.",
            },
            "recovery_note": {
                "type": "string",
                "description": "One recovery, form, or readiness concern worth flagging - specific, one sentence.",
            },
            "next_week_focus": {
                "type": "string",
                "description": "One concrete, specific target for next week - one sentence.",
            },
        },
        "required": ["biggest_win", "recovery_note", "next_week_focus"],
        "additionalProperties": False,
    },
}


def generate_weekly_digest(db: Session, user_id: int) -> dict:
    """Structured 3-bullet weekly synthesis across workouts, readiness, AND
    nutrition (the prose weekly recap above only covers workouts/check-ins) -
    a forced, strict tool call so the three fields are actually enforced by
    schema rather than hoping the model self-formats into exactly three
    bullets, same pattern as meal_vision.py's report_meal_analysis."""
    client = _get_client()
    _get_user_or_raise(db, user_id)

    since_dt = _utcnow() - timedelta(days=7)
    since_date = _today() - timedelta(days=7)

    log_rows = db.execute(
        select(models.WorkoutLog, models.Exercise.name)
        .join(models.Exercise, models.WorkoutLog.exercise_id == models.Exercise.id)
        .where(models.WorkoutLog.user_id == user_id, models.WorkoutLog.performed_at >= since_dt)
        .order_by(models.WorkoutLog.performed_at.asc())
    ).all()

    checkins = db.scalars(
        select(models.CheckIn)
        .where(models.CheckIn.user_id == user_id, models.CheckIn.checkin_date >= since_date)
        .order_by(models.CheckIn.checkin_date.asc())
    ).all()

    meals = db.scalars(
        select(models.MealAnalysis)
        .where(models.MealAnalysis.user_id == user_id, models.MealAnalysis.analyzed_at >= since_dt)
        .order_by(models.MealAnalysis.analyzed_at.asc())
    ).all()

    if not log_rows and not checkins and not meals:
        return {
            "biggest_win": "No activity logged yet this week.",
            "recovery_note": "Nothing to flag - there's no data yet.",
            "next_week_focus": "Log a few workouts and check in daily so next week's digest has something to work with.",
        }

    log_lines = (
        "\n".join(
            f"- {log.performed_at.date()}: {name} - {log.sets}x{log.reps} @ {log.weight or 'bodyweight'}"
            + (f", RPE {log.rpe}" if log.rpe else "")
            for log, name in log_rows
        )
        or "none logged"
    )
    checkin_lines = (
        "\n".join(f"- {c.checkin_date}: {c.score}/5 ({c.label})" for c in checkins) or "none logged"
    )
    meal_lines = (
        "\n".join(
            f"- {m.analyzed_at.date()}: {m.description} (~{m.estimated_calories} kcal, "
            f"{m.protein_g}g protein)"
            for m in meals
        )
        or "none logged"
    )

    prompt = (
        "Synthesize this user's past 7 days of training, readiness, and nutrition into a three-bullet "
        "digest. Each field is ONE specific, concrete sentence - no fluff, no generic advice, reference "
        "actual numbers/trends from the data below wherever possible.\n\n"
        f"Workout logs (last 7 days):\n{log_lines}\n\n"
        f"Daily readiness check-ins (last 7 days):\n{checkin_lines}\n\n"
        f"Meal photo analyses (last 7 days):\n{meal_lines}"
    )

    response = client.messages.create(
        model=FAST_MODEL,
        max_tokens=400,
        tools=[WEEKLY_DIGEST_TOOL],
        tool_choice={"type": "tool", "name": "report_weekly_digest"},
        messages=[{"role": "user", "content": prompt}],
    )
    tool_block = next(block for block in response.content if block.type == "tool_use")
    return tool_block.input
