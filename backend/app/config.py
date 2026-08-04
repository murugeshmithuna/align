import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# Heavier reasoning model - reserved for turns that actually invoke a tool
# (plan generation/adjustment, supplement recommendations).
CLAUDE_MODEL = "claude-opus-4-8"

# Fast/cheap model - handles routing (deciding whether a tool is needed) and
# answers direct conversational questions on its own, without ever involving
# the heavier model.
FAST_MODEL = "claude-haiku-4-5"
