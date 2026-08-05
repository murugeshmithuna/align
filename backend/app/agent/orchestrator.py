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
and plain conversation for everything else.

ask_schedule and analyze_form return facts only (the active plan's schedule/training history, or the \
user's most recent squat video analysis) - compose the actual answer yourself from those facts. If your \
answer implies a schedule or volume change the user wants, follow up by calling adjust_plan in the same \
turn rather than just describing the change. If analyze_form reports no analysis yet, tell the user to \
upload a squat video on the Live Session page.

YOU ALREADY HAVE the user's saved profile (experience level, target frequency, available equipment, \
primary goals, physical limitations) and today's readiness check-in score - both are provided below as \
context on every turn. Do not ask the user to restate any of it.

NO CLARIFYING QUESTIONS for standard requests. When the user asks for a routine (e.g. "abs workout", \
"leg day", "adjust today's session"), IMMEDIATELY call generate_workout_plan or adjust_plan using the \
existing profile and check-in context - do not ask about session length, exercise preferences, or \
baseline details first. Output the final plan directly. Only ask a follow-up question if something is \
truly impossible to proceed without; in every other case, act first and explain your choices afterward.

Today's plan status (see context below) may already be auto-adjusted based on a low readiness score \
before the user ever opens chat: a low score (1-2) means today's baseline routine has already been \
marked "Scaled Down" or "Rest / Mobility" in the database, with no chat message required. If the user \
asks about today's session, reflect that status, and if they want the specifics use adjust_plan to \
apply the actual reduced sets/reps/intensity. A high score (4-5) means the planned volume/intensity is \
fine, or can be nudged up if the user wants to push.

Only call a tool when the request requires a database change or grounded data lookup. For general \
conversation, questions, or clarifications, respond directly without calling a tool. Every tool call is \
automatically scoped to the current user - never ask the user for their user_id."""

MAX_TURNS = 6

# The routing pass only ever needs to name a tool, never fill in its full
# arguments (that's the heavier model's job) - so it gets its own tiny schema.
# Handing the router the *real* tool schemas made the fast model try to write
# out a whole exercise list itself, which routinely hit max_tokens mid-JSON
# and got silently misread as "no tool needed".
ROUTING_TOOL = {
    "name": "route_to_tool",
    "description": (
        "Call this ONLY if the user's request requires generate_workout_plan, adjust_plan, "
        "suggest_supplements, ask_schedule, or analyze_form - i.e. it needs a database change or a "
        "grounded data lookup. For general conversation, questions, or advice that doesn't need one of "
        "those, do not call this - just answer directly with text instead."
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


def run_agent_turn(db: Session, user_id: int, message: str) -> dict:
    client = _get_client()
    user = _get_user_or_raise(db, user_id)
    system_prompt = (
        f"{SYSTEM_PROMPT}\n\n{_build_profile_context(user)}\n\n{_build_checkin_context(db, user_id)}"
    )

    # Fast routing pass: a cheap model answers directly whenever no tool is
    # needed, so plain conversation never touches the heavier reasoning model.
    router_response = client.messages.create(
        model=FAST_MODEL,
        max_tokens=1024,
        system=system_prompt,
        tools=[ROUTING_TOOL],
        messages=[{"role": "user", "content": message}],
    )
    if router_response.stop_reason != "tool_use":
        reply = "".join(block.text for block in router_response.content if block.type == "text")
        return {"reply": reply, "tool_calls": []}

    # Tool path: redo the loop from scratch on the heavier reasoning model,
    # since it's the one that should actually author the plan/adjustment.
    messages: list[dict] = [{"role": "user", "content": message}]
    tool_call_log: list[dict] = []

    for _ in range(MAX_TURNS):
        response = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=4096,
            system=system_prompt,
            tools=TOOL_SCHEMAS,
            messages=messages,
        )
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            final_text = "".join(block.text for block in response.content if block.type == "text")
            return {"reply": final_text, "tool_calls": tool_call_log}

        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
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

    return {
        "reply": "I couldn't finish that within the allotted steps - please try rephrasing.",
        "tool_calls": tool_call_log,
    }


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


def stream_agent_turn(db: Session, user_id: int, message: str) -> Iterator[str]:
    """Yields SSE-formatted `data: {...}\\n\\n` frames as the agent responds.

    Frame shapes: {"content": "<token>"} for streamed text, {"tool": name,
    "status": "running"|"done"} while a tool executes, {"error": "..."} on
    failure, and a final {"done": true}.
    """
    try:
        client = _get_client()
        user = _get_user_or_raise(db, user_id)
    except (RuntimeError, ValueError) as exc:
        yield _sse({"error": str(exc)})
        return

    system_prompt = (
        f"{SYSTEM_PROMPT}\n\n{_build_profile_context(user)}\n\n{_build_checkin_context(db, user_id)}"
    )

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
        yield _sse({"done": True})
        return

    # Tool path: hand off to the heavier reasoning model, starting the
    # conversation over so the router's (unused) tool_use block never needs
    # a matching tool_result.
    messages: list[dict] = [{"role": "user", "content": message}]

    for _ in range(MAX_TURNS):
        with client.messages.stream(
            model=CLAUDE_MODEL,
            max_tokens=4096,
            system=system_prompt,
            tools=TOOL_SCHEMAS,
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield _sse({"content": text})
            response = stream.get_final_message()

        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            yield _sse({"done": True})
            return

        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
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

    yield _sse({"content": "\n\nI couldn't finish that within the allotted steps - please try rephrasing."})
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
