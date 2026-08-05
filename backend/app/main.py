from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import models
from app.database import Base, engine
from app.routers import agent, checkin, exercises, fatigue, logs, plans, soreness, user_profile, users

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="AI Fitness Agent API",
    description="Backend for the AI Fitness Agent — a coach that watches, listens, and adapts.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users.router)
app.include_router(exercises.router)
app.include_router(plans.router)
app.include_router(logs.router)
app.include_router(soreness.router)
app.include_router(user_profile.router)
app.include_router(checkin.router)
app.include_router(agent.router)
app.include_router(fatigue.router)


@app.get("/health", tags=["health"])
def health_check():
    """Quick liveness check to confirm the API is running smoothly."""
    return {"status": "ok", "service": "AI Fitness Agent API", "version": app.version}


@app.get("/", tags=["health"])
def root():
    return {"message": "AI Fitness Agent API is running. See /docs for the interactive API explorer."}
