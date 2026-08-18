"""Server-side verification for /admin/* routes.

Before this existed, admin.py's `_require_admin` looked up whatever
`requester_id` the client sent as a query param and checked *that row's*
email against ADMIN_EMAILS - the requester_id itself was never verified as
belonging to the caller, so anyone who knew or guessed the real admin's
numeric user_id could pass it and read every user's data. There was no
server-side proof of identity at all, just a client-supplied claim.

This mirrors routers/auth.py's `_sign_state`/`_verify_state` pattern exactly
- a value HMAC-signed with a server-only secret, no server-side session
store or cookie needed. A token is minted once, in routers/auth.py, right
after a real Google Sign-In resolves to an email already in ADMIN_EMAILS -
never on request, since that would defeat the point. Every /admin/* route
then requires that token as a normal `Authorization: Bearer` header (not a
redirect, not something that assumes a browser - a direct API client can
authenticate the same way), and ADMIN_EMAILS is re-checked on every request
rather than trusted from token-mint time, so removing an email from that
env var takes effect immediately instead of waiting for already-issued
tokens to expire.
"""

import hashlib
import hmac
import time

from fastapi import Header, HTTPException

from app.config import ADMIN_EMAILS, OAUTH_STATE_SECRET

# A personal admin session is expected to last a working day of poking
# around /admin, not survive indefinitely - 12 hours forces a fresh Google
# Sign-In roughly once a day rather than never.
ADMIN_TOKEN_MAX_AGE_SECONDS = 12 * 60 * 60


def sign_admin_token(email: str) -> str:
    """Issued once, right after a real Google Sign-In resolves to an email
    already in ADMIN_EMAILS (see routers/auth.py) - never minted from a
    bare request."""
    timestamp = str(int(time.time()))
    payload = f"{email.lower()}.{timestamp}"
    signature = hmac.new(OAUTH_STATE_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def _verify_admin_token(token: str) -> str | None:
    # rsplit, not split: an email address itself can (and usually does)
    # contain dots, so splitting from the right by exactly 2 is what
    # correctly separates "email.timestamp.signature" regardless of how
    # many dots are in the email itself.
    try:
        email, timestamp, signature = token.rsplit(".", 2)
        payload = f"{email}.{timestamp}"
        expected = hmac.new(OAUTH_STATE_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        if (time.time() - int(timestamp)) > ADMIN_TOKEN_MAX_AGE_SECONDS:
            return None
        return email
    except ValueError:
        return None


def require_admin(authorization: str | None = Header(default=None)) -> str:
    """FastAPI dependency for every /admin/* route - replaces the old
    client-supplied `requester_id` query param entirely. Returns the
    verified admin's email. Raises 401 for anything that isn't a valid,
    unexpired, correctly-signed token (no token at all, a malformed one, or
    an expired one) and 403 for a validly-signed token whose email isn't (or
    no longer is) in ADMIN_EMAILS - a real identity that just isn't an
    admin, as distinct from no proven identity at all."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing admin token")
    token = authorization.removeprefix("Bearer ").strip()
    email = _verify_admin_token(token)
    if email is None:
        raise HTTPException(status_code=401, detail="Invalid or expired admin token")
    if email not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Not authorized as admin")
    return email
