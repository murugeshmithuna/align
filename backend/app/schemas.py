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
