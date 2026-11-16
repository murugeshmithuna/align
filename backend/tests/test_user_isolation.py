"""Confirms the real-session-auth fix in app/user_auth.py: every route that
touches one user's data now derives identity from a signed Bearer token,
never from a client-supplied value, so user A genuinely cannot read or
write user B's workouts, plans, check-ins, or meals - no matter what they
put in the request. Before this fix, every one of these endpoints trusted
whatever user_id the caller sent.

Mirrors test_admin_auth.py's isolated in-memory-DB + TestClient pattern.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, user_auth
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
    alice = models.User(name="Alice", email="alice@example.com")
    bob = models.User(name="Bob", email="bob@example.com")
    # Seeded directly - POST /exercises makes a real Claude API call
    # (validate_exercise_name), which this isolated test has no business
    # depending on; a log's exercise_id just needs a real foreign key to
    # point at.
    exercise = models.Exercise(name="Back Squat")
    session.add_all([alice, bob, exercise])
    session.commit()
    session.refresh(alice)
    session.refresh(bob)
    session.refresh(exercise)
    alice_id, bob_id, exercise_id = alice.id, bob.id, exercise.id
    session.close()

    test_client = TestClient(app)
    test_client.alice_id = alice_id
    test_client.bob_id = bob_id
    test_client.exercise_id = exercise_id
    test_client.alice_auth = {"Authorization": f"Bearer {sign_user_token(alice_id)}"}
    test_client.bob_auth = {"Authorization": f"Bearer {sign_user_token(bob_id)}"}

    yield test_client

    app.dependency_overrides.clear()


def test_no_token_is_rejected_on_a_protected_route(client):
    resp = client.get("/user/profile")
    assert resp.status_code == 401


def test_malformed_token_is_rejected(client):
    resp = client.get("/user/profile", headers={"Authorization": "Bearer not-a-real-token"})
    assert resp.status_code == 401


def test_profile_route_returns_only_the_caller_s_own_data(client):
    client.post("/user/profile", json={"experience_level": "advanced"}, headers=client.alice_auth)
    client.post("/user/profile", json={"experience_level": "beginner"}, headers=client.bob_auth)

    alice_profile = client.get("/user/profile", headers=client.alice_auth).json()
    bob_profile = client.get("/user/profile", headers=client.bob_auth).json()

    assert alice_profile["id"] == client.alice_id
    assert alice_profile["experience_level"] == "advanced"
    assert bob_profile["id"] == client.bob_id
    assert bob_profile["experience_level"] == "beginner"


def test_plan_detail_is_404_for_a_non_owner(client):
    created = client.post("/plans", json={"name": "Bob's Plan"}, headers=client.bob_auth)
    assert created.status_code == 201
    bob_plan_id = created.json()["id"]

    # Bob can see his own plan.
    assert client.get(f"/plans/{bob_plan_id}", headers=client.bob_auth).status_code == 200
    # Alice, authenticated as herself, cannot see Bob's plan by guessing its id.
    resp = client.get(f"/plans/{bob_plan_id}", headers=client.alice_auth)
    assert resp.status_code == 404


def test_plan_activate_is_404_for_a_non_owner(client):
    created = client.post("/plans", json={"name": "Bob's Plan"}, headers=client.bob_auth)
    bob_plan_id = created.json()["id"]

    resp = client.patch(f"/plans/{bob_plan_id}/activate", headers=client.alice_auth)
    assert resp.status_code == 404


def test_plans_list_only_returns_the_caller_s_own_plans(client):
    client.post("/plans", json={"name": "Alice's Plan"}, headers=client.alice_auth)
    client.post("/plans", json={"name": "Bob's Plan"}, headers=client.bob_auth)

    alice_plans = client.get("/plans", headers=client.alice_auth).json()
    assert len(alice_plans) == 1
    assert alice_plans[0]["name"] == "Alice's Plan"


def test_logs_list_only_returns_the_caller_s_own_logs(client):
    client.post(
        "/logs", json={"exercise_id": client.exercise_id, "sets": 3, "reps": 5}, headers=client.alice_auth
    )
    client.post(
        "/logs", json={"exercise_id": client.exercise_id, "sets": 5, "reps": 5}, headers=client.bob_auth
    )

    alice_logs = client.get("/logs", headers=client.alice_auth).json()
    assert len(alice_logs) == 1
    assert alice_logs[0]["sets"] == 3


def test_checkin_today_is_scoped_to_the_caller(client):
    client.post("/user/checkin", json={"score": 5}, headers=client.alice_auth)

    alice_checkin = client.get("/user/checkin/today", headers=client.alice_auth)
    assert alice_checkin.status_code == 200
    assert alice_checkin.json()["score"] == 5

    # Bob never checked in today - his own request correctly 404s, it does
    # not somehow see Alice's check-in.
    bob_checkin = client.get("/user/checkin/today", headers=client.bob_auth)
    assert bob_checkin.status_code == 404


def test_apply_coach_resolution_rejects_another_user_s_plan_id(client):
    created = client.post("/plans", json={"name": "Bob's Plan"}, headers=client.bob_auth)
    bob_plan_id = created.json()["id"]

    # Alice, authenticated as herself, tries to apply a plan adjustment to
    # a plan_id that's actually Bob's - this is the exact path
    # execute_adjust_plan's existing ownership check was built for, now
    # reachable with a real (not client-asserted) identity.
    resp = client.post(
        "/agent/coach-resolution/apply",
        json={"plan_id": bob_plan_id, "updates": []},
        headers=client.alice_auth,
    )
    assert resp.status_code == 404
