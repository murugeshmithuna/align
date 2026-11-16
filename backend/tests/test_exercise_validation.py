"""Checks the deterministic character-allowlist backstop in
app/agent/exercise_validation.py, and that a real exercise name reaches and
survives the LLM semantic check. The LLM call itself is mocked (same
approach test_timeout_config.py uses) so this runs offline, deterministically,
and without spending a real API call.
"""

from unittest.mock import MagicMock

from app.agent import exercise_validation
from app.agent.exercise_validation import validate_exercise_name


def _mock_claude_client(is_valid: bool, reason: str = ""):
    tool_block = MagicMock()
    tool_block.type = "tool_use"
    tool_block.input = {"is_valid": is_valid, "reason": reason}
    response = MagicMock()
    response.content = [tool_block]
    client = MagicMock()
    client.messages.create.return_value = response
    return client


def test_validate_exercise_name_accepts_a_real_exercise(monkeypatch):
    monkeypatch.setattr(exercise_validation, "_get_client", lambda: _mock_claude_client(is_valid=True))
    result = validate_exercise_name("Barbell Back Squat")
    assert result["is_valid"] is True


def test_validate_exercise_name_rejects_empty_name():
    result = validate_exercise_name("   ")
    assert result["is_valid"] is False


def test_validate_exercise_name_rejects_disallowed_characters():
    result = validate_exercise_name("<script>alert(1)</script>")
    assert result["is_valid"] is False
