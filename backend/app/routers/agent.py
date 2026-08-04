from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app import models, schemas
from app.agent.orchestrator import run_agent_turn, stream_agent_turn
from app.database import get_db

router = APIRouter(prefix="/agent", tags=["agent"])


@router.post("/chat", response_model=schemas.AgentChatResponse)
def agent_chat(payload: schemas.AgentChatRequest, db: Session = Depends(get_db)):
    if not db.get(models.User, payload.user_id):
        raise HTTPException(status_code=404, detail="User not found")
    try:
        return run_agent_turn(db, payload.user_id, payload.message)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/chat/stream")
def agent_chat_stream(payload: schemas.AgentChatRequest, db: Session = Depends(get_db)):
    if not db.get(models.User, payload.user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return StreamingResponse(
        stream_agent_turn(db, payload.user_id, payload.message),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )
