from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr

ExperienceLevel = Literal["beginner", "intermediate", "advanced"]
UnitPreference = Literal["metric", "imperial"]


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
    photo_url: str | None
    experience_level: str | None
    target_frequency: int | None
    available_equipment: list[str]
    primary_goals: list[str]
    physical_limitations: str | None
    height_cm: float | None
    weight_kg: float | None
    preferred_units: UnitPreference
    daily_calorie_target: int | None
    daily_protein_target: float | None
    daily_carbs_target: float | None
    daily_fat_target: float | None
    created_at: datetime


class UserProfileUpdate(BaseModel):
    user_id: int
    experience_level: ExperienceLevel | None = None
    target_frequency: int | None = None
    available_equipment: list[str] | None = None
    primary_goals: list[str] | None = None
    physical_limitations: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    preferred_units: UnitPreference | None = None
    daily_calorie_target: int | None = None
    daily_protein_target: float | None = None
    daily_carbs_target: float | None = None
    daily_fat_target: float | None = None


# ---------- Auth (Google Sign-In) ----------


class GoogleAuthRequest(BaseModel):
    id_token: str


class GoogleAuthOut(BaseModel):
    user: UserOut
    is_new_user: bool


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
    rest_seconds: int | None = None
    order_index: int = 0


class PlanExerciseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    exercise_id: int
    exercise: ExerciseOut
    day_of_week: int | None
    sets: int | None
    reps: int | None
    target_weight: float | None
    rest_seconds: int | None
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
    exercise: ExerciseOut
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
    # Stateless API - the client echoes back the `history` it was given on
    # the previous response so short/context-dependent replies ("2", "yes")
    # can be resolved against the prior turn instead of looking like a
    # non-sequitur. Opaque to the caller - just persist and replay verbatim.
    history: list[dict] = []


class AgentToolCall(BaseModel):
    name: str
    input: dict
    result: dict


class AgentChoiceWidget(BaseModel):
    prompt: str
    widget_type: Literal["single_choice", "multi_select", "confirm"]
    options: list[str]


class AgentChatResponse(BaseModel):
    reply: str
    tool_calls: list[AgentToolCall] = []
    widget: AgentChoiceWidget | None = None
    history: list[dict] = []


class WeeklyRecapOut(BaseModel):
    recap: str


class WeeklyDigestOut(BaseModel):
    biggest_win: str
    recovery_note: str
    next_week_focus: str


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


# ---------- Vision (meal photo analysis) ----------


class MealAnalysisOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    analyzed_at: datetime
    description: str
    estimated_calories: int
    protein_g: float
    carbs_g: float
    fat_g: float
    macro_summary: str
    quick_tip: str
    timing_note: str


class MealIngredient(BaseModel):
    name: str
    quantity: str
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float


class MealAnalysisPreviewOut(BaseModel):
    """Unsaved analysis result - the Review & Edit step happens against this
    shape before anything is persisted. No id/analyzed_at since it isn't a
    row yet."""

    description: str
    ingredients: list[MealIngredient]
    estimated_calories: int
    protein_g: float
    carbs_g: float
    fat_g: float
    macro_summary: str
    quick_tip: str
    timing_note: str


class MealTextRequest(BaseModel):
    user_id: int
    text: str


class MealSaveRequest(BaseModel):
    user_id: int
    description: str
    estimated_calories: int
    protein_g: float
    carbs_g: float
    fat_g: float
    macro_summary: str
    quick_tip: str
    timing_note: str
