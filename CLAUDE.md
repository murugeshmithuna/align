# AI Fitness Agent

"A coach that watches, listens, and adapts." A multi-agent fitness coaching system combining LLM
tool-use, computer vision (pose estimation), physiological modeling, and real-time voice coaching.

Second project in the Month 2 side-hustle track, sequenced after Innerva. Starts from its own Week 3
(FastAPI + SQLite) since Python fundamentals and CS50 AI Search are already covered elsewhere in the
roadmap.

## Current status

FastAPI backend with CRUD endpoints, SQLite schema (users, exercises, plans, plan_exercises, logs,
soreness_notes, checkins), and a health-check endpoint.

**Frontend is a real React SPA** (Vite + React Router + Tailwind v4), replacing the earlier static
single-page shell. Multi-page flow: `/` (Landing, public) → `/login` (user picker/create - no real auth,
just a session established client-side via localStorage) → `/profile` (baseline onboarding form, gates
first-timers before they reach the dashboard) → `/dashboard` (active plan summary, today's readiness,
streaming chat) → `/checkin` (also auto-shown as a modal on the dashboard once/day) → `/live-session` and
`/progress` (placeholder pages for not-yet-built vision/chart milestones). A shared `AppLayout` +
`Navbar` gate the authenticated routes and provide navigation between Dashboard / Live Session /
Progress Charts / Profile Settings.

**Daily readiness check-in:** `POST /user/checkin` (upsert, one row per user per UTC day) /
`GET /user/checkin/today/{user_id}`. Score 1-5 (Sick/Exhausted → Sore → Normal → Good → Pumped Up) is
injected into the orchestrator's system prompt alongside the profile, so it proactively suggests
lower volume/intensity via `adjust_plan` on low-readiness days without the user having to ask -
confirmed live that the agent reads and references the score unprompted.

**Zero-chat baseline generation and adaptation:**
- Submitting a check-in deterministically stamps `plan_status` (`rest_mobility` / `scaled_down` /
  `normal`) from the score alone - no LLM call, computed synchronously in `checkin.py` via
  `plan_status_for_score()`. The Dashboard shows this badge immediately.
- Saving a profile for the first time (i.e. the user has no plan yet) synchronously calls
  `run_agent_turn` with a synthetic message to auto-generate the baseline plan - the user never has to
  open chat. This blocks the `POST /user/profile` request for the length of a real Opus tool call
  (~15-30s, confirmed live); the frontend shows "Generating your plan…" during that first save only.
  Re-saving the profile later never regenerates it (checked via `has_plan` before calling the agent).
- The orchestrator's system prompt was hardened to reframe its role: it's a fine-tuning/Q&A assistant,
  not the primary plan author, and is explicitly told to act immediately on requests like "abs workout"
  (call the tool right away) rather than asking about session length/preferences first - confirmed live
  that a bare "abs workout" with a low check-in score produced a complete, readiness-adjusted session
  with zero clarifying questions.

Orchestrator agent (milestone 1) is wired up and live-verified: `POST /agent/chat` (JSON) and
`POST /agent/chat/stream` (SSE) run a manual Claude tool-use loop routed through a Manifest proxy via
`ANTHROPIC_BASE_URL` + `auth_token`, with `generate_workout_plan`, `adjust_plan`, and
`suggest_supplements` tools that read/write the SQLite tables.

**Two-tier model routing** (for latency/cost): every turn first hits `claude-haiku-4-5` with a tiny
dedicated `route_to_tool` classifier tool - if it answers directly (no tool needed), that streamed
response *is* the final reply and `claude-opus-4-8` is never called. If it flags that a tool is needed,
the conversation restarts fresh on `claude-opus-4-8`, which is the one that actually authors the
plan/adjustment and runs the tool-use loop. (Earlier version handed the router the *real* tool schemas,
which made Haiku try to write a full exercise list itself and silently truncate at `max_tokens` -
fixed by giving the router a schema that only ever needs `{"tool_name": "..."}`.)

**Streaming** (`/agent/chat/stream`) uses `client.messages.stream(...)` and yields SSE frames
(`data: {"content": "..."}`, `data: {"tool": name, "status": "running"|"done"}`, `data: {"done": true}`).
Verified live with real inter-chunk timing (httpx `iter_raw()`) that Manifest forwards chunks
incrementally (~200ms gaps) rather than buffering the full response.

Onboarding is now a settings form, not a chat conversation. `POST /user/profile` /
`GET /user/profile/{user_id}` let the frontend set/read a user's baseline (`experience_level`,
`target_frequency`, `available_equipment`, `primary_goals`, `physical_limitations`) up front. The
orchestrator injects that profile into its system prompt on every turn, so the chat agent never asks
the user to restate it — confirmed live: a bare "set me up with a workout plan" produced a full plan
matching the saved equipment/frequency/limitations with zero clarifying questions.

**Progress charts + weekly AI recap** (`/progress`): `GET /logs/user/{user_id}/progress` aggregates
volume-by-date (sum of sets×reps×weight per day) and per-exercise weight history with a `is_pr` flag
(running-max comparison, ties count) computed server-side. `GET /agent/weekly-recap/{user_id}` gathers
the last 7 days of logs + check-ins and asks `claude-haiku-4-5` (fast model - pure summarization, no
tools) for a short natural-language recap; returns a canned message instead of calling the LLM when
there's no activity yet. Frontend renders both with Chart.js (`chart.js` + `react-chartjs-2`): single-
series line/area charts (no legend needed per the dataviz skill's rule - one hue is enough when there's
one series), PRs marked via larger point radius + surface ring rather than a second competing color, a
"view as table" fallback under each chart. Verified live: seeded 3 weeks of progressive-overload squat
logs + flat-then-dip-then-recover bench logs - `is_pr` correctly flags every squat session (monotonic
increase) and correctly flags `false` only on the bench session that dipped below the existing record.

**Deployed:** frontend on Vercel (`https://fitness-agent-topaz.vercel.app`, project `fitness-agent`,
team `mithuna2`), backend on Render (`https://fitness-agent-wuvh.onrender.com`, service `fitness-agent`,
**Free plan**). `VITE_API_BASE_URL` set directly to the Render URL. Two real caveats living in
production right now: (1) Render's Free plan has **no persistent disk** - SQLite data resets on
redeploys/restarts, upgrade to Starter (~$7/mo) + attach a Disk to fix; (2) Render Free spins down on
inactivity, so the first request after idle time has a real cold-start delay (30s+).

**Schedule Agent** (`ask_schedule` tool): a RAG-lite tool like `suggest_supplements` - gathers today's
day-of-week, the active plan's weekly schedule, and up to 20 recent logs into a fact bundle, then lets
the orchestrator LLM compose a grounded answer (e.g. "when did I last train legs") instead of guessing.
Registered in `TOOL_SCHEMAS`/`TOOL_EXECUTORS`/`ROUTING_TOOL` - the three places any new tool needs to be
added for the fast-model router to be able to select it.

**Multi-agent debate** (`/debate` page, `POST /agent/debate`): a separate code path from the main
orchestrator, not a tool - `backend/app/agent/debate.py`'s `run_coach_debate()` makes three independent
`claude-opus-4-8` calls with no shared history: a Strength Coach prompt scoped to recent logs/PRs, a
Recovery Coach prompt scoped to soreness notes/check-in scores, then a Head Coach resolver call given
both prior positions as context and told to pick a side rather than hedge. Frontend renders three
chat-bubble cards (coral Strength, sky-blue Recovery, highlighted bordered Head Coach resolution).
Verified live with a deliberately tense scenario (RPE 9.5 squat session yesterday + severity-4 soreness +
readiness 2/5): Strength Coach argued to push, Recovery Coach argued to back off, and the Head Coach
resolved decisively toward recovery, explicitly re-reasoning about the Strength Coach's own data point
rather than just averaging the two positions.

**Banister fatigue model + asymmetry checker** (`/progress`, `GET /fatigue/user/{user_id}`,
`POST /fatigue/asymmetry`): `backend/app/agent/fatigue.py` is pure computation, no LLM call - like
`GET /logs/user/{id}/progress`, not agent-routed. Per-log training load is a session-RPE-style proxy
(`sets*reps*weight * rpe/10`), aggregated per day (rest days included as zero-load so the exponential
decay actually applies across gaps) and run through the classic two-component Banister model: Fitness
decays slowly (τ=42 days), Fatigue decays quickly (τ=7 days), Form = Fitness - 2×Fatigue. A deterministic
risk read (`low`/`moderate`/`high`) thresholds today's Form/Fitness ratio - no LLM needed since it's a
plain numeric rule, same philosophy as `plan_status_for_score()`. Frontend adds a 3-line Fitness/Fatigue/
Form chart to the Progress page (validated categorical palette - emerald/coral/sky-blue - via the
dataviz skill's `validate_palette.js`, since a 3-series chart needs one unlike the existing single-series
volume/PR charts) plus a risk badge. The asymmetry checker takes raw left/right numeric samples (not
video) and flags >10% side-to-side difference - the standard inter-limb asymmetry threshold. Written
before MediaPipe pose tracking existed to consume exactly the shape of data it produces per rep (a list
of numbers per side), so now that pose tracking is built, wiring the two together (auto-filling left/right
values from live landmark data instead of manual entry) is a small UI-only follow-up, not a model rewrite
- not yet done. Verified live: 3 weeks of increasingly heavy squat logs followed by a few
rest days correctly showed Fitness/Fatigue both rising during training then Fatigue decaying faster than
Fitness during the rest days (Form recovering, as expected physiologically); asymmetry check correctly
flagged a 15.7% left-dominant sample set and correctly passed a 2.1% sample set.

**MediaPipe vision** (`/live-session`): one model (`pose_landmarker_lite.task`, the official Google-hosted
BlazePose 33-landmark bundle, committed at `backend/app/vision/models/`), two runtimes.
- **Batch** (`POST /vision/analyze-squat`, multipart video upload): `backend/app/vision/pose_analysis.py`
  runs the new MediaPipe Tasks Python API (`mediapipe==1.0.0` dropped the old `mp.solutions.pose` -
  confirmed live in this session - so this is `PoseLandmarker` in `VIDEO` running mode) frame-by-frame via
  OpenCV, computes knee angle (hip-knee-ankle), knee-ankle horizontal offset (knee tracking, normalized by
  hip width), and trunk lean from vertical (back angle) per frame, then segments reps with a knee-angle
  state machine split into a pure, unit-tested `segment_reps()` function: descent starts once knee angle
  drops below 160°, and depth-tracking continues past the 110° "reached depth" threshold until the angle
  actually turns and rises again (a real local minimum) rather than stopping at the first threshold
  crossing - otherwise the recorded depth is the crossing angle, not the true bottom. A rep that comes
  back up without ever reaching depth still counts, flagged `depth_ok: false`. Per-rep facts (min knee
  angle, knee-tracking offset %, back angle, three pass/fail flags) are stored in a new `form_analyses`
  table and returned directly to the frontend - no LLM in this path, consistent with `fatigue.py`.
- **`analyze_form` tool**: fetches the user's most recent stored analysis (RAG-lite, same pattern as
  `ask_schedule`) so chat questions like "how was my squat form?" get a real conversational critique
  grounded in those facts. Verified live: seeded a 5-rep analysis with a clear knee-valgus pattern (2/5
  knee-tracking pass, 4/5 depth, 5/5 back angle) and the orchestrator correctly identified knee tracking
  as the priority fix with specific coaching cues, not a generic answer.
- **Live** (`/live-session`, "Live webcam" tab): client-side only, via `@mediapipe/tasks-vision` -
  `PoseLandmarker` runs entirely in the browser (WASM from jsDelivr, same model file from the same GCS
  URL as the batch path) inside a `requestAnimationFrame` loop reading the webcam `<video>` element, so
  there's no server round-trip for live tracking. The same thresholds/state machine from
  `pose_analysis.py` are mirrored in JS so live and batch rep-counting agree. Mid-set voice cues use the
  browser's built-in Web Speech API (`speechSynthesis`) - no TTS library/dependency needed. UI is
  deliberately minimal per the design direction (large rep counter, one cue line, nothing else
  competing for attention). Verified in a headless Chromium session (Playwright, `--use-fake-device-for-
  media-stream`): the WASM+model load from CDN, camera stream starts, the pose-detection graph runs with
  no JS errors, and switching away from the tab correctly unmounts the `<video>` element and releases the
  camera track (confirmed no lingering stream). A real human squat video wasn't available in this
  sandboxed session to verify detection *accuracy* end-to-end - the rep-segmentation logic itself was
  separately unit-tested with synthetic angle sequences (6 synthetic reps covering good depth, a shallow
  rep, knee valgus, and excessive back lean all came back with exactly the expected flags).

Voice cues beyond the live session and Claude Vision meal photo analysis are not built yet.

## System architecture

End-to-end flow: user input (chat, photo, video, or webcam) -> orchestrator agent -> specialized
tool/sub-agent -> database update -> response rendered in UI.

| Layer | Component | Responsibility |
|---|---|---|
| Core | Orchestrator Agent | Central agent deciding which tool/sub-agent to invoke based on user request |
| Core | `generate_workout_plan` tool | Creates a new training plan from onboarding data |
| Core | `adjust_plan` tool | Modifies an existing plan based on logged performance or recovery data |
| Core | `suggest_supplements` tool | Recommends supplements based on goals/logs |
| Q&A | Schedule Agent (`ask_schedule` tool) | Grounded conversational Q&A over the user's real logs and current plan |
| Q&A | Calendar integration (optional) | Reads Google Calendar to factor busy days into scheduling answers |
| Vision | MediaPipe Pose (batch) | Joint-angle analysis on uploaded squat videos (done) |
| Vision | MediaPipe Pose (live) | Real-time webcam pose tracking for rep counting (done, client-side) |
| Vision | `analyze_form` tool | Wraps batch pose analysis as an agent-callable tool (done) |
| Vision | Rep Counter + Voice Cues | Detects full range-of-motion cycles; Web Speech API delivers mid-set cues (done) |
| Multimodal | Claude Vision (food photos) | Sends meal images directly to Claude for analysis |
| Multimodal | `analyze_meal_photo` tool | Calorie/macro estimate, eating-order reasoning, goal-aware swaps |
| Multi-Agent | Strength Coach Agent | Sub-agent reasoning from performance/training data |
| Multi-Agent | Recovery Coach Agent | Sub-agent reasoning from recovery/soreness data |
| Multi-Agent | Head Coach Resolver | Synthesizes both sub-agents' positions into one final recommendation |
| Modeling | Banister Impulse-Response Model | Real fitness-fatigue calculation from training load history (done) |
| Modeling | Asymmetry Checker | Left/right comparison; takes raw measurements now, pose-landmark data later (done) |
| Data | SQLite (users, exercises, logs, plans, soreness_notes) | Structured relational storage for all user data |
| Data | RAG-lite context injection | Pulls recent logs/plan from SQLite, formats into prompt context before LLM calls |
| Backend | FastAPI CRUD endpoints | Create user, log workout, fetch logs, serve all agent-tool DB operations |
| Frontend | Progress charts (Plotly/Chart.js) | Volume and PR trends over time |
| Frontend | Weekly AI recap tool | Reuses existing data + prompt patterns to generate a summary |

## Technology stack

- **Backend:** Python, FastAPI, uvicorn
- **Database:** SQLite (SQLAlchemy ORM), Pydantic request/response models
- **LLM:** Claude API — tool_choice / tool_use blocks for function calling; Claude Vision for meal photos
- **Computer vision:** MediaPipe Pose Landmarker - Python Tasks API server-side for batch video
  (`mediapipe`, `opencv-python-headless`), `@mediapipe/tasks-vision` client-side (WASM) for the live
  webcam session; one shared `.task` model bundle for both
- **Voice:** browser Web Speech API (`speechSynthesis`) for mid-set cues - no server-side TTS dependency
- **Modeling:** Python implementation of the Banister impulse-response (fitness-fatigue) model
- **Calendar:** Google Calendar API (optional, read-only)
- **Charts:** Plotly or Chart.js
- **Frontend:** React + Vite + React Router, Tailwind CSS v4 (`@tailwindcss/vite`, no separate config
  file - theme tokens live in `src/index.css`), three.js (landing-page hero), `@mediapipe/tasks-vision`
  for the live pose-tracking overlay
- **Deployment:** Render/Railway (backend), Vercel (frontend)

## Visual design direction

Energetic, clean, motivating — a premium coaching app, not a spreadsheet or generic dark-mode SaaS
dashboard.

- **Color palette:** deep teal/forest green primary (calm authority), warm orange/coral accent
  (energy, CTAs — start workout, log set, rep counter pulses)
- **Typography:** rounded confident sans-serif for headings, highly legible body font for data-dense
  screens (logs, charts)
- **Motion:** subtle micro-animations on rep completion, plan adjustments, streak milestones
- **Data viz:** gradient-filled progress charts (volume, PRs, fatigue trend) with clear trend lines
- **Live session view:** minimal/glanceable — large rep counter, single current-cue text, nothing else
  competing for attention mid-set
- **Multi-agent debate view:** chat-bubble exchange (Strength Coach vs. Recovery Coach), distinct
  avatar/color per agent, ending in a highlighted resolved recommendation

## Database schema (current)

- `users` — id, name, email, experience_level, target_frequency, available_equipment (CSV),
  primary_goals (CSV), physical_limitations, created_at
- `exercises` — id, name, muscle_group, equipment (catalog table)
- `plans` — id, user_id, name, is_active, notes, created_at
- `plan_exercises` — id, plan_id, exercise_id, day_of_week, sets, reps, target_weight, order_index
- `logs` — id, user_id, exercise_id, plan_id (nullable), performed_at, sets, reps, weight, rpe, notes
- `soreness_notes` — id, user_id, noted_at, muscle_group, severity (1-5), notes
- `checkins` — id, user_id, checkin_date (unique per user/day), score (1-5),
  plan_status (rest_mobility/scaled_down/normal, auto-derived from score), created_at

## Repo layout

```
fitness-agent/
  backend/
    app/
      main.py          FastAPI app, CORS, router includes, /health
      config.py          Loads .env, ANTHROPIC_API_KEY, CLAUDE_MODEL
      database.py       SQLAlchemy engine/session/Base
      models.py         ORM models (users, exercises, plans, plan_exercises, logs, soreness_notes)
      schemas.py         Pydantic request/response schemas
      routers/
        users.py
        exercises.py
        plans.py
        logs.py
        soreness.py
        user_profile.py    POST /user/profile, GET /user/profile/{user_id}
        checkin.py         POST /user/checkin, GET /user/checkin/today/{user_id}
        agent.py          POST /agent/chat, POST /agent/chat/stream (SSE), GET /agent/weekly-recap/{user_id},
                           POST /agent/debate
        logs.py            POST /logs, GET /logs/user/{user_id}, GET /logs/user/{user_id}/progress
        fatigue.py         GET /fatigue/user/{user_id}, POST /fatigue/asymmetry
        vision.py          POST /vision/analyze-squat, GET /vision/form-analyses/user/{user_id}
      agent/
        tools.py           Tool schemas + DB executors (generate_workout_plan, adjust_plan, suggest_supplements,
                           ask_schedule, analyze_form)
        orchestrator.py    Manual Claude tool-use loop, profile + check-in context injection, generate_weekly_recap()
        debate.py          run_coach_debate() - 3 independent Opus calls (Strength/Recovery/Head Coach)
        fatigue.py         Banister fitness/fatigue/form model + limb-asymmetry checker (pure computation, no LLM)
      vision/
        pose_analysis.py   MediaPipe Tasks Python API - analyze_squat_video() + unit-tested segment_reps()
        models/pose_landmarker_lite.task   Committed model bundle (~5.7MB, official Google-hosted BlazePose)
    requirements.txt
    .env.example        ANTHROPIC_API_KEY=
  frontend/                Vite + React SPA (npm install && npm run dev)
    index.html            Vite entry, Google Fonts (Sora/Inter)
    vite.config.js         @vitejs/plugin-react + @tailwindcss/vite
    src/
      main.jsx             BrowserRouter + ToastProvider + SessionProvider
      App.jsx              Route table
      api.js                fetch client + SSE stream reader for /agent/chat/stream
      index.css             Tailwind v4 import + @theme brand tokens (forest/coral palette)
      context/
        SessionContext.jsx   Active user_id in localStorage
        ToastContext.jsx      useToast() + toast rendering
      components/
        Navbar.jsx, AppLayout.jsx (auth gate + navbar), HeroScene.jsx (three.js),
        ChatPanel.jsx (SSE streaming chat), CheckinForm.jsx, CheckinModal.jsx
      pages/
        Landing.jsx, Login.jsx, Profile.jsx, Checkin.jsx, Dashboard.jsx,
        Progress.jsx (volume + per-exercise PR charts, weekly recap - Chart.js),
        Debate.jsx (Strength/Recovery/Head Coach bubble cards),
        LiveSession.jsx (live webcam pose tracking + rep counting, squat video upload)
```

## Running locally

```bash
# Backend (http://localhost:8001)
cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8001

# Frontend (Vite picks the next free port if 5173 is taken, e.g. 5174)
cd frontend && npm install && npm run dev
```

## Next milestones (not yet built)

1. ~~Orchestrator agent + Claude tool-use wiring~~ — done (`backend/app/agent/`)
2. ~~Schedule Agent (`ask_schedule`) with RAG-lite context injection from SQLite~~ — done
3. ~~MediaPipe Pose integration (batch squat analysis, then live webcam rep counting)~~ — done (`/live-session`)
4. Claude Vision meal photo analysis (`analyze_meal_photo`)
5. ~~Strength Coach / Recovery Coach / Head Coach multi-agent debate flow~~ — done (`/debate`)
6. ~~Banister impulse-response fatigue model + asymmetry checker~~ — done (`/progress`)
7. ~~Progress charts (Chart.js) + weekly AI recap~~ — done (`/progress`)
8. Optional: Google Calendar read-only integration
