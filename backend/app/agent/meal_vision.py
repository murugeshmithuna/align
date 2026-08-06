"""Claude Vision/text meal analysis.

Separate code path from the main orchestrator tool loop - like debate.py -
since the vision call sends an image content block rather than filling in a
tool-callable JSON schema (Claude's tool-use inputs are JSON only; there's no
way for the model to hand back image bytes as a "tool call"). Both the photo
and text paths use a forced, strict tool_choice ("report_meal_analysis") so
the call returns directly-parseable structured data instead of prose to
regex out - strict mode (additionalProperties: false) rejects anything
outside the schema rather than best-effort matching it.

The model reports a per-ingredient breakdown, not a single aggregate - the
aggregate calorie/macro totals are computed here by summing that breakdown,
rather than also asking the model for a top-level total. Two numbers from
the same call can disagree with each other; one number computed from the
other can't. This also gives the frontend's Review & Edit step something
real to edit: correcting one ingredient's serving size and hitting "Update
Macros" recomputes the same sum this function does, just client-side.

Nothing here writes to the database - see routers/vision.py's split between
the analyze endpoints (return a preview) and /vision/save-meal (persists
whatever the user confirmed, post-edit).
"""

import base64

from sqlalchemy.orm import Session

from app.agent.orchestrator import _get_client, _get_user_or_raise
from app.config import CLAUDE_MODEL

MEAL_ANALYSIS_TOOL = {
    "name": "report_meal_analysis",
    "description": "Report the ingredient-level nutritional breakdown of the meal.",
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "description": {
                "type": "string",
                "description": "Brief description of the overall meal",
            },
            "ingredients": {
                "type": "array",
                "description": "Every distinct ingredient/component, each with its own estimated macros.",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "e.g. 'Grilled chicken breast'"},
                        "quantity": {"type": "string", "description": "e.g. '150g' or '1 cup'"},
                        "calories": {"type": "integer"},
                        "protein_g": {"type": "number"},
                        "carbs_g": {"type": "number"},
                        "fat_g": {"type": "number"},
                    },
                    "required": ["name", "quantity", "calories", "protein_g", "carbs_g", "fat_g"],
                    "additionalProperties": False,
                },
            },
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
        "required": ["description", "ingredients", "macro_summary", "quick_tip", "timing_note"],
        "additionalProperties": False,
    },
}

SYSTEM_PROMPT = """You are a nutrition-savvy coaching assistant estimating macros for a fitness app \
user's meal. Break it into its distinct ingredients/components and estimate each one's serving size and \
macros separately - don't guess at a single combined total. Estimate as accurately as you can from \
what's described or visible - portion sizes, visible ingredients, cooking method - and say so plainly \
when something is ambiguous rather than inventing false precision.

Your three feedback fields (macro_summary, quick_tip, timing_note) are each a single short sentence, \
under 15 words, reflecting this specific meal and the user's actual goals - not generic advice. No \
multi-sentence answers, no fluff, no "Great choice!" filler. Every word should carry information."""


def _build_goal_context(user) -> str:
    goals = ", ".join(user.primary_goals) or "not specified"
    return f"User's primary goals: {goals}. Physical limitations: {user.physical_limitations or 'none noted'}."


def _sum_ingredients(ingredients: list[dict]) -> dict:
    return {
        "estimated_calories": sum(i["calories"] for i in ingredients),
        "protein_g": round(sum(i["protein_g"] for i in ingredients), 1),
        "carbs_g": round(sum(i["carbs_g"] for i in ingredients), 1),
        "fat_g": round(sum(i["fat_g"] for i in ingredients), 1),
    }


def _run_analysis(client, system: str, content) -> dict:
    response = client.messages.create(
        model=CLAUDE_MODEL,
        # Ingredient breakdowns need more headroom than a single aggregate
        # did - a multi-component meal (e.g. a bowl with 4-5 ingredients)
        # easily exceeds the old 400-token ceiling once each one gets its
        # own name/quantity/four macro numbers.
        max_tokens=800,
        system=system,
        tools=[MEAL_ANALYSIS_TOOL],
        tool_choice={"type": "tool", "name": "report_meal_analysis"},
        messages=[{"role": "user", "content": content}],
    )
    tool_block = next(block for block in response.content if block.type == "tool_use")
    result = tool_block.input
    result.update(_sum_ingredients(result["ingredients"]))
    return result


def analyze_meal_photo(db: Session, user_id: int, image_bytes: bytes, media_type: str) -> dict:
    client = _get_client()
    user = _get_user_or_raise(db, user_id)
    image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

    content = [
        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_b64}},
        {"type": "text", "text": "Analyze this meal photo."},
    ]
    return _run_analysis(client, f"{SYSTEM_PROMPT}\n\n{_build_goal_context(user)}", content)


def analyze_meal_text(db: Session, user_id: int, text: str) -> dict:
    client = _get_client()
    user = _get_user_or_raise(db, user_id)

    content = f"Analyze this meal, described in the user's own words: \"{text.strip()}\""
    return _run_analysis(client, f"{SYSTEM_PROMPT}\n\n{_build_goal_context(user)}", content)
