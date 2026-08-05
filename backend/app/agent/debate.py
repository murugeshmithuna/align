"""Multi-agent debate: a Strength Coach and a Recovery Coach independently
reason over performance vs. recovery data, and a Head Coach resolves their
positions into one final recommendation. Three sequential Claude calls, no
tool use - each agent is just a differently-framed system prompt over a
different slice of the user's real data."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models
from app.agent.orchestrator import _get_client, _get_user_or_raise
from app.config import CLAUDE_MODEL
from app.models import _today

DEFAULT_QUESTION = "Should I push hard in training today, or back off?"

STRENGTH_COACH_PROMPT = """You are the Strength Coach, one of two specialist agents advising this \
user - the other is the Recovery Coach. You argue purely from a performance and progression \
standpoint: training load, progressive overload, momentum toward the user's strength/fitness goals. \
You've been given their recent training performance data. Give a short, opinionated position (3-5 \
sentences) on the user's question, from a pure strength-and-progression angle only - do not hedge \
into the recovery angle, that's the Recovery Coach's job to raise. Speak directly to the user in \
first person, as their strength coach."""

RECOVERY_COACH_PROMPT = """You are the Recovery Coach, one of two specialist agents advising this \
user - the other is the Strength Coach. You argue purely from a recovery and injury-prevention \
standpoint: soreness, fatigue, readiness, sustainable long-term training. You've been given their \
recent recovery/soreness/readiness data. Give a short, opinionated position (3-5 sentences) on the \
user's question, from a pure recovery angle only - do not hedge into the performance angle, that's \
the Strength Coach's job to raise. Speak directly to the user in first person, as their recovery \
coach."""

HEAD_COACH_PROMPT = """You are the Head Coach. Two of your specialist coaches just gave independent \
positions on what the user should do - a Strength Coach (performance-focused) and a Recovery Coach \
(recovery-focused). Read both positions and resolve them into ONE final, clear, actionable \
recommendation. If they're in tension, acknowledge it briefly, then make the decisive final call - \
don't just repeat both sides. Keep it to 3-5 sentences."""


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


def run_coach_debate(db: Session, user_id: int, question: str | None = None) -> dict:
    client = _get_client()
    _get_user_or_raise(db, user_id)
    question = question or DEFAULT_QUESTION

    performance_context = _build_performance_context(db, user_id)
    recovery_context = _build_recovery_context(db, user_id)

    strength_msg = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=300,
        system=STRENGTH_COACH_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"User's question: {question}\n\nRecent training performance:\n{performance_context}",
            }
        ],
    )
    strength_position = "".join(b.text for b in strength_msg.content if b.type == "text")

    recovery_msg = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=300,
        system=RECOVERY_COACH_PROMPT,
        messages=[
            {
                "role": "user",
                "content": f"User's question: {question}\n\nRecovery data:\n{recovery_context}",
            }
        ],
    )
    recovery_position = "".join(b.text for b in recovery_msg.content if b.type == "text")

    head_msg = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=400,
        system=HEAD_COACH_PROMPT,
        messages=[
            {
                "role": "user",
                "content": (
                    f"User's question: {question}\n\n"
                    f"Strength Coach's position:\n{strength_position}\n\n"
                    f"Recovery Coach's position:\n{recovery_position}"
                ),
            }
        ],
    )
    resolution = "".join(b.text for b in head_msg.content if b.type == "text")

    return {
        "question": question,
        "strength_position": strength_position,
        "recovery_position": recovery_position,
        "resolution": resolution,
    }
