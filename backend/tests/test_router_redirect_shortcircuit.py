"""Regression test for a real bug found live via scripts/eval_router.py:
ROUTING_TOOL's `tool_name` enum only declares the 9 real tool names - it has
no "redirect_to_coach_resolution" option - but the system prompt shared with
the full reasoning pass tells the model to "call redirect_to_coach_resolution
immediately" for any plan-change request, with no carve-out for this
narrower routing-only pass. The live eval showed FAST_MODEL sometimes
complies with that instruction literally and returns
"redirect_to_coach_resolution" as `tool_name` anyway (an enum violation the
API doesn't reject, since ROUTING_TOOL has no `strict: true`), rather than
the literal "adjust_plan"/"generate_workout_plan" the short-circuit was
originally written to recognize. Left unhandled, that silently defeated the
short-circuit for exactly the requests it exists to catch cheaply, falling
through to a full, unnecessary Opus call instead - the opposite of the
cost-saving optimization it's there for.
"""

from unittest.mock import MagicMock

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models
from app.agent import orchestrator
from app.database import Base


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    testing_session_local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(engine)

    session = testing_session_local()
    user = models.User(name="Test User", email="test@example.com")
    session.add(user)
    session.commit()
    session.refresh(user)

    yield session, user.id

    session.close()


def _fake_router_tool_use_response(tool_name: str):
    block = MagicMock()
    block.type = "tool_use"
    block.input = {"tool_name": tool_name}

    response = MagicMock()
    response.stop_reason = "tool_use"
    response.content = [block]
    response.usage.input_tokens = 50
    response.usage.output_tokens = 10
    return response


def _fake_text_response(text: str):
    block = MagicMock()
    block.type = "text"
    block.text = text

    response = MagicMock()
    response.stop_reason = "end_turn"
    response.content = [block]
    response.usage.input_tokens = 50
    response.usage.output_tokens = 10
    return response


def _fake_client(tool_name: str):
    client = MagicMock()
    client.messages.create.return_value = _fake_router_tool_use_response(tool_name)
    return client


def test_literal_adjust_plan_short_circuits_without_a_second_call(db_session, monkeypatch):
    session, user_id = db_session
    client = _fake_client("adjust_plan")
    monkeypatch.setattr(orchestrator, "_get_client", lambda: client)

    result = orchestrator.run_agent_turn(session, user_id, "Reduce today's volume, I'm feeling beat up.")

    assert result["redirect"] is not None
    assert client.messages.create.call_count == 1


def test_model_calling_redirect_to_coach_resolution_directly_also_short_circuits(db_session, monkeypatch):
    """The exact real bug: FAST_MODEL returns "redirect_to_coach_resolution"
    - not in ROUTING_TOOL's enum - as `tool_name` instead of "adjust_plan"."""
    session, user_id = db_session
    client = _fake_client("redirect_to_coach_resolution")
    monkeypatch.setattr(orchestrator, "_get_client", lambda: client)

    result = orchestrator.run_agent_turn(session, user_id, "Swap squats for leg press in my current plan.")

    assert result["redirect"] is not None
    # The whole point: this must NOT fall through to a second (Opus) call.
    assert client.messages.create.call_count == 1


def test_unrelated_tool_does_not_short_circuit(db_session, monkeypatch):
    session, user_id = db_session
    client = MagicMock()
    # First call: the router pass, routing to a non-plan-mutation tool.
    # Second call: the full reasoning pass answering directly, no further
    # tool call - only used to prove the short-circuit was skipped and a
    # second call genuinely happened, not to exercise real tool execution.
    client.messages.create.side_effect = [
        _fake_router_tool_use_response("ask_schedule"),
        _fake_text_response("You last trained legs on Monday."),
    ]
    monkeypatch.setattr(orchestrator, "_get_client", lambda: client)

    result = orchestrator.run_agent_turn(session, user_id, "When did I last train legs?")

    assert result.get("redirect") is None
    assert client.messages.create.call_count == 2
