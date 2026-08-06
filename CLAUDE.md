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
single-page shell, and follows a strict one-feature-per-route rule enforced twice this session (once as a
general "unclutter" pass, once as an explicit "STRICT REFACTORING REQUIRED" pass that tightened it
further): `/` (Landing, public) → `/login` (user picker/create - no real auth, just a session established
client-side via localStorage) → `/profile` (baseline onboarding form, gates first-timers before they reach
the dashboard) → `/dashboard` (active plan summary + today's readiness + a quick-links grid to every
feature route - no feature's actual tool renders inline here) → `/checkin` (also auto-shown as a modal on
the dashboard once/day). Every feature lives on its own dedicated route: `/plans` + `/plan/:planId` (plan
browsing/detail/activation), `/workout/live` (MediaPipe live session) + `/workout/log` (manual set
logging), `/nutrition` (meal photo), `/nutrition/calculator` (baseline macro/fiber goal calculator),
`/analytics` (progress charts + fatigue model), `/coach-resolution`
(unified coach decision, formerly the adversarial "Coach Debate" - see below). Routes were renamed from
their original flatter paths (`/live-session`, `/meal-photo`,
`/progress`, `/plans/:planId`, `/nutrition/analyze`) into this `/workout/*`, `/nutrition` grouping at the
user's request. A shared `AppLayout` + `Navbar` gate the authenticated routes, provide navigation between
them, and mount the global `AIMessageBar` floating assistant (see below) available from any of them.

**Landing page and Dashboard are strictly non-interactive shells** (per the "STRICT REFACTORING" request):
Landing's header has exactly one link (Sign In / Dashboard, nothing else), its hero has one CTA, and its
feature-overview section is now plain marketing prose - no cards, no "Open →" links, nothing that launches
a tool from that page (it previously rendered a `FeatureCard` grid with real links into every feature; that
grid was removed entirely, not just restyled). Dashboard dropped its embedded `ChatPanel` (a full chat UI
rendered inline) in favor of the floating `AIMessageBar`. One explicit deviation from the literal request
worth flagging: the request asked for `/plan/active` as the Active Plan card's target; `/plan/:planId`
(already built, already correct) was kept instead, since "active" isn't a real plan identifier in this
data model - the card already links to whichever plan's real ID is currently active, which is the same UX
outcome without a redundant second route resolving a magic string to that same ID.

**Dashboard widgets replaced a redundant "Quick links" grid** (the grid above just repeated the Navbar's
own links one scroll down - removed, not restyled) **with three real data-driven cards**, still with zero
inline feature tools per the strict-separation rule above - every card here still only links out, or in one
case pre-loads and *navigates* to `/workout/live` rather than rendering it inline:
- **Today's workout**: filters the active plan's `plan_exercises` by today's `day_of_week`, shows the day
  name + exercise count/names, and a "Start today's live workout" button that calls `navigate('/workout/
  live', { state: { planExercises, planId } })` - the exact same router-state contract `PlanDetail.jsx`'s
  "Start today's session" button already used, so `LiveSession.jsx`'s `buildQueueFromPlan` needed zero
  changes to accept it from a second entry point. Disabled (not hidden) when there's nothing scheduled
  today, with a "Log manually" link to `/workout/log` alongside it either way.
- **This week**: workouts-this-week count (distinct calendar days with a log in the last 7 days) against
  `target_frequency` from the profile, rendered as a progress bar; today's logged meal calories/protein
  from `meal_analyses` against `daily_calorie_target` (also from the profile) as a second progress bar.
  This field didn't originally exist in the data model - flagged rather than fabricated a number to match
  the "1,850 / 2,400 kcal" example, then added for real once asked: `User.daily_calorie_target` (nullable
  int), a "Daily calorie target (optional)" field on `/profile`, and the Dashboard falls back to an honest
  "no daily target set" (with a link to go set one) only when it's actually still unset.
- **Recent activity**: whichever of the most recent workout log or most recent meal analysis is actually
  newer (real timestamp comparison, not "always show logs first"), plus a genuine AI Coach insight -
  fetched via the same non-streaming `api.chat()` used by the PDF export's end-of-workout note, given a
  one-line summary of that most-recent activity and asked for exactly one sentence back. Fetched in the
  background on mount (a small inline spinner just for that one line, not a page-level blocker) since nothing
  else on the dashboard should wait on a model call to render.

Verified live with a realistic seeded scenario (2 of 4 target workouts this week, one meal logged today,
today's plan carrying two exercises): all three cards rendered the correct real numbers, the recent-activity
card correctly picked the meal over the workout logs (genuinely more recent), the AI tip came back
specific and grounded ("fuel that next session with another 200-300 calories..."), and clicking "Start
today's live workout" landed on `/workout/live` with both of today's exercises already populated in the
picker - confirming the cross-page router-state hookup works from this second entry point, not just from
`PlanDetail.jsx`.

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
(`data: {"content": "..."}`, `data: {"tool": name, "status": "running"|"done"}`, `data: {"widget": {...}}`,
`data: {"history": [...]}`, `data: {"done": true}` - the last two added in the interaction-model overhaul
below). Verified live with real inter-chunk timing (httpx `iter_raw()`) that Manifest forwards chunks
incrementally (~200ms gaps) rather than buffering the full response.

**AI Coach interaction overhaul** (cross-turn memory + `present_choice` widgets): fixed three real bugs
reported from live use, not hypothetical ones - the agent ignored short replies like "2" (it had genuinely
never seen the question it was replying to), it kept asking about equipment/goals/plan details that were
already in the profile, and it wrote numbered-list questionnaires in plain text instead of anything
clickable.

- **Root cause of the "2" bug**: `/agent/chat` and `/agent/chat/stream` were fully stateless per call -
  each request built `messages = [{"role": "user", "content": message}]` from scratch, so a follow-up
  message had zero knowledge of what was asked before it. Fixed by having the backend return the full
  Claude-format conversation as an opaque `history` field on every response/SSE frame, which the client
  persists (`historyRef` in `AIMessageBar.jsx`) and echoes back as `AgentChatRequest.history` on the next
  call. `run_agent_turn`/`stream_agent_turn` now skip the cheap routing pass entirely once `history` is
  non-empty (a continuing thread always goes straight to the reasoning model, since interpreting a short
  reply needs real context, not just tool classification) and prepend it to `messages` otherwise. Content
  blocks are serialized via a hand-written `_serialize_content()` rather than `block.model_dump()` - the
  latter includes response-only fields (`parsed_output`, etc.) that the API rejects with a 400 ("Extra
  inputs are not permitted") if echoed straight back as input on a later call, caught live when the first
  streaming test dropped mid-response.
- **`present_choice` "soft" tool** (`orchestrator.py`, deliberately kept out of `tools.py`'s
  `TOOL_SCHEMAS`/`TOOL_EXECUTORS` since it never touches the database): lets the model pause a turn and
  hand back a structured `{prompt, widget_type: single_choice|multi_select|confirm, options}` payload
  instead of asking a question in prose. The orchestrator loop intercepts this tool call specially - it
  still appends a placeholder `tool_result` (`{"status": "presented_to_user_awaiting_response"}`) so the
  conversation stays a valid prefix for the *next* call's `history` (the Anthropic API requires a
  `tool_use` block be immediately followed by a matching `tool_result`), then returns/yields the widget and
  stops the loop rather than calling Claude again - the real "result" is whatever the user picks, which
  arrives as a later message, not something the backend can synthesize.
- **Always-injected active-plan context**: `_build_plan_context()` (new) gathers the active plan's full
  weekly schedule (day → exercises/sets/reps) into the system prompt on every turn, alongside the existing
  profile and check-in context - previously the plan's schedule was only available on-demand via the
  `ask_schedule` tool, so a request needing both plan awareness *and* a domain-tool call in the same turn
  had a gap. `SYSTEM_PROMPT` was rewritten to explicitly forbid re-asking about anything in profile/plan/
  check-in context, mandate `present_choice` over text questionnaires, and cap replies at "2 short
  sentences of explanation, then the result" with an explicit list of banned filler phrases.
- **Frontend widget rendering** (`AIMessageBar.jsx`): `single_choice` renders as pill buttons, `multi_select`
  as a checkbox grid + a "Continue" button (disabled until ≥1 checked), `confirm` as one primary button
  labeled with the model's own action text (e.g. "Apply Updates to Plan"). Once answered, a widget collapses
  to a plain "You chose: ..." line so it isn't still clickable if the user scrolls back up. Clicking sends
  the exact option text as the next message - no ambiguity for the model to resolve.
- **Short typed-reply mapping** (`resolveShortReply()`): if a widget is active and the user types instead of
  clicking - a bare number ("2"), a confirm-shorthand word ("yes"/"do it"/"tailor it"), or text that matches
  an option - it's mapped to the exact option string *before* being sent, the same way a button click would
  be. Anything that doesn't match falls through as raw text, which the memory fix above means the model can
  usually still resolve from context even without the frontend's help (verified live: sending a bare "2"
  with no frontend mapping at all still produced a correct, grounded plan rather than "I don't understand" -
  the frontend mapping is the more deterministic first line of defense, the memory fix is what makes the
  fallback actually work too).

Verified live end-to-end (real API calls and a real browser, not scripted mocks): a deliberately
open-ended "I want to train today, what should I do" produced a `single_choice` widget (Legs/Push/Pull/Full
Body) referencing the actual profile equipment and goal, with zero re-asking of anything already known;
clicking "Legs" correctly resolved to a real `generate_workout_plan` call grounded in that choice. A
"rework my whole plan, let me pick priority muscle groups" produced a `multi_select` checkbox grid; checking
two boxes and clicking "Continue" sent "Quads, Hamstrings/Glutes" and produced a plan actually built around
those two groups. Typing the bare number "1" against a live `single_choice` session-length widget correctly
mapped to "30 minutes" (not the literal string "1") and produced a real `adjust_plan` call trimming that
day's actual exercises to fit. No reply in any of these threads produced a fabricated-fluff response
("I'd be happy to help!", "Here is your tailored plan") - every reply matched the 2-sentence-then-action
format.

Onboarding is now a settings form, not a chat conversation. `POST /user/profile` /
`GET /user/profile/{user_id}` let the frontend set/read a user's baseline (`experience_level`,
`target_frequency`, `available_equipment`, `primary_goals`, `physical_limitations`) up front. The
orchestrator injects that profile into its system prompt on every turn, so the chat agent never asks
the user to restate it — confirmed live: a bare "set me up with a workout plan" produced a full plan
matching the saved equipment/frequency/limitations with zero clarifying questions.

**Progress charts + weekly AI recap** (`/analytics`): `GET /logs/user/{user_id}/progress` aggregates
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

**Weekly AI Digest** (`/analytics`, `GET /agent/weekly-digest/{user_id}`): a second, structured weekly
synthesis alongside the existing prose recap - not a replacement, since the two serve different needs
(free-text narrative vs. a scannable three-bullet digest). `generate_weekly_digest()` in `orchestrator.py`
gathers the same logs/check-ins as the prose recap *plus* the last 7 days of `meal_analyses` (nutrition
data the prose recap never included), then forces a **strict** tool call (`report_weekly_digest`, same
`strict: true` + `additionalProperties: false` pattern as `meal_vision.py`) returning exactly three fields
- `biggest_win`, `recovery_note`, `next_week_focus` - so the three-bullet shape is schema-enforced, not
just requested in a prompt. Frontend card shows a spinner + "Synthesizing weekly performance…" while
loading, then renders the fixed 🚀/⚠️/🎯 format. Verified live with a realistic seeded week (progressive-
overload squats 185→195→205 lbs, a readiness dip to 2/5 after the heaviest session, one meal log): the
digest correctly identified the specific weight progression, correctly correlated the readiness drop with
the heaviest session rather than just restating the numbers, and on one run explicitly flagged the meal
log's protein number in its next-week recommendation - confirming the nutrition data is actually reaching
the model, not just being gathered and ignored. The empty-week case (no logs/check-ins/meals at all)
returns a deterministic canned response without calling the LLM, same philosophy as the prose recap's
empty-state handling.

**Deployed:** frontend on Vercel (`https://fitness-agent-sigma.vercel.app`, project `fitness-agent`,
team `mithuna2` - re-imported fresh; the old `fitness-agent-topaz.vercel.app` project was deleted after
its `vercel.json` SPA rewrite would not take effect no matter what was tried, including on a from-scratch
reimport with identical settings - the actual fix was the rewrite's `destination` value itself, see below),
backend on Render (`https://fitness-agent-wuvh.onrender.com`, service `fitness-agent`, **Free plan**).
`VITE_API_BASE_URL` set directly to the Render URL. Two real caveats living in production right now:
(1) Render's Free plan has **no persistent disk** - SQLite data resets on redeploys/restarts, upgrade to
Starter (~$7/mo) + attach a Disk to fix; (2) Render Free spins down on inactivity, so the first request
after idle time has a real cold-start delay (30s+).

**Vercel SPA routing fix:** direct loads of client-side routes (`/login`, `/dashboard`, etc.) 404'd on
Vercel because its static server looks for a literal file at that path unless told to fall back to
`index.html`. `frontend/vercel.json` needs a rewrite for this - `{ "rewrites": [{ "source": "/(.*)",
"destination": "/" }] }` is the version that actually worked; `"destination": "/index.html"` (and/or
`cleanUrls`/`trailingSlash`) did not, verified across three different deployments and a from-scratch
project reimport, so treat `destination: "/"` as load-bearing if this ever needs touching again. Also
found and removed an orphaned legacy root-level `vercel.json` (old `builds`/`routes` schema, left over
from an abandoned attempt to deploy the FastAPI backend on Vercel too, before switching to Render) -
`frontend/vercel.json` is now the only one in the repo.

**Schedule Agent** (`ask_schedule` tool): a RAG-lite tool like `suggest_supplements` - gathers today's
day-of-week, the active plan's weekly schedule, and up to 20 recent logs into a fact bundle, then lets
the orchestrator LLM compose a grounded answer (e.g. "when did I last train legs") instead of guessing.
Registered in `TOOL_SCHEMAS`/`TOOL_EXECUTORS`/`ROUTING_TOOL` - the three places any new tool needs to be
added for the fast-model router to be able to select it.

**Coach Resolution** (`/coach-resolution` page, `POST /agent/coach-resolution` + `POST /agent/coach-
resolution/apply`) - replaced the earlier "Coach Debate": the adversarial two-coach framing (Strength
Coach vs. Recovery Coach, resolved by a Head Coach) read as unconfident, so it's now a single unified
master-strategist call. `backend/app/agent/resolution.py`'s `generate_coach_resolution()` makes ONE
`claude-opus-4-8` call (down from three) with a forced strict `report_coach_resolution` tool_choice,
gathering the same recent-logs/soreness/check-in context the old debate used *plus* the active plan's
exercises with their real `plan_exercise_id` values, so the model can propose concrete, appliable changes
- not just describe what it would do. Returns `factors_evaluated` (2-4 short phrases), `resolution` (one
authoritative decision, no hedging), and `plan_adjustments` (a list of `{plan_exercise_id, sets, reps,
target_weight}` deltas, empty if the resolution is purely informational). Frontend renders one executive-
summary card (🧠 Factors Evaluated / 🎯 The Unified Resolution / ⚡ Action Item) - no chat bubbles, no
per-speaker avatars or colors. The Action Item is a real "Apply This Plan Adjustment" button, not
decorative: it POSTs `plan_adjustments` to `/agent/coach-resolution/apply`, which reuses `tools.py`'s
existing `execute_adjust_plan()` (the same executor the orchestrator's `adjust_plan` tool calls) rather
than duplicating that logic.

**Real bug caught and fixed while wiring the apply endpoint**: `execute_adjust_plan()`'s update loop used
`if field in upd:` to decide whether to overwrite a plan_exercise field - but the Apply flow round-trips a
Pydantic model that serializes *every* field, including ones the model left unset, as explicit `null`. A
resolution that only meant to change one exercise's weight would still include `"target_weight": null` for
the *other* adjusted exercises, and the old `in` check would treat that null as "yes, overwrite" and blank
out a real, already-set target weight the model never touched. Fixed by changing the check to
`upd.get(field) is not None`. Verified live: manually set one plan_exercise's `target_weight` to 185, then
applied a resolution whose payload included `target_weight: null` for that same exercise (it only meant to
change sets/reps) - confirmed the 185 survived the apply call untouched, while the exercise the resolution
actually meant to reweight updated correctly.

Verified live end-to-end with the same deliberately tense scenario used for the old debate feature (RPE 9.5
squat session + severity-4 soreness + readiness 2/5, real active plan with real plan_exercise IDs): the
resolution decisively called for scaling back (not hedging between two positions), cited the actual RPE/
soreness/readiness numbers by name, proposed a specific reduced Back Squat load (3x5 @ ~180 lb, down from
5x5 @ 225), and clicking "Apply This Plan Adjustment" in the browser produced a real, confirmed database
update to that exact plan_exercise row.

**Banister fatigue model + asymmetry checker** (`/analytics`, `GET /fatigue/user/{user_id}`,
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

**MediaPipe vision** (`/workout/live`): one model (`pose_landmarker_lite.task`, the official Google-hosted
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
- **Live** (`/workout/live`, "Live webcam" tab): client-side only, via `@mediapipe/tasks-vision` -
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

**Live Session rebuild** (`/workout/live`): extended the client-side pose path to a full plan-driven
workout runner. `EXERCISE_CONFIGS` in `LiveSession.jsx` generalizes the squat state machine to any
exercise reducible to a 3-point angle that starts extended ("UP"), flexes to a "DOWN" position, then
returns - squat (hip-knee-ankle), bicep curl (shoulder-elbow-wrist), push-up (shoulder-elbow-wrist,
different thresholds + a hip-sag form check) all share one state machine, just different joint triplets/
angle thresholds/form checks. Plan exercise names are keyword-matched to a config (`matchExerciseConfig`);
unmatched ones are skipped with a note rather than blocking the session. Launching "Start today's session"
from `/plan/:planId` passes today's exercises via router state, building a queue the session works
through automatically (rep target reached -> rest countdown -> next set; all sets done -> `POST /logs` the
completed exercise -> auto-advance to the next queue item -> "Workout complete!" on the last one) - an
exercise picker still lets the user jump to any queued exercise manually. No plan exercises passed (direct
nav) falls back to a single manually-picked exercise, practice-only (no history logging, since there's no
real plan_id/exercise_id to log against).

Skeleton overlay uses `DrawingUtils` + `PoseLandmarker.POSE_CONNECTIONS` (both confirmed in the installed
package's own type declarations before use) on a `<canvas>` absolutely positioned over the video, mirrored
to match; color is emerald/red per-frame based on the current exercise's live form check, not just at rep
completion.

Real correctness bug caught and fixed during this build: `requestAnimationFrame(renderLoop)` recurses on
the closure captured when `start()` first scheduled it, so any component state read inside that recursive
loop (rep count, current set, queue position, rest timer) would freeze at its value from that first call,
never seeing later updates - a classic stale-closure trap. Fixed by moving all of that into a single
`sessionRef` object the loop reads/writes directly, with `setXState()` calls alongside purely to drive the
HUD. Verified live (headless Chromium, fake camera, real plan data seeded via the API): navigating from
`/plans/:id`'s "Start today's session" correctly populates the exercise picker with the plan's exercises,
starting the session shows the right initial HUD (rep target, set count, exercise label, UP phase), and
switching exercises via the picker while stopped works. Full rep-counting accuracy against a real human
wasn't verified (no real camera subject available in this sandboxed session, same limitation as the
original build) - the state-machine algorithm itself was already proven via the batch path's synthetic
unit tests, and this is a parameterization of the same logic.

**False-positive guardrails** (added after live use surfaced camera-repositioning triggering bogus rep
counts): three independent fixes.
1. **Landmark confidence** raised from 0.5 to 0.75 for every keypoint the active exercise actually reads -
   not just the 3-point angle triplet but also whatever `checkForm` needs (e.g. squat's shoulder for its
   back-angle check), via a per-config `extraVisibility` list. A camera nudge tends to produce
   low-confidence jitter rather than a clean drop to near-zero, so the old looser threshold let unreliable
   frames through as if they were trustworthy.
2. **Camera-shift detection**: if more than 80% of *all 33* landmarks (not just the exercise's own joints)
   move more than a small normalized distance between consecutive frames, that's the whole frame shifting
   - a real rep only displaces the joints actually involved, while a nudged camera displaces everything
   at once, including landmarks with no reason to move (e.g. the opposite shoulder during a bicep curl).
   When detected, rep processing pauses entirely (not just paused counting - the state machine doesn't
   advance at all that frame) and the skeleton overlay turns amber with a "Camera shifting, please hold
   still" cue, taking priority over the green/red form-correctness color.
3. **Strict state machine with dwell time**: renamed states to `START_POSITION` -> `IN_MOTION` ->
   `PEAK_DEPTH` -> `RETURN_POSITION`, and `PEAK_DEPTH` now requires 400ms of real wall-clock time before
   it's allowed to advance to `RETURN_POSITION`. A brief dip below the flexed-angle threshold that bounces
   back up before that 400ms elapses (camera flicker, an incomplete rep) is rejected outright - no rep
   counted, straight back to `START_POSITION` - rather than being treated as a valid rep just because the
   angle briefly crossed the boundary.

Verified via a standalone replica of the exact algorithm (same logic, run outside the browser so it could
be exercised with synthetic timestamps): a normal rep with a genuine 500ms dwell at the bottom counts
correctly; an identical-looking rep that bounces back up after only 50ms is correctly rejected; landmark
sets at 0.74 visibility are correctly blocked while 0.76 passes; and simulated camera shake (all 33
landmarks shifting together) is correctly flagged while normal single-joint exercise motion is not. Live
browser smoke-tested (fake camera) for crash-safety and correct initial HUD state after the refactor - this
also caught and fixed a leftover hardcoded `setPhase('UP')` in `start()` that would have shown the old
phase label on an otherwise-renamed state machine.

**Claude Vision meal-photo analysis** (`/nutrition`): separate code path from the orchestrator's tool loop -
like `resolution.py` - since sending an image doesn't fit a JSON tool-input schema (Claude's tool-use
inputs are JSON only). `backend/app/agent/meal_vision.py` sends the uploaded photo (or, for the text path, a plain
description string) as content in a single `claude-opus-4-8` call, forcing a **strict** `report_meal_analysis`
tool call (`"strict": true` + `"additionalProperties": false` on the schema, nested `ingredients` array
items included - verified against the API reference before use, not guessed) via `tool_choice`, so the
response comes back as directly-parseable structured numbers instead of prose to parse.

**Full macro tracking + ingredient-level breakdown** (upgrade from calories-only): the model no longer
reports one aggregate number - `MEAL_ANALYSIS_TOOL` requires an `ingredients` array (name/quantity/
calories/protein_g/carbs_g/fat_g per item), and `_sum_ingredients()` computes the top-level
calories/protein/carbs/fat totals by *summing* that array server-side rather than trusting a second
model-reported aggregate that could numerically disagree with the breakdown. `sumIngredients()` on the
frontend (`MealPhoto.jsx`) mirrors this exact computation, so the Review & Edit modal's "Update Macros"
button reproduces the same math the backend will apply on save - editing one ingredient's calories and
recomputing is a real, traceable number, not a guess. Coach feedback stays three separate short fields
(`macro_summary`/`quick_tip`/`timing_note`, each schema-constrained to "under 15 words, no preamble")
carried through unchanged from the original analysis even if the user edits macros afterward - no second
LLM call on every correction (cost/latency), a deliberate scoping decision.

**Split analyze/save + dual input (photo or text) + Review & Edit before persisting**: analysis and
persistence used to be atomic in one call; that's incompatible with letting the user correct a
misidentified ingredient (e.g. the model reads cooked chicken as mutton) before it's saved. Now
`POST /vision/analyze-meal` (photo, multipart) and `POST /vision/analyze-meal-text` (`{user_id, text}`,
natural-language description like "2 grilled chicken breasts, 1 cup white rice, and broccoli") both only
run the analysis and return an unsaved `MealAnalysisPreviewOut` - neither writes to `meal_analyses`. A
separate `POST /vision/save-meal` persists whatever the user confirmed after editing. `MealPhoto.jsx` has
two tabs ("Photo Upload" / "Quick Log" text box) that both funnel into the same `ReviewModal`: editable
description, one row per ingredient with editable Name/Qty and **read-only** Cal/P/C/F badges, a remove
button, and an "+ Add ingredient" button, followed by just two actions: "Cancel" and "Save meal".

**Read-only macros + auto-recalculate on edit** (revision of the above - the ingredient macro cells were
originally plain editable number inputs with a manual "Update Macros" button): forcing manual math per
ingredient defeated the point of an AI estimate. Now Cal/P/C/F are plain read-only `<span>`s, and editing
either the ingredient Name or Qty field triggers `POST /vision/estimate-ingredient` on blur -
`meal_vision.py`'s `estimate_ingredient_macros()`, a small `FAST_MODEL` strict-tool-call lookup scoped to
one ingredient at a time (no DB access, no user_id - purely `{name, quantity} -> {calories, protein_g,
carbs_g, fat_g}`). The row shows a brief "…" placeholder and dims while its lookup is in flight; on
failure the row's last-known macros are left untouched (not zeroed) and a toast surfaces the failure
rather than hiding it, since read-only cells give the user no manual fallback if the lookup errors. The
aggregate total is now a plain `useMemo(() => sumIngredients(ingredients), [ingredients])` instead of
separate manually-synced state, so it's always in sync automatically - the old "Update Macros" button was
removed entirely since there's nothing left for it to do. Verified live: swapping a meal's "Banana, medium"
ingredient for "a large avocado" and blurring the field correctly re-estimated that row (192 kcal, 17.5g
fat vs. the banana's much lower fat) and the total updated automatically with no button click.

Frontend compresses the photo client-side before upload (canvas resize to fit 800px on the long edge,
re-encoded as JPEG at 0.7 quality - a typical phone photo is several MB at 3000px+, more than a macro
estimate needs) and shows a floating modal with a spinner and cycling stage text ("Analyzing image…" ->
"Calculating macros…" -> "Generating coach insight…") while the request is in flight, since a single opaque
API call has no real progress events to report - purely to replace a frozen-looking button with something
that reads as "working," not literal progress. Submit button and file input are both disabled while loading
to prevent duplicate requests. The text-input tab has no image step, so it skips straight from submit to
the same `ReviewModal`.

**Real latency finding, not a target hit**: this was requested with an "under 2-3 seconds" goal. Measured
live end-to-end: ~28s. That's consistent with - not a regression from - the `claude-opus-4-8` latency
already documented elsewhere in this file (baseline plan generation: "~15-30s, confirmed live"), which
reflects this environment's model/proxy setup, not something a token ceiling or schema change can fix -
vision input processing and Opus-tier generation time dominate, and 2-3s was never realistic for a
vision-capable Opus call here regardless of optimization. The image compression and lower token ceiling
are still real, valid improvements (less data over the wire, no wasted generation budget) - they just
don't add up to an order-of-magnitude win on their own. The loading modal is doing the actual heavy lifting
for the "app hangs" complaint, independent of how long the call actually takes.

**Dashboard macro dashboard + Profile macro targets**: `User` gained `daily_protein_target`/
`daily_carbs_target`/`daily_fat_target` (nullable floats) alongside the pre-existing
`daily_calorie_target` (nullable int, added in an earlier turn when the Dashboard's single calorie bar was
first built) - `/profile` now has a 4-input "Daily macro targets (optional)" grid instead of a single
calorie field. The Dashboard's "This week" card replaced its one calorie-only progress bar with a new
`MacroBar` component rendered 4x (Calories/coral, Protein/emerald, Carbs/sky, Fat/amber), each showing
"value / target unit". Continuing this project's "don't fabricate data" rule (first established when the
calorie target field didn't exist yet and a fake target was flagged instead of invented): a `MacroBar`
with no target set doesn't compute a fake percentage - it renders filled if any value was logged that
day, empty otherwise - and a fallback message ("No daily targets set - add some") only appears when *all
four* targets are unset. Logged meal items in `MealPhoto.jsx`'s history list show colored P/C/F badges
(emerald/sky/amber) instead of just a calorie number.

Verified live end-to-end with real API calls (no fabricated data): saved a profile with all 4 targets
(2400 kcal / 160g protein / 250g carbs / 70g fat) via `POST /user/profile`, confirmed `GET /user/profile`
round-trips all 4 values, confirmed `/profile`'s 4 inputs (`#calorie-target`/`#protein-target`/
`#carbs-target`/`#fat-target`) load them correctly, saved a real meal via `POST /vision/save-meal`
(650 kcal / 55g protein / 60g carbs / 15g fat), then confirmed the Dashboard's "This week" card rendered
all 4 `MacroBar`s with the correct "logged / target" labels for every macro. Separately verified the full
photo and text-input analyze -> Review & Edit -> save flow in the browser (Playwright): both tabs reach the
same modal, editing an ingredient's calories and clicking "Update Macros" recomputes the aggregate total
correctly, and "Save meal" persists the edited (not original) numbers - confirmed by the saved history
entry reflecting the edit, not the model's first-pass estimate. `ask_nutrition` (RAG-lite, same pattern as
`analyze_form`/`ask_schedule`) lets chat answer follow-ups like "how's my protein been?" from recent
analyses - unchanged by this upgrade since `meal_analyses`' persisted shape didn't change, only what
happens before persistence did.

**Removed the per-activity AI insight; added aggregated Daily/Weekly nutrition reviews**: the Dashboard's
"Recent activity" card used to fetch a one-off coaching sentence via a plain `POST /agent/chat` call
whenever the most recent activity was a meal. Root cause of a real bug this caused (raw text like "I'd
need to call `ask_nutrition`..." leaking into the UI): that call shared the orchestrator's `SYSTEM_PROMPT`,
which lists real tool names in prose ("ask_nutrition for meal/nutrition questions...") - the fast router
model, when it decided no tool call was actually needed, would sometimes still parrot a tool name it had
just read in its own system prompt. Fixed by deleting that fetch entirely (Dashboard's "Recent activity"
is now purely a clean log: meal name/date/calories + P/C/F badges, no AI text at all) and replacing
per-item micro-insights with two aggregated, **tool-free** reviews modeled on `generate_weekly_digest`'s
existing pattern (a forced strict tool call, no `system` prompt, no other tools in scope - there's nothing
for the model to call or narrate about since the one tool it's forced into is the entire output schema):
- `generate_daily_nutrition_review()` (`GET /agent/nutrition-review/daily/{user_id}`) - gathers *today's*
  `meal_analyses` and the user's targets from the DB before ever calling the LLM, then forces
  `report_nutrition_review` (`macro_status`/`key_pattern`/`recommendation`). `/nutrition` has a
  button-triggered "Generate End-of-Day Review" card (not auto-fetched - re-running it on every page visit
  would just re-synthesize the same or stale data) rendering the fixed 📊/💡/🎯 three-line format.
- `generate_weekly_nutrition_review()` (`GET /agent/nutrition-review/weekly/{user_id}`) - same shape, scoped
  to the last 7 days, with days-logged/day-count and daily-average calorie/macro numbers computed in Python
  and handed to the model so it can reason about *consistency* (how many of the 7 days actually have a
  logged meal) rather than just the raw meal list. Rendered as a "Weekly nutrition audit" card on
  `/analytics`, alongside (not replacing) the existing blended workout+nutrition `generate_weekly_digest`.
- Both empty-state cases (no meals at all) return a canned response with no LLM call, same philosophy as
  every other digest/recap in this app.

Verified live: seeded a day with two real meals (a balanced chicken/rice meal and a high-carb "Milo
milkshake and a chocolate bar" snack) and confirmed the daily review correctly cited the actual logged
numbers, named the specific milkshake pattern, and gave a concrete protein-gap recommendation - not generic
advice. Separately verified the empty/sparse case: with only one meal logged across the whole week, the
weekly audit correctly flagged "6 of 7 days have no recorded food data" as the key pattern rather than
trying to draw a trend conclusion from insufficient data.

**Baseline macro/fiber goal calculator** (Mifflin-St Jeor BMR -> TDEE -> goal-adjusted macros): a pure-JS
utility, `frontend/src/utils/nutritionGoals.js` (`calculateBMR`/`calculateTDEE`/`calculateBaselineGoals`),
computed entirely client-side - no backend involvement in the math itself, only in persisting whatever the
user confirms. `User` gained `age`/`sex`/`activity_level` (calculator inputs) and `daily_fiber_target`
(a calculated output, alongside the existing calorie/protein/carbs/fat targets). Protein targets scale
1.8-2.2 g/kg bodyweight by goal (higher for muscle gain/fat loss, to preserve lean mass); fat is fixed at
25% of calories; carbs absorb the remaining calorie budget; fiber is `14g per 1,000 kcal`, clamped to the
requested 25-38g baseline range. Originally landed as a second form stacked at the bottom of `/profile`
(its own `Save Goals` button, independent of the main "Save profile" submit); later extracted wholesale
into its own dedicated `/nutrition/calculator` page (`NutritionCalculator.jsx` - see the sidebar overhaul
below) once that placement was flagged as buried/hard to find. Age/Sex/Activity Level/Primary Goal inputs,
an "Auto-Calculate Baseline Goals" button that fills five target fields, and a `Stepper` (+/- buttons
around a number input, rendered inside a `MacroTargetCard` - emoji + label header, the current value in
large type, then the stepper) for manually nudging any of them afterward. Since the calculator now lives
on its own route rather than reading `/profile`'s in-memory state, it has its own Height/Weight/Units
inputs too, saving back to the exact same underlying `User.height_cm`/`weight_kg` fields `/profile` uses -
editing either page keeps the one stored value in sync, there's no divergent second copy.

**Real bug caught and fixed during live testing**: the `Stepper`'s native `<input type="number" step={5}>`
looked fine on screen, but an auto-calculated value like `176` (protein) isn't a multiple of `5` - HTML5
constraint validation silently rejects the whole form's submit event on a step mismatch, with **no console
error and no network request**, so "Save Goals" appeared to do nothing at all. Root-caused by comparing
Playwright's request-listener output (empty) against the backend's access log (no `POST /user/profile`
ever arrived) after the button click reported as successful. Fixed by setting the actual input's
`step="any"` (disables native step validation) while keeping the +/- buttons' fixed increment as a
separate JS-only value - confirmed live afterward: auto-calculate, a stepper nudge (+10 via two clicks),
Save Goals, and a full page reload all round-tripped the exact edited numbers correctly.

**Left hamburger sidebar drawer, replacing the horizontal Navbar** (`Sidebar.jsx` + `Header.jsx`, wired into
`AppLayout.jsx`): the old always-visible top `Navbar.jsx` (7+ text links crammed into one row) is deleted
entirely. `Header.jsx` is now a minimal bar - a `☰` hamburger + logo on the left, a real user
avatar/name/logout on the right (fetches the profile for `name`/`photo_url`; falls back to a coral circle
with the first letter of the name if there's no `photo_url`, e.g. non-Google accounts - never a fabricated
image). Clicking the hamburger opens `Sidebar.jsx`, a slide-in left drawer (`-translate-x-full` ->
`translate-x-0`, backdrop click or its own close button to dismiss) listing exactly 8 core routes with an
emoji icon each: Home/Dashboard, Live Session, Log Workout, Meal Tracker & Vision AI, Nutritional & Macro
Calculator, Analytics & AI Audits, Coach Resolution & Strategy, Profile & Goal Settings. `/plans`,
`/plan/:planId`, and `/checkin` are deliberately not in this list - they already have their own in-app
entry points (Dashboard's Active Plan card, the daily check-in modal) and didn't need global nav presence
on top of that. Each item is a real `NavLink` (not a parallel non-URL view-state machine) - clicking one
still updates the actual URL and closes the drawer, so deep-linking, browser back/forward, and every
route-state-passing pattern already in use elsewhere (e.g. Dashboard's "Start today's live workout"
handing `planExercises` to `/workout/live` via router state) keeps working unmodified. The "single dynamic
view, no reload" requirement this was built to satisfy was already true of client-side route navigation
before this change - what was actually broken was the *presentation* (a cramped horizontal link row), not
the navigation mechanism, so the fix targets that directly rather than replacing a working router with a
custom state machine that would have broken deep-linking for no real benefit.

**Global AI assistant** (`AIMessageBar.jsx`, mounted in `AppLayout`): a floating action button + slide-over
drawer available from every authenticated page, not just the Dashboard - requested as a shadcn
`/components/ui` TypeScript component with `lucide-react` icons, none of which exist in this project (no
TypeScript anywhere, no shadcn setup, no lucide-react dependency - confirmed by searching before building
anything). Built in plain JSX matching the app's existing conventions instead: inline SVG icons, Tailwind
classes matching the rest of the design system, reuses the exact same `streamAgentChat` SSE logic the
Dashboard's old embedded `ChatPanel` used (since removed - see below) rather than a second chat
implementation. Verified live: FAB toggles the
drawer, persists across route changes (mounted once in `AppLayout`, not per-page), and a real message
streams a real reply into the drawer end-to-end. (One test run briefly returned an empty reply - traced to
a transient Manifest proxy OAuth error, `M102: anthropic subscription credentials could not be refreshed`,
not a bug in this component; a retry a minute later worked normally.)

**FAB relabeled to a visible "Ask Coach" pill** (revision of the above): the original FAB was an icon-only
circle with no text, which made it easy to miss as an interactive element rather than decoration. Now a
labeled pill (`px-4/py-3 rounded-full`, sparkle icon + "Ask Coach" text, white text on coral rather than
the near-black text the old circular version used - matches every other coral CTA in the app, which rely
on the app's default light text color rather than overriding it dark) with a hover scale+shadow lift.
Still `fixed bottom-6 right-6`, still mounted once in `AppLayout` so it's present on every authenticated
route. Verified live present (and correctly labeled) on Dashboard, Nutrition, Analytics, and Profile.

**Analytics page: tabbed grid layout** (`/analytics`) - the 7 cards that used to stack in one long vertical
list (forcing scrolling/zooming to see everything) are now grouped into 3 tabs, each a CSS grid instead of
a single column: "AI Insights & Audits" (default - Weekly AI Recap / Weekly AI Insights / Weekly Nutrition
Audit side by side, `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), "Performance & Metrics" (Training Volume
+ Exercise Progression charts side by side, `md:grid-cols-2`), and "Advanced Biometrics & Recovery"
(Fatigue/injury-risk model + Limb Asymmetry Check side by side). Card padding tightened (`py-3 px-4`
instead of `p-6`), headings shrunk to `text-sm`, and title+action-button pairs stay inline
(`flex justify-between items-center`) - none of the underlying functionality changed, purely a container/
layout reorganization. Chart height trimmed from `h-64` to `h-56` in the two chart-heavy tabs to help the
side-by-side pairs fit without a full window scroll on a standard 1080p viewport.

**Voice cue upgrade** (`/workout/live`): `speak()` moved from a module-level helper into `LiveWebcamSession`
itself so it can close over a `voiceEnabledRef` - a mute toggle button (speaker icon, top of the controls
row) now gates every cue, and `window.speechSynthesis.cancel()` on mute stops whatever's mid-sentence.
`speak()` also changed from cancel-and-interrupt to skip-if-already-speaking (checks `.speaking` before
queuing a new utterance) - a form-correction cue starting mid-sentence no longer gets cut off by a rep-
count cue a moment later. Completed reps now speak the actual rep number ("One", "Two", ... - a small
word-list up to twenty, numeral fallback beyond that) instead of a generic "Good rep", except when that
rep's form check failed, in which case the form-correction cue takes priority and the number isn't spoken
at all for that rep. Set-completion phrasing standardized to "Set complete! Great job." Verified live
(headless Chromium, fake camera): the mute button correctly toggles its icon/label and the Export-PDF
button stays correctly hidden until a workout is actually complete.

**Shareable workout PDF** (`/workout/live`, "Export as PDF" on the Workout Complete screen): real session
metrics are tracked as the session runs, not fabricated after the fact - `formFrameCountsRef` tallies
`checkForm()`'s ok/fail result every processed frame (Form Accuracy % is genuinely `ok / total`, not a
placeholder number), `completedExercisesRef` records each exercise's actual sets/reps/weight as it
finishes, and `sessionStartedAtRef` gives a real elapsed duration. `buildWorkoutPdf()` renders the summary
with jsPDF's own text/line drawing primitives - not `html2canvas` - since this content (a title, a date, a
short list, a few numbers) is fundamentally textual/tabular; real vector text keeps the file small and the
text selectable, instead of rasterizing a DOM snapshot into an oversized embedded image. (jsPDF still pulls
in `html2canvas` transitively for its own unused `.html()` method - no public "core-only" entry point in
its package exports to avoid that; accepted as a known tradeoff, same category as the other large
dependencies already in this app - MediaPipe, three.js, Chart.js.) The "AI Coach's Notes" section comes
from a real `POST /agent/chat` call (added a non-streaming `api.chat()` wrapper for this) summarizing the
session's actual exercises/form accuracy and asking for a short note - added to the PDF only if that call
succeeds, with a graceful fallback string otherwise. Verified via a standalone Node script (jsPDF supports
a Node output target) calling the exact same `buildWorkoutPdf` logic used in the browser: both a normal
session (mixed weighted/bodyweight exercises) and an edge-case empty session produce valid PDFs (correct
`%PDF-` magic bytes), and the raw PDF text objects were inspected directly to confirm "Back Squat - 3 x 8 @
185", "Total Volume", and "Form Accuracy Score" all appear exactly as expected in the output.

Voice cues beyond the live session are not built yet.

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
| Multimodal | Claude Vision (food photos) | Sends meal images directly to Claude for analysis (done) |
| Multimodal | `ask_nutrition` tool | RAG-lite follow-up over recent meal-photo analyses (done) |
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
  (image content block + forced `tool_choice` for structured output, `backend/app/agent/meal_vision.py`)
- **Computer vision:** MediaPipe Pose Landmarker - Python Tasks API server-side for batch video
  (`mediapipe`, `opencv-python-headless`), `@mediapipe/tasks-vision` client-side (WASM) for the live
  webcam session; one shared `.task` model bundle for both
- **Voice:** browser Web Speech API (`speechSynthesis`) for mid-set cues - no server-side TTS dependency
- **Modeling:** Python implementation of the Banister impulse-response (fitness-fatigue) model
- **Calendar:** Google Calendar API (optional, read-only)
- **Charts:** Plotly or Chart.js
- **Frontend:** React + Vite + React Router, Tailwind CSS v4 (`@tailwindcss/vite`, no separate config
  file - theme tokens live in `src/index.css`), three.js (landing-page hero), `@mediapipe/tasks-vision`
  for the live pose-tracking overlay, `jspdf` for the workout-summary PDF export
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
- **Coach Resolution view:** one unified executive-summary card (Factors Evaluated / Resolution / Action
  Item) - no chat bubbles, no per-agent avatars or colors; a single confident voice, not a debate

## Database schema (current)

- `users` — id, name, email, google_sub (nullable, unique - set on Google sign-in, see `/auth/google`),
  photo_url, experience_level, target_frequency, available_equipment (CSV), primary_goals (CSV),
  physical_limitations, height_cm, weight_kg, preferred_units (metric/imperial), age, sex, activity_level
  (baseline-calculator inputs), daily_calorie_target, daily_protein_target, daily_carbs_target,
  daily_fat_target, daily_fiber_target (all nullable, optional), created_at
- `exercises` — id, name, muscle_group, equipment (catalog table)
- `plans` — id, user_id, name, is_active, notes, created_at
- `plan_exercises` — id, plan_id, exercise_id, day_of_week, sets, reps, target_weight, rest_seconds,
  order_index
- `form_analyses` — id, user_id, analyzed_at, exercise_name, rep_count, reps_with_good_depth/
  knee_tracking/back_angle, raw_json (per-rep detail)
- `meal_analyses` — id, user_id, analyzed_at, description, estimated_calories, protein_g, carbs_g,
  fat_g, macro_summary, quick_tip, timing_note
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
        plans.py           POST /plans, GET /plans/user/{user_id}, GET /plans/{plan_id},
                           PATCH /plans/{plan_id}/activate
        soreness.py
        user_profile.py    POST /user/profile, GET /user/profile/{user_id}
        checkin.py         POST /user/checkin, GET /user/checkin/today/{user_id}
        agent.py          POST /agent/chat, POST /agent/chat/stream (SSE), GET /agent/weekly-recap/{user_id},
                           GET /agent/weekly-digest/{user_id}, GET /agent/nutrition-review/daily/{user_id},
                           GET /agent/nutrition-review/weekly/{user_id}, POST /agent/coach-resolution,
                           POST /agent/coach-resolution/apply
        logs.py            POST /logs, GET /logs/user/{user_id}, GET /logs/user/{user_id}/progress
        fatigue.py         GET /fatigue/user/{user_id}, POST /fatigue/asymmetry
        vision.py          POST /vision/analyze-squat, GET /vision/form-analyses/user/{user_id},
                           POST /vision/analyze-meal (photo, preview only), POST /vision/analyze-meal-text
                           (text, preview only), POST /vision/estimate-ingredient (single-row macro
                           lookup for Review & Edit auto-recalc), POST /vision/save-meal (persists after
                           Review & Edit), GET /vision/meal-analyses/user/{user_id}
      agent/
        tools.py           Tool schemas + DB executors (generate_workout_plan, adjust_plan, suggest_supplements,
                           ask_schedule, analyze_form, ask_nutrition)
        orchestrator.py    Manual Claude tool-use loop, profile/plan/check-in context injection,
                           present_choice widget tool, generate_weekly_recap()/generate_weekly_digest(),
                           generate_daily_nutrition_review()/generate_weekly_nutrition_review()
        resolution.py       generate_coach_resolution() - 1 forced-tool-call Opus call, replaces the
                           earlier 3-call debate.py (Strength/Recovery/Head Coach)
        fatigue.py         Banister fitness/fatigue/form model + limb-asymmetry checker (pure computation, no LLM)
        meal_vision.py     analyze_meal_photo() + analyze_meal_text() - single Claude call each (vision or
                           text), forced tool_choice for structured ingredient-level output, _sum_ingredients(),
                           estimate_ingredient_macros() - small FAST_MODEL single-ingredient lookup
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
      utils/
        nutritionGoals.js    calculateBMR()/calculateTDEE()/calculateBaselineGoals() - pure functions,
                             no side effects, no backend involvement in the math itself
        units.js             CM_PER_IN/KG_PER_LB + metricToDisplay()/displayToMetric() - shared between
                             Profile.jsx and NutritionCalculator.jsx's separate height/weight inputs
      components/
        Header.jsx (minimal top bar - hamburger + logo left, avatar/name/logout right),
        Sidebar.jsx (slide-in left drawer, 8 core routes w/ emoji icons - replaces the deleted
          horizontal Navbar.jsx), AppLayout.jsx (auth gate + mounts Header/Sidebar/AIMessageBar),
        HeroScene.jsx (three.js), CheckinForm.jsx, CheckinModal.jsx,
        AIMessageBar.jsx (floating FAB + slide-over drawer, available on every authenticated page - the
          only chat surface in the app now; replaced the deleted ChatPanel.jsx that used to live inline
          on the Dashboard. Plain JSX + inline SVG icons, no TypeScript/shadcn/lucide-react - this
          project doesn't use any of those)
      pages/
        Landing.jsx, Login.jsx, Profile.jsx, Checkin.jsx, Dashboard.jsx,
        Progress.jsx (volume + per-exercise PR charts, weekly recap - Chart.js),
        CoachResolution.jsx (unified executive-summary card, Apply This Plan Adjustment button),
        LiveSession.jsx (plan-driven multi-exercise pose tracking, skeleton overlay, auto-log/advance,
          squat video upload), PlanDetail.jsx, PlanList.jsx,
        WorkoutLog.jsx (manual set logging - exercise picker w/ inline "+ new", sets/reps/weight/rpe,
          recent-logs list),
        MealPhoto.jsx (dual photo/text input tabs, editable Review & Edit modal w/ read-only auto-
          recalculating macros, button-triggered Daily Review card, logged-meal history w/ P/C/F badges),
        NutritionCalculator.jsx (`/nutrition/calculator` - extracted out of Profile.jsx: own
          height/weight/age/sex/activity/goal inputs, Auto-Calculate button, 5 visual MacroTargetCards)
```

**Google Sign-In** (`/login`, `POST /auth/google`): the `User.google_sub`/`photo_url` columns and
`GoogleAuthRequest`/`GoogleAuthOut` schemas had existed since early in the project but were unused until
the user supplied a real Google Cloud OAuth Client ID/Secret (a downloaded `client_secret_*.json`).
Frontend uses `@react-oauth/google`'s `<GoogleLogin>` (Google Identity Services, not a redirect-based
OAuth flow) - clicking it gets a signed JWT `id_token` directly in the browser, no server round-trip
needed just to start the flow. `backend/app/routers/auth.py`'s `POST /auth/google` verifies that token
server-side via `google.oauth2.id_token.verify_oauth2_token()` (checks the cryptographic signature against
Google's own public certs and confirms the `aud` claim matches `GOOGLE_CLIENT_ID` - a token is never
trusted on its claims alone) and upserts a `User` keyed on `google_sub` (Google's stable per-account id,
not email - a user could change their email on Google's side without it affecting this). If no user has
that `google_sub` yet but one already exists with the same email (i.e. they'd previously signed up via
the plain name/email flow), that existing account is linked (`google_sub` and `photo_url` backfilled)
rather than creating a duplicate. `Login.jsx`'s Google button sits above the existing plain-login form
with an "or" divider - both paths still work, this is additive, not a replacement. Since
`GoogleAuthOut` already returns the full `UserOut` (including `experience_level`), the post-login redirect
decision (`/dashboard` vs. `/profile` for first-timers) reads directly off that response instead of the
second `GET /user/profile` round-trip the plain-login path's `enterAs()` does.

Real Google Cloud project (`fitness-app-504711`) - `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` live in
`backend/.env` (gitignored, never committed - only empty placeholders went into `.env.example`), the
client ID (not secret, safe to expose in a browser bundle) lives in `frontend/.env` as
`VITE_GOOGLE_CLIENT_ID`. The OAuth client's authorized JavaScript origins already covered both local dev
ports (`localhost:5173`, `localhost:5180`) and the production Vercel URL, so no Google Cloud Console
changes were needed on top of what the user had already configured. Verified live: the backend endpoint
correctly rejects a malformed token with a clear 401 rather than a stack trace; the frontend button renders
correctly (a real GSI iframe mounts, `client_id` correctly threaded through from `main.jsx`'s
`GoogleOAuthProvider`) alongside the untouched existing login form. A full click-through with a real Google
account's consent screen can't be scripted in this sandboxed environment (Google's popup flow requires
genuine user interaction) - that step is on the user to confirm live. One transient, non-reproducible React
"Invalid hook call" console error appeared on a single cold-load test run and did not recur on retry;
treated as test-environment noise, not a real bug, consistent with this project's practice of not chasing
one-off anomalies that don't reproduce. A real, reproducible "origin not allowed for this client ID" GSI
warning did appear on every run despite the origin matching the configured list exactly - almost certainly
Google Cloud Console's own config-propagation delay (well-documented as taking anywhere from minutes to
longer after creating/editing OAuth credentials), not a bug in this code; if it persists for the user
beyond that window, double-check the exact origin string (protocol/host/port) in Google Cloud Console.

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
3. ~~MediaPipe Pose integration (batch squat analysis, then live webcam rep counting)~~ — done (`/workout/live`)
4. ~~Claude Vision meal photo analysis~~ — done (`/nutrition`)
5. ~~Strength Coach / Recovery Coach / Head Coach multi-agent debate flow~~ — done, later replaced by a
   unified Coach Resolution (`/coach-resolution`)
6. ~~Banister impulse-response fatigue model + asymmetry checker~~ — done (`/analytics`)
7. ~~Progress charts (Chart.js) + weekly AI recap~~ — done (`/analytics`)
8. Optional: Google Calendar read-only integration
