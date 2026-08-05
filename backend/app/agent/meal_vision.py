"""Claude Vision meal-photo analysis.

Separate code path from the main orchestrator tool loop - like debate.py -
since this call sends an image content block rather than filling in a
tool-callable JSON schema (Claude's tool-use inputs are JSON only; there's no
way for the model to hand back image bytes as a "tool call"). Uses a forced,
strict tool_choice ("report_meal_analysis") so the single vision call returns
directly-parseable structured numbers instead of prose to regex out - strict
mode (additionalProperties: false) rejects anything outside the schema rather
than best-effort matching it.

Coach feedback is three short, separately-schema'd fields (not one free-text
blob the model has to self-format into bullets) so the length/shape
constraint is enforced by the schema, not by hoping the model follows a
formatting instruction in prose.
"""

import base64

from sqlalchemy.orm import Session

from app.agent.orchestrator import _get_client, _get_user_or_raise
from app.config import CLAUDE_MODEL

MEAL_ANALYSIS_TOOL = {
    "name": "report_meal_analysis",
    "description": "Report the nutritional analysis of the meal shown in the photo.",
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "description": {
                "type": "string",
                "description": "Brief description of what's visible on the plate",
            },
            "estimated_calories": {"type": "integer"},
            "protein_g": {"type": "number"},
            "carbs_g": {"type": "number"},
            "fat_g": {"type": "number"},
            "macro_summary": {
                "type": "string",
                "description": (
                    "One short reaction to the protein/carbs/fat balance for this user's goals. "
                    "Under 15 words. No preamble."
                ),
            },
            "quick_tip": {
                "type": "string",
                "description": (
                    "One immediate, actionable swap or improvement for this specific meal. "
                    "Under 15 words. No preamble."
                ),
            },
            "timing_note": {
                "type": "string",
                "description": (
                    "One simple note on meal timing or hydration relevant to this meal/goal. "
                    "Under 15 words. No preamble."
                ),
            },
        },
        "required": [
            "description",
            "estimated_calories",
            "protein_g",
            "carbs_g",
            "fat_g",
            "macro_summary",
            "quick_tip",
            "timing_note",
        ],
        "additionalProperties": False,
    },
}

SYSTEM_PROMPT = """You are a nutrition-savvy coaching assistant analyzing a meal photo for a fitness \
app user. Estimate calories and macros as accurately as you can from what's visible - portion sizes, \
visible ingredients, cooking method - and say so plainly when the photo makes something ambiguous \
rather than inventing false precision.

Your three feedback fields (macro_summary, quick_tip, timing_note) are each a single short sentence, \
under 15 words, reflecting this specific meal and the user's actual goals - not generic advice. No \
multi-sentence answers, no fluff, no "Great choice!" filler. Every word should carry information."""


def _build_goal_context(user) -> str:
    goals = ", ".join(user.primary_goals) or "not specified"
    return f"User's primary goals: {goals}. Physical limitations: {user.physical_limitations or 'none noted'}."


def analyze_meal_photo(db: Session, user_id: int, image_bytes: bytes, media_type: str) -> dict:
    client = _get_client()
    user = _get_user_or_raise(db, user_id)

    image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    response = client.messages.create(
        model=CLAUDE_MODEL,
        # The three feedback fields are capped at ~15 words each plus a short
        # description and five numbers - 400 tokens is generous headroom for
        # that, not a hard latency lever (vision input processing dominates
        # actual response time, not this ceiling).
        max_tokens=400,
        system=f"{SYSTEM_PROMPT}\n\n{_build_goal_context(user)}",
        tools=[MEAL_ANALYSIS_TOOL],
        tool_choice={"type": "tool", "name": "report_meal_analysis"},
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": media_type, "data": image_b64},
                    },
                    {"type": "text", "text": "Analyze this meal photo."},
                ],
            }
        ],
    )

    tool_block = next(block for block in response.content if block.type == "tool_use")
    return tool_block.input
