from fastapi import APIRouter, Depends, HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import GOOGLE_CLIENT_ID
from app.database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

# A single reusable Request object - it caches Google's public certs
# internally rather than re-fetching them on every verification call.
_google_request = google_requests.Request()


@router.post("/google", response_model=schemas.GoogleAuthOut)
def google_sign_in(payload: schemas.GoogleAuthRequest, db: Session = Depends(get_db)):
    """Verifies a Google Identity Services id_token server-side (signature +
    audience, via Google's own public certs - never trust a token's claims
    without this) and upserts a User keyed on `google_sub`, Google's stable
    per-account id - not email, which a user could change on Google's side."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=503, detail="Google sign-in is not configured (missing GOOGLE_CLIENT_ID)."
        )

    try:
        claims = google_id_token.verify_oauth2_token(payload.id_token, _google_request, GOOGLE_CLIENT_ID)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {exc}") from exc

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
    return {"user": user, "is_new_user": is_new_user}
