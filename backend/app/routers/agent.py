from fastapi import APIRouter, Depends, HTTPException
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

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/chat", response_model=schemas.AgentChatResponse)
def agent_chat(payload: schemas.AgentChatRequest, db: Session = Depends(get_db)):
    if not db.get(models.User, payload.user_id):
        raise HTTPException(status_code=404, detail="User not found")
    try:
        return run_agent_turn(db, payload.user_id, payload.message, payload.history, payload.client_date)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/chat/stream")
def agent_chat_stream(payload: schemas.AgentChatRequest, db: Session = Depends(get_db)):
    if not db.get(models.User, payload.user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return StreamingResponse(
        stream_agent_turn(db, payload.user_id, payload.message, payload.history, payload.client_date),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


@router.get("/weekly-recap/{user_id}", response_model=schemas.WeeklyRecapOut)
def weekly_recap(user_id: int, db: Session = Depends(get_db)):
    if not db.get(models.User, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    try:
        return {"recap": generate_weekly_recap(db, user_id)}
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/weekly-digest/{user_id}", response_model=schemas.WeeklyDigestOut)
def weekly_digest(user_id: int, db: Session = Depends(get_db)):
    if not db.get(models.User, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    try:
        return generate_weekly_digest(db, user_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/nutrition-review/daily/{user_id}", response_model=schemas.NutritionReviewOut)
def nutrition_review_daily(user_id: int, db: Session = Depends(get_db)):
    if not db.get(models.User, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    try:
        return generate_daily_nutrition_review(db, user_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/nutrition-review/weekly/{user_id}", response_model=schemas.NutritionReviewOut)
def nutrition_review_weekly(user_id: int, db: Session = Depends(get_db)):
    if not db.get(models.User, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    try:
        return generate_weekly_nutrition_review(db, user_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/coach-resolution", response_model=schemas.CoachResolutionOut)
def coach_resolution(payload: schemas.CoachResolutionRequest, db: Session = Depends(get_db)):
    if not db.get(models.User, payload.user_id):
        raise HTTPException(status_code=404, detail="User not found")
    try:
        return generate_coach_resolution(db, payload.user_id, payload.question)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/coach-resolution/apply", response_model=schemas.ApplyResolutionOut)
def apply_coach_resolution(payload: schemas.ApplyResolutionRequest, db: Session = Depends(get_db)):
    if not db.get(models.User, payload.user_id):
        raise HTTPException(status_code=404, detail="User not found")
    result = execute_adjust_plan(
        db,
        payload.user_id,
        {"plan_id": payload.plan_id, "updates": [u.model_dump(exclude_unset=True) for u in payload.updates]},
    )
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result
