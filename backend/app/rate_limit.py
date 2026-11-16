"""Per-user rate limiting for the routes that call Claude (the actual
paid-API cost surface): agent chat, coach resolution, the weekly/daily
review generators, and the vision endpoints that make an LLM call (meal
photo/text analysis, per-ingredient macro lookup, live-session form
feedback). Before this, nothing stood between any single caller and
an unbounded number of real Claude API calls - a script hammering
/agent/chat could run up the API bill with nothing to stop it.

Keyed by the authenticated user's id, not IP - every targeted route already
requires a valid session (app/user_auth.py), so limiting per-user is both
more accurate (no shared-IP/NAT false sharing) and the actual unit the cost
risk is measured in. Falls back to the caller's IP only for the (rare, and
already-401-bound-to-fail) case of a request with no valid token at all, so
the limiter itself never raises on a missing/bad token - get_current_user's
own dependency is what rejects those, with its own clear 401.
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.user_auth import _verify_user_token

# Generous enough for genuine interactive use (a real person chatting,
# reviewing their week, logging a meal) while blocking a scripted loop from
# running unbounded Claude calls against one account.
LLM_RATE_LIMIT = "20/minute"


def _rate_limit_key(request: Request) -> str:
    authorization = request.headers.get("authorization") or ""
    if authorization.startswith("Bearer "):
        user_id = _verify_user_token(authorization.removeprefix("Bearer ").strip())
        if user_id is not None:
            return f"user:{user_id}"
    return get_remote_address(request)


limiter = Limiter(key_func=_rate_limit_key)


async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "You're sending requests faster than we can process them - please wait a moment and try again."},
    )
