"""Checks the request-timeout fix in app/agent/orchestrator.py: a bounded
60s client timeout (instead of the Anthropic SDK's own 600s default) and
that any Claude-call failure surfaces as the single plain-language
_AGENT_CALL_FAILURE_MESSAGE, never the raw exception/class name.
"""

from unittest.mock import MagicMock

import anthropic
import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.agent import orchestrator
from app.agent.orchestrator import _AGENT_CALL_FAILURE_MESSAGE, REQUEST_TIMEOUT_SECONDS, run_agent_turn
from app.database import Base
from app.models import User


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(engine)
    session = testing_session_local()
    try:
        yield session
    finally:
        session.close()


def _raising_client():
    client = MagicMock()
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    client.messages.create.side_effect = anthropic.APIConnectionError(request=request)
    return client


def test_request_timeout_is_bounded_well_under_the_sdk_default():
    # The SDK's own default read timeout is 600s - this app deliberately
    # caps it far lower so a hung upstream call can't leave the user staring
    # at a frozen UI for anywhere near that long.
    assert REQUEST_TIMEOUT_SECONDS == 60.0


def test_failed_claude_call_returns_the_plain_language_message(db_session, monkeypatch):
    user = User(name="Test User", email="test@example.com")
    db_session.add(user)
    db_session.commit()

    monkeypatch.setattr(orchestrator, "_get_client", _raising_client)

    with pytest.raises(RuntimeError) as exc_info:
        run_agent_turn(db_session, user.id, "set me up a workout plan")

    # Must be exactly the canned message - never the raw exception/class name.
    assert str(exc_info.value) == _AGENT_CALL_FAILURE_MESSAGE
    assert "APIConnectionError" not in str(exc_info.value)
