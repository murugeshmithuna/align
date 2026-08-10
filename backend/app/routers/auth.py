import hashlib
import hmac
import secrets
import time
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import FRONTEND_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_STATE_SECRET
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

# A single reusable Request object - it caches Google's public certs
# internally rather than re-fetching them on every verification call.
_google_request = google_requests.Request()

GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
STATE_MAX_AGE_SECONDS = 600  # 10 minutes - generous for a user sitting on Google's consent screen


def _sign_state() -> str:
    """A random nonce + timestamp, HMAC-signed with a server-only secret -
    proves on callback that this request followed a /start redirect this
    server actually issued, without needing any server-side session store
    or a cookie of any kind. This deliberately replaces Google Identity
    Services' own g_csrf_token double-submit-cookie mechanism, which Safari's
    Intelligent Tracking Prevention was blocking for real users (confirmed
    live) - ITP partitions/discards a cookie set as a side effect of a
    script loaded from a domain Safari classifies as a tracker (accounts.
    google.com), even when the cookie's own origin is same-site, so no
    Google-set cookie can be relied on here at all. A plain signed string
    passed through the URL's query string has no cookie involved on either
    side, so ITP has nothing to block."""
    nonce = secrets.token_urlsafe(24)
    timestamp = str(int(time.time()))
    payload = f"{nonce}.{timestamp}"
    signature = hmac.new(OAUTH_STATE_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{signature}"


def _verify_state(state: str) -> bool:
    try:
        nonce, timestamp, signature = state.split(".")
    except ValueError:
        return False
    payload = f"{nonce}.{timestamp}"
    expected = hmac.new(OAUTH_STATE_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return False
    return (time.time() - int(timestamp)) <= STATE_MAX_AGE_SECONDS


def _upsert_user_from_claims(db: Session, claims: dict) -> tuple[models.User, bool]:
    """Shared by both the legacy POST /auth/google (id_token straight from
    the client) and the new server-side redirect flow's callback (id_token
    obtained via a server-to-server code exchange) - identical trust model
    either way: the id_token has already been cryptographically verified
    against Google's own public certs by the time this runs."""
    google_sub = claims["sub"]
    email = claims.get("email")
    photo_url = claims.get("picture")

    user = db.scalar(select(models.User).where(models.User.google_sub == google_sub))
    is_new_user = False

    if not user and email:
        # A plain name/email account may already exist for this address
        # (this app's other signup path) - link it to this Google identity
        # rather than creating a duplicate account with the same email.
        user = db.scalar(select(models.User).where(models.User.email == email))
        if user:
            user.google_sub = google_sub
            if photo_url:
                user.photo_url = photo_url

    if not user:
        if not email:
            raise HTTPException(status_code=400, detail="Google account has no email to sign in with.")
        name = claims.get("name") or email.split("@")[0]
        user = models.User(name=name, email=email, google_sub=google_sub, photo_url=photo_url)
        db.add(user)
        is_new_user = True

    db.commit()
    db.refresh(user)
    return user, is_new_user


@router.post("/google", response_model=schemas.GoogleAuthOut)
def google_sign_in(payload: schemas.GoogleAuthRequest, db: Session = Depends(get_db)):
    """Verifies a Google Identity Services id_token server-side (signature +
    audience, via Google's own public certs - never trust a token's claims
    without this) and upserts a User. Kept for any caller that already has a
    verified id_token in hand; the Login.jsx button itself now uses the
    server-side redirect flow below instead (see /auth/google/start), which
    doesn't depend on Google's own client-side script/cookie at all."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=503, detail="Google sign-in is not configured (missing GOOGLE_CLIENT_ID)."
        )

    try:
        claims = google_id_token.verify_oauth2_token(payload.id_token, _google_request, GOOGLE_CLIENT_ID)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {exc}") from exc

    user, is_new_user = _upsert_user_from_claims(db, claims)
    return {"user": user, "is_new_user": is_new_user}


@router.get("/google/start")
def google_sign_in_start(request: Request):
    """Kicks off the classic server-side OAuth 2.0 authorization-code flow -
    a plain top-level browser redirect to Google's own consent screen, no
    Google-hosted JavaScript involved on this app's pages at all. This is
    the actual fix for the Safari sign-in failures real users hit: the
    previous flow (Google Identity Services' redirect mode) still failed for
    some users because its CSRF check depends on a g_csrf_token cookie set
    by a script loaded from accounts.google.com - Safari's Intelligent
    Tracking Prevention silently discards cookies set that way, regardless
    of the redirect target's own origin, and there's no user-facing setting
    that fixes it short of disabling tracking protection entirely (not
    something real users should ever have to do). This flow never sets or
    reads a Google-origin cookie at any point."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Google sign-in is not configured (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).",
        )

    redirect_uri = f"{str(request.base_url).rstrip('/')}/auth/google/callback"
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": _sign_state(),
        "prompt": "select_account",
    }
    return RedirectResponse(f"{GOOGLE_AUTH_ENDPOINT}?{urlencode(params)}")


@router.get("/google/callback")
def google_sign_in_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    """Google redirects the browser back here with a one-time `code` after
    the user approves consent - this handler exchanges it for tokens
    server-to-server (a plain HTTPS POST, no browser/cookie involvement
    whatsoever) and finishes sign-in, then bounces the browser back into the
    SPA with the same ?uid=&is_new= contract Login.jsx already handled for
    the old flow, so nothing on the frontend's landing logic needed to
    change."""
    def fail(reason: str) -> RedirectResponse:
        return RedirectResponse(f"{FRONTEND_URL}/login?google_error={reason}")

    if error:
        return fail(error)
    if not code or not state or not _verify_state(state):
        return fail("invalid_state")

    redirect_uri = f"{str(request.base_url).rstrip('/')}/auth/google/callback"
    try:
        token_response = requests.post(
            GOOGLE_TOKEN_ENDPOINT,
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=15,
        )
        token_response.raise_for_status()
        id_token_value = token_response.json().get("id_token")
    except requests.RequestException:
        return fail("token_exchange_failed")

    if not id_token_value:
        return fail("no_id_token")

    try:
        claims = google_id_token.verify_oauth2_token(id_token_value, _google_request, GOOGLE_CLIENT_ID)
    except ValueError:
        return fail("invalid_id_token")

    try:
        user, is_new_user = _upsert_user_from_claims(db, claims)
    except HTTPException as exc:
        return fail(str(exc.detail).replace(" ", "_"))

    return RedirectResponse(f"{FRONTEND_URL}/login?uid={user.id}&is_new={str(is_new_user).lower()}")
