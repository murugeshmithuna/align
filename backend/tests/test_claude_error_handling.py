"""Regression test for a real bug found via live testing today: several
Claude-calling functions (generate_weekly_recap/digest, the nutrition
reviews, live-session form feedback, meal analysis, ingredient estimates)
never wrapped their client.messages.create() calls, so a real API/quota
error (confirmed live via a Manifest "insufficient_quota" 402) propagated
as a raw, unhandled 500 instead of the clean 503 + friendly message every
other agent-calling route already gives. Separately, the two streaming
call sites' `except anthropic.APIError` didn't catch the AssertionError
shape the SDK raises when get_final_message() is called on a stream whose
underlying response was itself an error - also observed live, also fixed.
"""

from unittest.mock import MagicMock

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, user_auth
from app.agent import orchestrator
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
    user = models.User(name="Test User", email="test@example.com")
    session.add(user)
    session.commit()
    session.refresh(user)

    # Weekly recap/digest/nutrition review all short-circuit to a canned,
    # no-LLM-call empty-state response when there's genuinely no activity -
    # real activity has to exist for these tests to actually reach the
    # (mocked) Claude call being tested here at all.
    exercise = models.Exercise(name="Back Squat")
    session.add(exercise)
    session.commit()
    session.refresh(exercise)
    session.add(models.WorkoutLog(user_id=user.id, exercise_id=exercise.id, sets=5, reps=5, weight=135))
    session.add(models.MealAnalysis(
        user_id=user.id, description="Chicken and rice", estimated_calories=600,
        protein_g=50.0, carbs_g=60.0, fat_g=15.0,
        macro_summary="Balanced", quick_tip="Good", timing_note="Fine",
    ))
    session.commit()

    user_id = user.id
    session.close()

    test_client = TestClient(app)
    test_client.auth_header = {"Authorization": f"Bearer {sign_user_token(user_id)}"}

    yield test_client

    app.dependency_overrides.clear()


def _client_raising(exc):
    client = MagicMock()
    client.messages.create.side_effect = exc
    return client


def _api_error():
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    return anthropic.APIConnectionError(request=request)


def test_weekly_recap_returns_a_clean_503_not_a_raw_500(client, monkeypatch):
    monkeypatch.setattr(orchestrator, "_get_client", lambda: _client_raising(_api_error()))
    resp = client.get("/agent/weekly-recap", headers=client.auth_header)
    assert resp.status_code == 503
    assert "APIConnectionError" not in resp.text


def test_weekly_digest_returns_a_clean_503_not_a_raw_500(client, monkeypatch):
    monkeypatch.setattr(orchestrator, "_get_client", lambda: _client_raising(_api_error()))
    resp = client.get("/agent/weekly-digest", headers=client.auth_header)
    assert resp.status_code == 503


def test_nutrition_review_returns_a_clean_503_not_a_raw_500(client, monkeypatch):
    monkeypatch.setattr(orchestrator, "_get_client", lambda: _client_raising(_api_error()))
    resp = client.get("/agent/nutrition-review/daily", headers=client.auth_header)
    assert resp.status_code == 503


def test_streaming_assertion_error_is_caught_not_crashed(monkeypatch):
    # Direct test of the exact live-observed shape: get_final_message()
    # raises a bare AssertionError (not an APIError) when the underlying
    # stream's response was itself an error. Confirms it's now caught by
    # the broadened except clause rather than propagating as an unhandled
    # exception through the ASGI stack.
    import app.agent.orchestrator as orch

    class _FakeStream:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        @property
        def text_stream(self):
            return iter(())

        def get_final_message(self):
            raise AssertionError("self.__final_message_snapshot is not None")

    fake_client = MagicMock()
    fake_client.messages.stream.return_value = _FakeStream()
    monkeypatch.setattr(orch, "_get_client", lambda: fake_client)

    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(engine)
    session = testing_session_local()
    user = models.User(name="Stream Test User", email="streamtest@example.com")
    session.add(user)
    session.commit()
    session.refresh(user)

    frames = list(orch.stream_agent_turn(session, user.id, "hello", [], None))
    session.close()

    assert any("error" in f and orch._AGENT_CALL_FAILURE_MESSAGE in f for f in frames)
    assert any('"done": true' in f for f in frames)
