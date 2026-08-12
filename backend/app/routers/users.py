from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/users", tags=["users"])


# NOTE: there is deliberately no `POST "" -> UserOut` (find-or-create-by-
# email) endpoint here anymore. It was this app's only passwordless sign-in
# path - anyone who knew or guessed a real user's email could sign in as
# that account with zero verification. Removed before public launch; Google
# Sign-In (routers/auth.py) is now the only way to create or access an
# account. Do not reintroduce an unauthenticated create-or-login-by-email
# endpoint.
#
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
