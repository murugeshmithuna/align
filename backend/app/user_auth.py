"""Server-side session verification for every non-admin, non-public route.

Before this existed, every router (logs, plans, check-ins, meals, the agent
chat endpoints, etc.) took `user_id` straight from the client - a path
param, a query param, or a JSON body field - and used it unchecked. Anyone
who changed a number in a request could read or write another user's
workouts, meals, and check-ins: real health data, with zero server-side
proof the caller actually was that user. Google Sign-In (routers/auth.py)
verifies identity once, at sign-in - but nothing re-verified that identity
on every later request.

This mirrors admin_auth.py's existing, already-correct pattern exactly: a
value HMAC-signed with a server-only secret, carried as a normal
`Authorization: Bearer` header, no server-side session store or cookie
needed. Minted once, in routers/auth.py, right after a real Google Sign-In
resolves a user - never on request. Every route that touches a specific
user's data now takes `current_user: models.User = Depends(get_current_user)`
instead of accepting a client-supplied user_id, so the data it reads or
writes is always scoped to whoever the token actually proves the caller is.

Deliberately a longer-lived token than admin_auth.py's 12-hour one (this is
a regular user's everyday session, not a personal admin-panel session meant
to be re-proven daily) - 30 days, refreshed implicitly by just signing in
again when it expires, same as any normal "stay signed in" session.
"""

import hashlib
import hmac
import time

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.config import OAUTH_STATE_SECRET
from app.database import get_db

USER_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60  # 30 days


def sign_user_token(user_id: int) -> str:
    """Issued once, right after a real Google Sign-In resolves to a user
    (see routers/auth.py) - never minted from a bare request."""
    timestamp = str(int(time.time()))
    payload = f"{user_id}.{timestamp}"
    signature = hmac.new(OAUTH_STATE_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def _verify_user_token(token: str) -> int | None:
    try:
        user_id_str, timestamp, signature = token.split(".")
    except ValueError:
        return None
    payload = f"{user_id_str}.{timestamp}"
    expected = hmac.new(OAUTH_STATE_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return None
    if (time.time() - int(timestamp)) > USER_TOKEN_MAX_AGE_SECONDS:
        return None
    if not user_id_str.isdigit():
        return None
    return int(user_id_str)


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> models.User:
    """FastAPI dependency for every route that reads or writes one specific
    user's data. Replaces a client-supplied user_id entirely. 401 for
    anything that isn't a valid, unexpired, correctly-signed token (missing,
    malformed, expired, or signed for a user that no longer exists) - there's
    no "real identity, just not authorized" case the way admin_auth.py has,
    since every signed-in user is authorized for their own data."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing session token - please sign in")
    token = authorization.removeprefix("Bearer ").strip()
    user_id = _verify_user_token(token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session - please sign in again")
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session - please sign in again")
    return user
