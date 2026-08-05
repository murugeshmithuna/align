from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _today() -> date:
    return datetime.now(timezone.utc).date()


def _list_to_csv(items: list[str] | None) -> str | None:
    if not items:
        return None
    cleaned = [item.strip() for item in items if item.strip()]
    return ",".join(cleaned) if cleaned else None


def _csv_to_list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)

    # Set once a user signs in with Google; null for accounts created via the
    # plain name/email flow. `google_sub` (Google's stable per-account "sub"
    # claim, not the email) is what upserts key off - see auth.py.
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Onboarding / baseline profile - injected into the orchestrator's system
    # prompt so the chat agent never has to ask for this again.
    experience_level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    target_frequency: Mapped[int | None] = mapped_column(Integer, nullable=True)
    available_equipment_csv: Mapped[str | None] = mapped_column(
        "available_equipment", String(255), nullable=True
    )
    primary_goals_csv: Mapped[str | None] = mapped_column("primary_goals", String(255), nullable=True)
    physical_limitations: Mapped[str | None] = mapped_column(Text, nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    preferred_units: Mapped[str] = mapped_column(String(10), default="metric")  # "metric" | "imperial"

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    @property
    def available_equipment(self) -> list[str]:
        return _csv_to_list(self.available_equipment_csv)

    @available_equipment.setter
    def available_equipment(self, value: list[str] | None) -> None:
        self.available_equipment_csv = _list_to_csv(value)

    @property
    def primary_goals(self) -> list[str]:
        return _csv_to_list(self.primary_goals_csv)

    @primary_goals.setter
    def primary_goals(self, value: list[str] | None) -> None:
        self.primary_goals_csv = _list_to_csv(value)

    plans: Mapped[list["Plan"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    logs: Mapped[list["WorkoutLog"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    soreness_notes: Mapped[list["SorenessNote"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    muscle_group: Mapped[str | None] = mapped_column(String(80), nullable=True)
    equipment: Mapped[str | None] = mapped_column(String(80), nullable=True)


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    user: Mapped["User"] = relationship(back_populates="plans")
    plan_exercises: Mapped[list["PlanExercise"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan"
    )


class PlanExercise(Base):
    __tablename__ = "plan_exercises"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id"), nullable=False)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"), nullable=False)
    day_of_week: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0=Mon .. 6=Sun
    sets: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    rest_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, default=0)

    plan: Mapped["Plan"] = relationship(back_populates="plan_exercises")
    exercise: Mapped["Exercise"] = relationship()


class WorkoutLog(Base):
    __tablename__ = "logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"), nullable=False)
    plan_id: Mapped[int | None] = mapped_column(ForeignKey("plans.id"), nullable=True)
    performed_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    sets: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    rpe: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped["User"] = relationship(back_populates="logs")
    exercise: Mapped["Exercise"] = relationship()
    plan: Mapped["Plan | None"] = relationship()


class SorenessNote(Base):
    __tablename__ = "soreness_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    noted_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    muscle_group: Mapped[str] = mapped_column(String(80), nullable=False)
    severity: Mapped[int] = mapped_column(Integer, nullable=False)  # 1 (mild) - 5 (severe)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped["User"] = relationship(back_populates="soreness_notes")


class FormAnalysis(Base):
    """Summary of one batch squat-form video analysis (MediaPipe Pose). Kept
    so the `analyze_form` agent tool can answer follow-up chat questions
    ("how was my squat form?") from the most recent result without re-running
    pose detection - same RAG-lite pattern as ask_schedule's plan snapshot."""

    __tablename__ = "form_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    analyzed_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    exercise_name: Mapped[str] = mapped_column(String(120), default="Squat")
    rep_count: Mapped[int] = mapped_column(Integer, default=0)
    reps_with_good_depth: Mapped[int] = mapped_column(Integer, default=0)
    reps_with_good_knee_tracking: Mapped[int] = mapped_column(Integer, default=0)
    reps_with_good_back_angle: Mapped[int] = mapped_column(Integer, default=0)
    raw_json: Mapped[str] = mapped_column(Text)  # full per-rep detail, JSON-encoded

    user: Mapped["User"] = relationship()


class MealAnalysis(Base):
    """Summary of one Claude Vision meal-photo analysis. Kept so the
    `ask_nutrition` agent tool can answer follow-up chat questions ("how am I
    doing on protein this week?") from recent analyses without re-sending the
    photo - same RAG-lite pattern as `analyze_form`/`form_analyses`."""

    __tablename__ = "meal_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    analyzed_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    description: Mapped[str] = mapped_column(Text)
    estimated_calories: Mapped[int] = mapped_column(Integer)
    protein_g: Mapped[float] = mapped_column(Float)
    carbs_g: Mapped[float] = mapped_column(Float)
    fat_g: Mapped[float] = mapped_column(Float)
    assessment: Mapped[str] = mapped_column(Text)

    user: Mapped["User"] = relationship()


CHECKIN_LABELS = {
    1: "Sick / Exhausted",
    2: "Sore",
    3: "Normal",
    4: "Good",
    5: "Pumped Up",
}

PLAN_STATUS_LABELS = {
    "rest_mobility": "Rest / Mobility",
    "scaled_down": "Scaled Down",
    "normal": "Normal",
}


def plan_status_for_score(score: int) -> str:
    """Deterministic, LLM-free mapping from a readiness score to today's plan
    status - applied immediately on check-in submit, no chat message needed."""
    if score == 1:
        return "rest_mobility"
    if score == 2:
        return "scaled_down"
    return "normal"


class CheckIn(Base):
    """Daily readiness check-in. One row per user per calendar day (UTC) -
    submitting again the same day updates the existing row rather than
    creating a duplicate."""

    __tablename__ = "checkins"
    __table_args__ = (UniqueConstraint("user_id", "checkin_date", name="uq_checkin_user_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    checkin_date: Mapped[date] = mapped_column(Date, default=_today)
    score: Mapped[int] = mapped_column(Integer, nullable=False)  # 1 (sick/exhausted) - 5 (pumped up)
    # Auto-derived from score at submit time (see plan_status_for_score) -
    # "rest_mobility" | "scaled_down" | "normal". Set without any LLM call.
    plan_status: Mapped[str] = mapped_column(String(20), default="normal")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    user: Mapped["User"] = relationship()

    @property
    def label(self) -> str:
        return CHECKIN_LABELS.get(self.score, "Unknown")

    @property
    def plan_status_label(self) -> str:
        return PLAN_STATUS_LABELS.get(self.plan_status, "Unknown")
