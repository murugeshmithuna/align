"""Confirms the shared public demo account (app/guest.py) can sign in with
zero Google OAuth, renders real seeded data, and cannot write anything -
neither through a normal REST route nor through an agent tool call.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, user_auth
from app.database import Base, get_db
from app.guest import GUEST_READ_ONLY_MESSAGE, WRITE_TOOL_NAMES
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
    monkeypatch.setattr("app.routers.auth.GUEST_RESET_SECRET", "test-reset-secret")

    session = testing_session_local()
    real_user = models.User(name="Real User", email="real@example.com")
    session.add(real_user)
    session.commit()
    session.refresh(real_user)
    real_user_id = real_user.id
    session.close()

    test_client = TestClient(app)
    test_client.real_user_auth = {"Authorization": f"Bearer {sign_user_token(real_user_id)}"}

    yield test_client

    app.dependency_overrides.clear()


def test_guest_sign_in_requires_no_google_oauth(client):
    resp = client.post("/auth/guest")
    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["email"] == "guest@align.demo"
    assert data["user_token"]


def test_guest_sign_in_is_idempotent(client):
    first = client.post("/auth/guest").json()
    second = client.post("/auth/guest").json()
    assert first["user"]["id"] == second["user"]["id"]


def test_guest_cannot_save_profile(client):
    token = client.post("/auth/guest").json()["user_token"]
    resp = client.post(
        "/user/profile",
        json={"experience_level": "advanced"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == GUEST_READ_ONLY_MESSAGE


def test_guest_cannot_create_a_plan(client):
    token = client.post("/auth/guest").json()["user_token"]
    resp = client.post(
        "/plans", json={"name": "Sneaky Plan"}, headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 403


def test_guest_cannot_submit_a_checkin(client):
    token = client.post("/auth/guest").json()["user_token"]
    resp = client.post(
        "/user/checkin", json={"score": 5}, headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 403


def test_a_real_users_writes_are_unaffected(client):
    # The guard is specific to the guest email, not a general regression -
    # a real signed-in user must still be able to do everything normal.
    resp = client.post("/plans", json={"name": "My Real Plan"}, headers=client.real_user_auth)
    assert resp.status_code == 201


def test_reset_endpoint_requires_the_correct_secret(client):
    assert client.post("/auth/guest/reset").status_code == 401
    assert client.post(
        "/auth/guest/reset", headers={"X-Reset-Secret": "wrong"}
    ).status_code == 401


def test_reset_endpoint_reseeds_real_history(client):
    resp = client.post("/auth/guest/reset", headers={"X-Reset-Secret": "test-reset-secret"})
    assert resp.status_code == 204

    token = client.post("/auth/guest").json()["user_token"]
    auth = {"Authorization": f"Bearer {token}"}
    plans = client.get("/plans", headers=auth).json()
    logs = client.get("/logs", headers=auth).json()
    assert len(plans) == 1
    assert len(logs) > 0


def test_run_tool_blocks_a_write_tool_for_the_guest_account(client):
    # Direct, deterministic proof of the actual mechanism the agent chat
    # path relies on - no real Claude call involved, since _run_tool just
    # dispatches a tool name/input to an executor. This is what guarantees
    # a guest's chat can still get a real conversational reply while never
    # letting a write tool (generate_workout_plan, adjust_plan, log_workout,
    # update_log, delete_log) actually execute, regardless of what the
    # model decides to call.
    from types import SimpleNamespace

    from app.agent.orchestrator import _run_tool

    guest_token_resp = client.post("/auth/guest").json()
    guest_user_id = guest_token_resp["user"]["id"]

    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    try:
        block = SimpleNamespace(name="log_workout", input={"exercise_name": "Back Squat", "sets": 5, "reps": 5})
        result = _run_tool(db, guest_user_id, block)
        assert result == {"error": GUEST_READ_ONLY_MESSAGE}

        # A read-only tool is NOT blocked - only WRITE_TOOL_NAMES are.
        assert "ask_schedule" not in WRITE_TOOL_NAMES
    finally:
        db.close()


def test_write_tool_names_cover_every_mutating_tool():
    # Guards against a new write tool being added to tools.py later without
    # also being added here - the orchestrator's _run_tool guard is only as
    # good as this set.
    from app.agent.tools import TOOL_EXECUTORS

    read_only_tools = {"suggest_supplements", "ask_schedule", "analyze_form", "ask_nutrition"}
    assert WRITE_TOOL_NAMES | read_only_tools == set(TOOL_EXECUTORS)
