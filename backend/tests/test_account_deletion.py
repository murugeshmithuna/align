"""DELETE /users/me - a real "delete my account and data" endpoint. Before
this, there was no way for a user to actually have their data removed, and
the User model's cascade relationships only covered plans/logs/soreness_notes
- form_analyses/live_session_forms/meal_analyses/checkins had no cascade at
all, so a bare db.delete(user) would have orphaned those rows (SQLite) or
failed outright on a real FK constraint (Postgres). This test seeds one real
row in every user-owned table and confirms all of them are actually gone
after deletion - not just that the endpoint returns 204.

Mirrors test_user_isolation.py's isolated in-memory-DB + TestClient pattern.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, user_auth
from app.config import GUEST_EMAIL
from app.database import Base, get_db
from app.main import app
from app.user_auth import sign_user_token


@pytest.fixture()
def client(monkeypatch):
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(engine)

    def override_get_db():
        db = testing_session_local()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(user_auth, "OAUTH_STATE_SECRET", "test-secret")

    session = testing_session_local()
    user = models.User(name="Alice", email="alice@example.com")
    guest = models.User(name="Demo Account", email=GUEST_EMAIL)
    exercise = models.Exercise(name="Back Squat")
    session.add_all([user, guest, exercise])
    session.commit()
    session.refresh(user)
    session.refresh(guest)
    session.refresh(exercise)

    plan = models.Plan(user_id=user.id, name="Test Plan")
    session.add(plan)
    session.commit()
    session.refresh(plan)

    session.add_all(
        [
            models.PlanExercise(plan_id=plan.id, exercise_id=exercise.id, sets=3, reps=5),
            models.WorkoutLog(user_id=user.id, exercise_id=exercise.id, plan_id=plan.id, sets=3, reps=5, weight=135),
            models.SorenessNote(user_id=user.id, muscle_group="Quads", severity=2),
            models.FormAnalysis(user_id=user.id, exercise_name="Squat", rep_count=5, raw_json="[]"),
            models.LiveSessionForm(user_id=user.id, exercise_name="Squat", rep_count=5, raw_json="[]"),
            models.MealAnalysis(
                user_id=user.id,
                description="Chicken and rice",
                estimated_calories=600,
                protein_g=50,
                carbs_g=60,
                fat_g=15,
                macro_summary="Balanced",
                quick_tip="Add veggies",
                timing_note="Good post-workout",
            ),
            models.CheckIn(user_id=user.id, score=4),
        ]
    )
    session.commit()
    user_id, guest_id, plan_id = user.id, guest.id, plan.id
    session.close()

    test_client = TestClient(app)
    test_client.user_id = user_id
    test_client.plan_id = plan_id
    test_client.auth_header = {"Authorization": f"Bearer {sign_user_token(user_id)}"}
    test_client.guest_auth = {"Authorization": f"Bearer {sign_user_token(guest_id)}"}
    test_client.session_factory = testing_session_local

    yield test_client

    app.dependency_overrides.clear()


def test_no_token_is_rejected(client):
    resp = client.delete("/users/me")
    assert resp.status_code == 401


def test_guest_account_cannot_delete_itself(client):
    resp = client.delete("/users/me", headers=client.guest_auth)
    assert resp.status_code == 403


def test_delete_my_account_removes_the_user_and_every_owned_row(client):
    resp = client.delete("/users/me", headers=client.auth_header)
    assert resp.status_code == 204

    db = client.session_factory()
    try:
        assert db.get(models.User, client.user_id) is None
        assert db.scalars(select(models.Plan).where(models.Plan.user_id == client.user_id)).all() == []
        assert (
            db.scalars(select(models.PlanExercise).where(models.PlanExercise.plan_id == client.plan_id)).all() == []
        )
        assert db.scalars(select(models.WorkoutLog).where(models.WorkoutLog.user_id == client.user_id)).all() == []
        assert (
            db.scalars(select(models.SorenessNote).where(models.SorenessNote.user_id == client.user_id)).all() == []
        )
        assert (
            db.scalars(select(models.FormAnalysis).where(models.FormAnalysis.user_id == client.user_id)).all() == []
        )
        assert (
            db.scalars(
                select(models.LiveSessionForm).where(models.LiveSessionForm.user_id == client.user_id)
            ).all()
            == []
        )
        assert (
            db.scalars(select(models.MealAnalysis).where(models.MealAnalysis.user_id == client.user_id)).all() == []
        )
        assert db.scalars(select(models.CheckIn).where(models.CheckIn.user_id == client.user_id)).all() == []
    finally:
        db.close()


def test_the_deleted_users_token_no_longer_works(client):
    client.delete("/users/me", headers=client.auth_header)
    resp = client.get("/users/me", headers=client.auth_header)
    assert resp.status_code == 401
