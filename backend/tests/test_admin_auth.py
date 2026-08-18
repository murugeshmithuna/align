"""Confirms /admin/* routes reject unauthenticated and non-admin requests,
and accept a genuinely valid admin token - the exact gap fixed by
app/admin_auth.py (an unverified client-supplied requester_id used to be
enough to read every user's data).

No test setup existed in this project before this file - added pytest +
httpx (backend/requirements.txt) and this backend/tests/ directory.
"""

import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import admin_auth
from app.database import Base, get_db
from app.main import app


@pytest.fixture()
def client(monkeypatch):
    # Isolated in-memory DB per test - never touches the real local
    # fitness_agent.db file. StaticPool keeps every connection pointing at
    # the same single in-memory database - the plain default pool opens a
    # fresh (and empty) :memory: database per connection, which silently
    # loses every table create_all() just made.
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
    monkeypatch.setattr(admin_auth, "ADMIN_EMAILS", {"admin@example.com"})
    monkeypatch.setattr(admin_auth, "OAUTH_STATE_SECRET", "test-secret")

    yield TestClient(app)

    app.dependency_overrides.clear()


def test_missing_token_is_rejected(client):
    resp = client.get("/admin/users")
    assert resp.status_code == 401


def test_malformed_token_is_rejected(client):
    resp = client.get("/admin/users", headers={"Authorization": "Bearer not-a-real-token"})
    assert resp.status_code == 401


def test_missing_bearer_prefix_is_rejected(client):
    token = admin_auth.sign_admin_token("admin@example.com")
    resp = client.get("/admin/users", headers={"Authorization": token})
    assert resp.status_code == 401


def test_valid_token_for_non_admin_email_is_rejected(client):
    # A real, correctly-signed token - just not for an ADMIN_EMAILS address.
    # This is the scenario the old design couldn't distinguish from "no
    # identity at all": a genuine user, just not an admin.
    token = admin_auth.sign_admin_token("someone-else@example.com")
    resp = client.get("/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_expired_token_is_rejected(client, monkeypatch):
    monkeypatch.setattr(admin_auth, "ADMIN_TOKEN_MAX_AGE_SECONDS", 1)
    token = admin_auth.sign_admin_token("admin@example.com")
    time.sleep(1.5)
    resp = client.get("/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


def test_valid_admin_token_is_accepted(client):
    token = admin_auth.sign_admin_token("admin@example.com")
    resp = client.get("/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == []


def test_user_detail_route_has_the_same_check(client):
    resp = client.get("/admin/users/1")
    assert resp.status_code == 401

    token = admin_auth.sign_admin_token("someone-else@example.com")
    resp = client.get("/admin/users/1", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
