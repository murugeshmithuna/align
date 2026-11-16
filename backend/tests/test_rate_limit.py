"""Confirms the per-user rate limit in app/rate_limit.py actually fires on
a real Claude-calling route: before this, nothing stood between a single
caller and an unbounded number of paid Claude API calls.

No ANTHROPIC_API_KEY is set in this test environment, so every call to
/agent/weekly-recap fails with a 503 (orchestrator._get_client() raises
before any real network call) - that's fine and expected here, since this
test only cares that the Nth request in one minute gets rejected by the
limiter itself (429) rather than ever reaching that 503 path, proving the
limiter runs ahead of - and independently of - the route's own logic.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models, user_auth
from app.database import Base, get_db
from app.main import app
from app.rate_limit import limiter
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
    user = models.User(name="Rate Limited User", email="ratelimited@example.com")
    other_user = models.User(name="Other User", email="other@example.com")
    session.add_all([user, other_user])
    session.commit()
    session.refresh(user)
    session.refresh(other_user)
    user_id, other_user_id = user.id, other_user.id
    session.close()

    # A fresh in-memory limiter state per test - otherwise request counts
    # from an earlier test in this file/session would leak into this one.
    limiter.reset()

    test_client = TestClient(app)
    test_client.auth_header = {"Authorization": f"Bearer {sign_user_token(user_id)}"}
    test_client.other_auth_header = {"Authorization": f"Bearer {sign_user_token(other_user_id)}"}

    yield test_client

    app.dependency_overrides.clear()
    limiter.reset()


def test_the_21st_request_in_a_minute_is_rate_limited(client):
    responses = [client.get("/agent/weekly-recap", headers=client.auth_header) for _ in range(21)]

    # The first 20 reach the real route (and 503, since there's no API key
    # configured here) - none of them should be rejected by the limiter.
    assert all(r.status_code != 429 for r in responses[:20])

    # The 21st is the first to exceed the 20/minute limit.
    assert responses[20].status_code == 429
    assert "wait a moment" in responses[20].json()["detail"]


def test_rate_limit_is_scoped_per_user_not_shared(client):
    for _ in range(20):
        client.get("/agent/weekly-recap", headers=client.auth_header)
    # The first user is now at their limit.
    assert client.get("/agent/weekly-recap", headers=client.auth_header).status_code == 429

    # A second, real, different user hitting the same route is unaffected -
    # proves the key function is per-user, not per-process/shared-IP.
    resp = client.get("/agent/weekly-recap", headers=client.other_auth_header)
    assert resp.status_code != 429
