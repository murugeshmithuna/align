from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app import models, schemas
from app.agent.orchestrator import (
    generate_daily_nutrition_review,
    generate_weekly_digest,
    generate_weekly_nutrition_review,
    generate_weekly_recap,
    run_agent_turn,
    stream_agent_turn,
)
from app.agent.resolution import generate_coach_resolution
from app.agent.tools import execute_adjust_plan
from app.database import get_db
from app.guest import block_guest_writes
from app.rate_limit import LLM_RATE_LIMIT, limiter
from app.user_auth import get_current_user

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/chat", response_model=schemas.AgentChatResponse)
@limiter.limit(LLM_RATE_LIMIT)
def agent_chat(
    request: Request,
    payload: schemas.AgentChatRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        return run_agent_turn(db, current_user.id, payload.message, payload.history, payload.client_date)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None


@router.post("/chat/stream")
@limiter.limit(LLM_RATE_LIMIT)
def agent_chat_stream(
    request: Request,
    payload: schemas.AgentChatRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return StreamingResponse(
        stream_agent_turn(db, current_user.id, payload.message, payload.history, payload.client_date),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


@router.get("/weekly-recap", response_model=schemas.WeeklyRecapOut)
@limiter.limit(LLM_RATE_LIMIT)
def weekly_recap(
    request: Request, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    try:
        return {"recap": generate_weekly_recap(db, current_user.id)}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None


@router.get("/weekly-digest", response_model=schemas.WeeklyDigestOut)
@limiter.limit(LLM_RATE_LIMIT)
def weekly_digest(
    request: Request, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    try:
        return generate_weekly_digest(db, current_user.id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None


@router.get("/nutrition-review/daily", response_model=schemas.NutritionReviewOut)
@limiter.limit(LLM_RATE_LIMIT)
def nutrition_review_daily(
    request: Request, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    try:
        return generate_daily_nutrition_review(db, current_user.id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None


@router.get("/nutrition-review/weekly", response_model=schemas.NutritionReviewOut)
@limiter.limit(LLM_RATE_LIMIT)
def nutrition_review_weekly(
    request: Request, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)
):
    try:
        return generate_weekly_nutrition_review(db, current_user.id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None


@router.post("/coach-resolution", response_model=schemas.CoachResolutionOut)
@limiter.limit(LLM_RATE_LIMIT)
def coach_resolution(
    request: Request,
    payload: schemas.CoachResolutionRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        return generate_coach_resolution(db, current_user.id, payload.question)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from None


@router.post("/coach-resolution/apply", response_model=schemas.ApplyResolutionOut)
def apply_coach_resolution(
    payload: schemas.ApplyResolutionRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(block_guest_writes),
):
    result = execute_adjust_plan(
        db,
        current_user.id,
        {"plan_id": payload.plan_id, "updates": [u.model_dump(exclude_unset=True) for u in payload.updates]},
    )
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result
