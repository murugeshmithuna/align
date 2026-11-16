from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.guest import block_guest_writes
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


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_account(
    current_user: models.User = Depends(block_guest_writes),
    db: Session = Depends(get_db),
):
    """Permanently deletes the authenticated user's row and every row that
    references it - plans/plan_exercises, logs, soreness notes, form
    analyses, live-session-form history, meal analyses, and check-ins - via
    the cascade relationships declared on the User model (models.py). The
    guest demo account can't be deleted through this route (block_guest_writes
    rejects it the same way it rejects every other guest write); it's reset
    on a schedule instead (POST /auth/guest/reset), not deleted outright,
    since the public demo needs to keep existing for the next visitor.
    """
    db.delete(current_user)
    db.commit()
