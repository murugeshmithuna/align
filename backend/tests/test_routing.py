"""Guards the fix for the max_tokens routing bug (see orchestrator.py's
ROUTING_TOOL comment): handing the fast router model the *real* tool schemas
made it try to author a whole exercise list itself and silently truncate.
ROUTING_TOOL's schema only ever needs to name a tool - these tests assert
that stays true and that its enum tracks the real tool set in tools.py.
"""

from app.agent.orchestrator import ROUTING_TOOL
from app.agent.tools import TOOL_SCHEMAS


def test_routing_tool_enum_has_exactly_nine_tools():
    enum = ROUTING_TOOL["input_schema"]["properties"]["tool_name"]["enum"]
    assert len(enum) == 9


def test_routing_tool_enum_names_are_all_real_tools():
    enum = ROUTING_TOOL["input_schema"]["properties"]["tool_name"]["enum"]
    real_tool_names = {schema["name"] for schema in TOOL_SCHEMAS}
    for name in enum:
        assert name in real_tool_names, f"{name!r} in ROUTING_TOOL's enum has no matching tool in tools.py"


def test_routing_tool_schema_only_requires_tool_name():
    schema = ROUTING_TOOL["input_schema"]
    # The property that actually prevents the max_tokens bug: the router can
    # never be asked to fill in anything beyond which tool to call.
    assert schema["required"] == ["tool_name"]
    assert set(schema["properties"]) == {"tool_name"}
