from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=schemas.UserOut, status_code=200)
def create_user(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    """Find-or-create by email. There's no password system yet, so this also
    doubles as the "sign in with your own email" path for a returning user
    who isn't using Google Sign-In - typing an email you already know signs
    you back into that account instead of erroring. This intentionally never
    lists or reveals *other* accounts (see the removed GET "" collection
    endpoint below, which used to return every user's name/email to any
    unauthenticated caller - a PII/account-enumeration exposure on the public
    /login page)."""
    existing = db.scalar(select(models.User).where(models.User.email == payload.email))
    if existing:
        return existing

    user = models.User(**payload.model_dump())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# NOTE: there is deliberately no `GET "" -> list[UserOut]` endpoint here.
# It used to return every registered user's name/email to any
# unauthenticated caller, and the public /login page rendered that as a
# clickable "sign in as anyone" picker - a PII exposure / account-enumeration
# bug. Do not reintroduce a bulk user-listing endpoint without real
# authentication + authorization in front of it.


@router.get("/{user_id}", response_model=schemas.UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
