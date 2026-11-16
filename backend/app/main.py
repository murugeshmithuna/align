from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.observability import RequestIdMiddleware, configure_logging
from app.rate_limit import limiter, rate_limit_exceeded_handler
from app.routers import (
    admin,
    agent,
    auth,
    checkin,
    exercises,
    fatigue,
    logs,
    plans,
    soreness,
    user_profile,
    users,
    vision,
)

# Schema creation/changes are now Alembic's job (see backend/alembic/), not
# this app's - `Base.metadata.create_all()` only ever CREATEs tables that
# don't exist yet, it never ALTERs an existing one to add a new column, so
# relying on it as the production schema stayed correct only by luck (every
# column added here so far happened to land before the one-time Postgres
# cutover that ran create_all against a then-fully-current models.py). Run
# `alembic upgrade head` once (local dev: creates the SQLite file fresh;
# production: apply this the same way after a one-time `alembic stamp head`
# against the already-populated database, documented in README.md).

configure_logging()

app = FastAPI(
    title="ALIGN API",
    description="Backend for ALIGN — a coach that watches, listens, and adapts.",
    version="0.1.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Outermost middleware (added last, so it wraps every other layer, including
# CORS/rate-limiting) - every log line emitted while handling a request, no
# matter how deep in the call stack, carries that request's ID.
app.add_middleware(RequestIdMiddleware)

app.include_router(users.router)
app.include_router(auth.router)
app.include_router(exercises.router)
app.include_router(plans.router)
app.include_router(logs.router)
app.include_router(soreness.router)
app.include_router(user_profile.router)
app.include_router(checkin.router)
app.include_router(agent.router)
app.include_router(fatigue.router)
app.include_router(vision.router)
app.include_router(admin.router)


@app.get("/health", tags=["health"])
def health_check():
    """Quick liveness check to confirm the API is running smoothly."""
    return {"status": "ok", "service": "ALIGN API", "version": app.version}


@app.get("/", tags=["health"])
def root():
    return {"message": "ALIGN API is running. See /docs for the interactive API explorer."}
