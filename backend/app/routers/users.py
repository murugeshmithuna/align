from fastapi import APIRouter, Depends

from app import models, schemas
from app.user_auth import get_current_user

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


@router.get("/me", response_model=schemas.UserOut)
def get_current_user_profile(current_user: models.User = Depends(get_current_user)):
    return current_user
