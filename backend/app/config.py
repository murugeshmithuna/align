import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# Google Sign-In - GOOGLE_CLIENT_ID is the expected `aud` claim when verifying
# a Google Identity Services id_token server-side (see routers/auth.py).
# GOOGLE_CLIENT_SECRET isn't needed for that verification flow (only for a
# full OAuth code-exchange flow, e.g. Google Calendar's offline access down
# the line) but is kept here so it's set up once, in one place.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")

# Heavier reasoning model - reserved for turns that actually invoke a tool
# (plan generation/adjustment, supplement recommendations).
CLAUDE_MODEL = "claude-opus-4-8"

# Fast/cheap model - handles routing (deciding whether a tool is needed) and
# answers direct conversational questions on its own, without ever involving
# the heavier model.
FAST_MODEL = "claude-haiku-4-5"
