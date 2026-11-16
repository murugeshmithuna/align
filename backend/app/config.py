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

# The frontend's own origin - used to build the redirect target at the end
# of the server-side Google OAuth flow (routers/auth.py's /auth/google/start
# and /auth/google/callback). Defaults to the local Vite dev server.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# Signs the `state` param on the server-side Google OAuth redirect flow so
# /auth/google/callback can confirm a request genuinely followed one this
# server issued, without needing any server-side session store or cookie -
# falls back to the Google client secret (already a real secret present in
# this environment) so this works out of the box without a second env var,
# but can be overridden with its own dedicated value.
OAUTH_STATE_SECRET = os.getenv("OAUTH_STATE_SECRET") or GOOGLE_CLIENT_SECRET or ""

# Admin panel access - comma-separated allowlist of emails permitted to hit
# GET /admin/* (every registered user's data). Checked against the
# cryptographically verified email on a signed admin token (see
# app/admin_auth.py), minted only right after a real Google Sign-In -
# never trusted from a bare request.
ADMIN_EMAILS = {email.strip().lower() for email in os.getenv("ADMIN_EMAILS", "").split(",") if email.strip()}

# Fixed, well-known email identifying the shared public demo account (see
# app/guest.py) - a real, seeded, sign-in-free User row anyone can start a
# session as from the "Try demo" link, so a recruiter never has to click
# through Google OAuth to see the app work. Identified by this constant
# rather than a new schema column/flag, since it's just an equality check -
# no migration needed to add it.
GUEST_EMAIL = "guest@align.demo"

# Shared secret for POST /auth/guest/reset - a scheduled GitHub Actions job
# (not a human admin sign-in, which only mints a 12-hour token) hits this to
# wipe and reseed the guest account's demo history on a recurring schedule.
# Deliberately a separate, dedicated secret rather than reusing the admin
# token system, since this needs to work indefinitely from an unattended
# cron, not re-prove itself via Google Sign-In every 12 hours.
GUEST_RESET_SECRET = os.getenv("GUEST_RESET_SECRET", "")

# Heavier reasoning model - reserved for turns that actually invoke a tool
# (plan generation/adjustment, supplement recommendations).
CLAUDE_MODEL = "claude-opus-4-8"

# Fast/cheap model - handles routing (deciding whether a tool is needed) and
# answers direct conversational questions on its own, without ever involving
# the heavier model.
FAST_MODEL = "claude-haiku-4-5"
