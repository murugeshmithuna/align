from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# Shared bounds - generous enough to cover genuine extremes (a world-record
# deadlift, an ultra-endurance rep set) while rejecting obviously-impossible
# input (e.g. 1000 reps x 10 sets, slipped through with zero validation
# before this). Applied at the API boundary via Field(ge=/le=) below since
# that's the layer every client (this frontend, a future one, or a direct
# API call) actually has to go through - HTML min/max alone is only ever a
# UX nicety, never enforcement.
SETS_BOUNDS = {"ge": 1, "le": 20}
REPS_BOUNDS = {"ge": 1, "le": 200}
WEIGHT_BOUNDS = {"ge": 0, "le": 1200}  # covers kg or lb usage; heaviest raw deadlift on record is ~501kg/1104lb
RPE_BOUNDS = {"ge": 0, "le": 10}
REST_SECONDS_BOUNDS = {"ge": 0, "le": 3600}

ExperienceLevel = Literal["beginner", "intermediate", "advanced"]
UnitPreference = Literal["metric", "imperial"]
Sex = Literal["male", "female"]
ActivityLevel = Literal["sedentary", "light", "moderate", "very_active"]


# ---------- Users ----------


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    experience_level: ExperienceLevel | None = None
    target_frequency: int | None = Field(default=None, ge=1, le=7)
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
    age: int | None
    sex: Sex | None
    activity_level: ActivityLevel | None
    daily_calorie_target: int | None
    daily_protein_target: float | None
    daily_carbs_target: float | None
    daily_fat_target: float | None
    daily_fiber_target: float | None
    created_at: datetime


class UserProfileUpdate(BaseModel):
    user_id: int
    experience_level: ExperienceLevel | None = None
    target_frequency: int | None = Field(default=None, ge=1, le=7)
    available_equipment: list[str] | None = None
    primary_goals: list[str] | None = None
    physical_limitations: str | None = None
    # 50cm/272cm - shortest documented adult to tallest documented human.
    height_cm: float | None = Field(default=None, ge=50, le=272)
    # 20kg/450kg - generous either side of any plausible adult bodyweight.
    weight_kg: float | None = Field(default=None, ge=20, le=450)
    preferred_units: UnitPreference | None = None
    age: int | None = Field(default=None, ge=10, le=120)
    sex: Sex | None = None
    activity_level: ActivityLevel | None = None
    daily_calorie_target: int | None = Field(default=None, ge=500, le=10000)
    daily_protein_target: float | None = Field(default=None, ge=0, le=500)
    daily_carbs_target: float | None = Field(default=None, ge=0, le=1000)
    daily_fat_target: float | None = Field(default=None, ge=0, le=500)
    daily_fiber_target: float | None = Field(default=None, ge=0, le=200)


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
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    sets: int | None = Field(default=None, **SETS_BOUNDS)
    reps: int | None = Field(default=None, **REPS_BOUNDS)
    target_weight: float | None = Field(default=None, **WEIGHT_BOUNDS)
    rest_seconds: int | None = Field(default=None, **REST_SECONDS_BOUNDS)
    order_index: int = Field(default=0, ge=0, le=1000)


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
    sets: int | None = Field(default=None, **SETS_BOUNDS)
    reps: int | None = Field(default=None, **REPS_BOUNDS)
    weight: float | None = Field(default=None, **WEIGHT_BOUNDS)
    rpe: float | None = Field(default=None, **RPE_BOUNDS)
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
    # Computed on the fly at response time (app/agent/fatigue.py's
    # estimate_calories_burned - MET x weight_kg x duration_hours), not a
    # stored column - None if the user has no weight_kg set yet, never a
    # fabricated number. Set as a transient attribute on the ORM object
    # before serialization (see routers/logs.py).
    estimated_calories: float | None = None


# ---------- Progress ----------


class VolumePoint(BaseModel):
    date: date
    total_volume: float


class CaloriePoint(BaseModel):
    date: date
    total_calories: float


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
    # Estimated calories burned per day (MET formula, see
    # app/agent/fatigue.py's estimate_calories_burned) - empty when the
    # user's weight_kg isn't set, same "don't fabricate" rule as everywhere
    # else in this app rather than assuming a default body weight.
    calories_by_date: list[CaloriePoint]
    exercises: list[ExerciseProgress]


# ---------- Soreness notes ----------


class SorenessNoteCreate(BaseModel):
    user_id: int
    muscle_group: str
    severity: int = Field(ge=1, le=5)
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
    score: int = Field(ge=1, le=5)  # 1 (sick/exhausted) - 5 (pumped up)


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


class NutritionReviewOut(BaseModel):
    macro_status: str
    key_pattern: str
    recommendation: str
    # Only populated by the weekly review (daily has no 7-day denominator) -
    # lets the frontend render real progress bars instead of parsing numbers
    # back out of macro_status's prose.
    days_logged: int | None = None
    avg_calories: float | None = None
    avg_protein: float | None = None
    avg_carbs: float | None = None
    avg_fat: float | None = None
    calorie_target: int | None = None
    protein_target: float | None = None
    carbs_target: float | None = None
    fat_target: float | None = None
    # 7-point (oldest -> newest) daily series for sparkline charts on the frontend.
    daily_calories: list[float] | None = None
    daily_protein: list[float] | None = None
    daily_carbs: list[float] | None = None
    daily_fat: list[float] | None = None


class CoachResolutionRequest(BaseModel):
    user_id: int
    question: str | None = None


class PlanAdjustmentItem(BaseModel):
    plan_exercise_id: int
    sets: int | None = Field(default=None, **SETS_BOUNDS)
    reps: int | None = Field(default=None, **REPS_BOUNDS)
    target_weight: float | None = Field(default=None, **WEIGHT_BOUNDS)


class CoachResolutionOut(BaseModel):
    question: str
    factors_evaluated: list[str]
    resolution: str
    plan_adjustments: list[PlanAdjustmentItem]
    plan_id: int | None


class ApplyResolutionRequest(BaseModel):
    user_id: int
    plan_id: int
    updates: list[PlanAdjustmentItem]


class ApplyResolutionOut(BaseModel):
    plan_id: int
    updated_plan_exercise_ids: list[int]


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


MeasurementValue = Annotated[float, Field(ge=0, le=10000)]


class AsymmetryRequest(BaseModel):
    left_values: list[MeasurementValue]
    right_values: list[MeasurementValue]
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


# ---------- Vision (live-tracked session form feedback) ----------


class LiveRepResult(BaseModel):
    rep_index: int
    min_angle: float
    depth_ok: bool
    form_ok: bool


class LiveSessionFormCreate(BaseModel):
    user_id: int
    exercise_name: str
    reps: list[LiveRepResult]


class FormFeedbackOut(BaseModel):
    # 1-3 short, specific things to work on - empty if form was clean.
    focus_areas: list[str]
    # One short sentence comparing this session to the previous one, or
    # noting there's nothing to compare against yet.
    trend: str
    # One short sentence: improving / plateauing / declining, with why.
    overall_insight: str
    # True only for a genuine sustained bad-form pattern (see
    # orchestrator.py's FORM_FEEDBACK_TOOL field description) - already
    # computed by generate_live_session_form_feedback() and required on its
    # forced tool call, but silently dropped from every /vision/live-session-
    # form response before this fix since this response_model didn't declare
    # them (FastAPI's response_model filters out any field not listed here,
    # even if the underlying dict/object actually has it). Found live-testing
    # LiveSession.jsx's post-session injury-risk callout (already correctly
    # coded on the frontend) against this endpoint - it never had the data to
    # render.
    injury_risk_flagged: bool
    injury_risk_note: str
    rep_count: int
    good_depth_pct: float
    good_form_pct: float
    previous_rep_count: int | None = None
    previous_good_depth_pct: float | None = None
    previous_good_form_pct: float | None = None
    sessions_compared: int


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
    estimated_calories: int = Field(ge=0, le=5000)
    protein_g: float = Field(ge=0, le=500)
    carbs_g: float = Field(ge=0, le=500)
    fat_g: float = Field(ge=0, le=500)
    macro_summary: str
    quick_tip: str
    timing_note: str


class IngredientEstimateRequest(BaseModel):
    name: str
    quantity: str


class IngredientEstimateOut(BaseModel):
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float


# ---------- Admin ----------


class AdminUserSummary(BaseModel):
    id: int
    name: str
    email: EmailStr
    created_at: datetime
    signed_in_with_google: bool
    plan_count: int
    log_count: int
    meal_count: int
    checkin_count: int


class AdminUserDetail(BaseModel):
    user: UserOut
    plans: list[PlanOut]
    recent_logs: list[LogOut]
    recent_meals: list[MealAnalysisOut]
    recent_checkins: list[CheckInOut]
    recent_soreness_notes: list[SorenessNoteOut]
