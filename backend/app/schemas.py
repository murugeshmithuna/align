from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr

ExperienceLevel = Literal["beginner", "intermediate", "advanced"]


# ---------- Users ----------


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    experience_level: ExperienceLevel | None = None
    target_frequency: int | None = None
    available_equipment: list[str] | None = None
    primary_goals: list[str] | None = None
    physical_limitations: str | None = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    experience_level: str | None
    target_frequency: int | None
    available_equipment: list[str]
    primary_goals: list[str]
    physical_limitations: str | None
    created_at: datetime


class UserProfileUpdate(BaseModel):
    user_id: int
    experience_level: ExperienceLevel | None = None
    target_frequency: int | None = None
    available_equipment: list[str] | None = None
    primary_goals: list[str] | None = None
    physical_limitations: str | None = None


# ---------- Exercises ----------


class ExerciseCreate(BaseModel):
    name: str
    muscle_group: str | None = None
    equipment: str | None = None


class ExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    muscle_group: str | None
    equipment: str | None


# ---------- Plans ----------


class PlanExerciseCreate(BaseModel):
    exercise_id: int
    day_of_week: int | None = None
    sets: int | None = None
    reps: int | None = None
    target_weight: float | None = None
    order_index: int = 0


class PlanExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise_id: int
    day_of_week: int | None
    sets: int | None
    reps: int | None
    target_weight: float | None
    order_index: int


class PlanCreate(BaseModel):
    user_id: int
    name: str
    notes: str | None = None
    plan_exercises: list[PlanExerciseCreate] = []


class PlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    is_active: bool
    notes: str | None
    created_at: datetime
    plan_exercises: list[PlanExerciseOut] = []


# ---------- Logs ----------


class LogCreate(BaseModel):
    user_id: int
    exercise_id: int
    plan_id: int | None = None
    sets: int | None = None
    reps: int | None = None
    weight: float | None = None
    rpe: float | None = None
    notes: str | None = None


class LogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    exercise_id: int
    plan_id: int | None
    performed_at: datetime
    sets: int | None
    reps: int | None
    weight: float | None
    rpe: float | None
    notes: str | None


# ---------- Progress ----------


class VolumePoint(BaseModel):
    date: date
    total_volume: float


class ExerciseHistoryPoint(BaseModel):
    performed_at: datetime
    weight: float | None
    reps: int | None
    sets: int | None
    is_pr: bool


class ExerciseProgress(BaseModel):
    exercise_id: int
    exercise_name: str
    history: list[ExerciseHistoryPoint]


class ProgressOut(BaseModel):
    volume_by_date: list[VolumePoint]
    exercises: list[ExerciseProgress]


# ---------- Soreness notes ----------


class SorenessNoteCreate(BaseModel):
    user_id: int
    muscle_group: str
    severity: int
    notes: str | None = None


class SorenessNoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    noted_at: datetime
    muscle_group: str
    severity: int
    notes: str | None


# ---------- Daily check-in ----------


class CheckInCreate(BaseModel):
    user_id: int
    score: int  # 1 (sick/exhausted) - 5 (pumped up)


class CheckInOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    checkin_date: date
    score: int
    label: str
    plan_status: str
    plan_status_label: str
    created_at: datetime


# ---------- Agent ----------


class AgentChatRequest(BaseModel):
    user_id: int
    message: str


class AgentToolCall(BaseModel):
    name: str
    input: dict
    result: dict


class AgentChatResponse(BaseModel):
    reply: str
    tool_calls: list[AgentToolCall] = []


class WeeklyRecapOut(BaseModel):
    recap: str


class DebateRequest(BaseModel):
    user_id: int
    question: str | None = None


class DebateOut(BaseModel):
    question: str
    strength_position: str
    recovery_position: str
    resolution: str


# ---------- Fatigue modeling & asymmetry ----------


class FatiguePoint(BaseModel):
    date: date
    load: float
    fitness: float
    fatigue: float
    form: float


class FatigueRisk(BaseModel):
    risk_level: Literal["low", "moderate", "high", "unknown"]
    message: str
    form_ratio: float | None


class FatigueOut(BaseModel):
    series: list[FatiguePoint]
    risk: FatigueRisk


class AsymmetryRequest(BaseModel):
    left_values: list[float]
    right_values: list[float]
    metric_name: str = "measurement"


class AsymmetryOut(BaseModel):
    metric_name: str
    left_avg: float
    right_avg: float
    diff_pct: float
    stronger_side: Literal["left", "right", "even"]
    flagged: bool
    message: str


# ---------- Vision (squat form analysis) ----------


class RepAnalysis(BaseModel):
    rep_index: int
    min_knee_angle: float
    knee_ankle_offset_pct: float
    back_angle_deg: float
    depth_ok: bool
    knee_tracking_ok: bool
    back_angle_ok: bool


class FormAnalysisOut(BaseModel):
    id: int
    analyzed_at: datetime
    exercise_name: str
    rep_count: int
    video_duration_s: float | None
    reps: list[RepAnalysis]
