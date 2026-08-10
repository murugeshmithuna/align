"""Validates that a user-typed custom exercise name actually names a real
physical exercise before it's allowed into the shared `exercises` catalog.

Separate module from meal_vision.py/orchestrator.py despite the identical
"small forced-tool-call over FAST_MODEL" shape (see estimate_ingredient_macros
in meal_vision.py for the same pattern) - this is its own domain (workout
catalog integrity), not nutrition or plan/chat orchestration.

Without this, the exercise catalog had zero validation anywhere: the "+ New"
exercise flow on the Log Workout page (and the AI Coach's log_workout/
generate_workout_plan/adjust_plan tools, which all share the same
find-or-create-by-name pattern) would happily create a permanent catalog
entry named "Banana Smoothie" or any other typed string, since `Exercise.name`
is just a free-text unique column with no format constraint. Real user report:
"what if i enter bananasmoothie? coz thats not a real workout so validation
is also mandatory."
"""

import re

from app.agent.orchestrator import _get_client
from app.config import FAST_MODEL

# Deterministic format backstop, checked BEFORE the LLM semantic check below -
# same "hard backstop underneath judgment-call reasoning" philosophy as
# tools.py's _out_of_bounds_fields (sets/reps/weight bounds under the
# SYSTEM_PROMPT's SAFETY CHECK). Real bug this catches: the LLM validator
# judges semantic plausibility ("does this name a real exercise?"), which is
# generous by design so slang/abbreviations pass - but that means a real
# exercise word merely EMBEDDED in decorative junk (e.g. "\U0001F3CB️‍♂️ Squat!! @@@ ###")
# still reads as "plausibly names a real exercise" to the model and gets
# created verbatim, junk symbols and all, into the shared catalog every user
# then sees in their own picker forever. Confirmed live: that exact emoji
# string was accepted with is_valid=true. Allowlists letters/digits/spaces and
# the punctuation real exercise names actually use (hyphens, apostrophes,
# slashes for e.g. "3/4 Sit-Up", parens, periods, commas, ampersands) -
# anything outside that (emoji, @ # $ % etc.) is rejected before ever
# spending an LLM call on it.
_ALLOWED_NAME_CHARS = re.compile(r"^[\w\s\-'/().,&]+$", re.UNICODE)


def _has_disallowed_characters(name: str) -> bool:
    return not _ALLOWED_NAME_CHARS.match(name)


EXERCISE_VALIDATION_TOOL = {
    "name": "report_exercise_validation",
    "description": "Report whether a given name plausibly refers to a real, physical exercise or workout movement.",
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "is_valid": {
                "type": "boolean",
                "description": (
                    "True if this plausibly names a real strength, cardio, mobility, or bodyweight "
                    "exercise/movement - be generous with gym slang, abbreviations, and unconventional but "
                    "real names (e.g. 'Cossack squat', 'Copenhagen plank', 'Bear crawl' are all real). "
                    "False for food/drinks, random text, gibberish, or anything that isn't a physical "
                    "exercise a person could actually perform as a workout."
                ),
            },
            "reason": {
                "type": "string",
                "description": (
                    "If is_valid is false, one short, plain-language phrase explaining why (e.g. 'that's a "
                    "drink, not an exercise'). Empty string if is_valid is true."
                ),
            },
        },
        "required": ["is_valid", "reason"],
        "additionalProperties": False,
    },
}


def validate_exercise_name(name: str) -> dict:
    """Fast, cheap lookup (FAST_MODEL, ~150 max_tokens) - this gates a rare,
    one-off action (creating a brand-new catalog entry), not a hot path, so
    the extra round-trip is an acceptable cost for keeping the shared
    exercise catalog from filling up with nonsense every user then sees in
    their own exercise picker."""
    trimmed = name.strip()
    if not trimmed:
        return {"is_valid": False, "reason": "Exercise name can't be empty."}
    if _has_disallowed_characters(trimmed):
        return {
            "is_valid": False,
            "reason": "Exercise names can only use letters, numbers, spaces, and basic punctuation "
            "(- ' / ( ) . , &) - no emoji or special symbols.",
        }

    client = _get_client()
    response = client.messages.create(
        model=FAST_MODEL,
        max_tokens=150,
        tools=[EXERCISE_VALIDATION_TOOL],
        tool_choice={"type": "tool", "name": "report_exercise_validation"},
        messages=[{"role": "user", "content": f'Is "{name}" a real, physical exercise or workout movement?'}],
    )
    tool_block = next(block for block in response.content if block.type == "tool_use")
    return tool_block.input
