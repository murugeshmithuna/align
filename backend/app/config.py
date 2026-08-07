import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

# When set (production - a managed Postgres instance), overrides the local
# SQLite file database.py otherwise falls back to. Render's free web-service
# tier has no persistent disk, so a SQLite file living in the container's own
# filesystem gets wiped on every redeploy/restart/spin-down - a real,
# independent database is what actually survives that.
DATABASE_URL = os.getenv("DATABASE_URL")

# Google Sign-In - GOOGLE_CLIENT_ID is the expected `aud` claim when verifying
# a Google Identity Services id_token server-side (see routers/auth.py).
# GOOGLE_CLIENT_SECRET isn't needed for that verification flow (only for a
# full OAuth code-exchange flow, e.g. Google Calendar's offline access down
# the line) but is kept here so it's set up once, in one place.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")

# Admin panel access - comma-separated allowlist of emails permitted to hit
# GET /admin/* (every registered user's data). The app has no session/token
# system yet (see routers/users.py) - every endpoint trusts whatever user_id
# the client sends - so this checks the *email on record* for the claimed
# requester_id, not a cryptographically verified identity. Acceptable for a
# single-operator personal project; would need real auth before this app
# ever has untrusted multi-tenant users.
ADMIN_EMAILS = {email.strip().lower() for email in os.getenv("ADMIN_EMAILS", "").split(",") if email.strip()}

# Heavier reasoning model - reserved for turns that actually invoke a tool
# (plan generation/adjustment, supplement recommendations).
CLAUDE_MODEL = "claude-opus-4-8"

# Fast/cheap model - handles routing (deciding whether a tool is needed) and
# answers direct conversational questions on its own, without ever involving
# the heavier model.
FAST_MODEL = "claude-haiku-4-5"
