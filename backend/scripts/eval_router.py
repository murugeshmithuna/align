"""Evaluation harness for the fast-model router (orchestrator.py's
ROUTING_TOOL / FAST_MODEL pass) - the classifier that decides whether a
brand-new message needs a tool at all, and which one, before the heavier
Opus reasoner is ever touched. Reuses the exact real system prompt and
tool schema orchestrator.py's own routing pass uses, not a reimplementation.

50 labeled cases: 5 per real tool (9 tools) + 5 plain-conversation cases
that should route to no tool at all. Reports per-case pass/fail, overall
accuracy, and a misroute table (what it picked vs. what was expected) -
run manually (costs real Claude API calls):

    cd backend && source venv/bin/activate && python scripts/eval_router.py

Requires ANTHROPIC_API_KEY (backend/.env). Also runnable from CI via
.github/workflows/eval-router.yml (workflow_dispatch only - never on every
push, since this spends real API credits).
"""

import sys
import time

sys.path.insert(0, __file__.rsplit("/backend/", 1)[0] + "/backend")

from app.agent.orchestrator import ROUTING_TOOL, _get_client, _system_prompt
from app.config import FAST_MODEL

# (query, expected_tool_or_None) - 5 per real tool, phrased the way a user
# would actually type it, not copied from any tool's own description.
CASES = [
    # generate_workout_plan
    ("Give me a completely new workout plan from scratch.", "generate_workout_plan"),
    ("I don't have a plan yet - can you set one up for me?", "generate_workout_plan"),
    ("Build me a 4-day split based on my goals.", "generate_workout_plan"),
    ("I need a full training program created for me.", "generate_workout_plan"),
    ("Can you design a workout plan around my available equipment?", "generate_workout_plan"),
    # adjust_plan
    ("Swap squats for leg press in my current plan.", "adjust_plan"),
    ("Reduce today's volume, I'm feeling beat up.", "adjust_plan"),
    ("Add an extra set to my bench press day.", "adjust_plan"),
    ("Change my plan's rep range to higher reps across the board.", "adjust_plan"),
    ("Remove deadlifts from my Wednesday session.", "adjust_plan"),
    # log_workout
    ("I just did 3x10 squats at 185lb.", "log_workout"),
    ("Log today's workout: bench press 5x5 at 165.", "log_workout"),
    ("I finished my session - record 4 sets of pull-ups at 10 reps each.", "log_workout"),
    ("Mark down that I did deadlifts 3x5 at 275 today.", "log_workout"),
    ("Add a log for overhead press, 5x5 at 95lb.", "log_workout"),
    # update_log
    ("Fix my squat log from yesterday, it should be 225 not 215.", "update_log"),
    ("Correct the reps on my last bench entry to 8, not 10.", "update_log"),
    ("I made a typo in my deadlift log - update the weight.", "update_log"),
    ("Change the RPE on today's squat log to 9.", "update_log"),
    ("Edit my most recent log, the weight was wrong.", "update_log"),
    # delete_log
    ("Delete my squat log from this morning, I logged it twice.", "delete_log"),
    ("Remove yesterday's bench press entry.", "delete_log"),
    ("That log was a mistake, delete it.", "delete_log"),
    ("Get rid of the duplicate log I just made.", "delete_log"),
    ("Delete my last workout entry.", "delete_log"),
    # suggest_supplements
    ("What supplements should I take for muscle growth?", "suggest_supplements"),
    ("Any recommendations for recovery supplements?", "suggest_supplements"),
    ("Should I be taking creatine?", "suggest_supplements"),
    ("What's a good pre-workout supplement for me?", "suggest_supplements"),
    ("Do I need protein powder given my goals?", "suggest_supplements"),
    # ask_schedule
    ("When did I last train legs?", "ask_schedule"),
    ("What's on my schedule for tomorrow?", "ask_schedule"),
    ("How many days have I trained this week?", "ask_schedule"),
    ("When is my next scheduled leg day?", "ask_schedule"),
    ("What did I do last Wednesday?", "ask_schedule"),
    # analyze_form
    ("How was my squat form in my last video?", "analyze_form"),
    ("What should I work on with my depth?", "analyze_form"),
    ("Did my knees cave in during my last squat check?", "analyze_form"),
    ("Give me feedback on my form from the video I uploaded.", "analyze_form"),
    ("Is my back rounding on squats based on my last analysis?", "analyze_form"),
    # ask_nutrition
    ("How's my protein intake been this week?", "ask_nutrition"),
    ("Am I eating enough calories?", "ask_nutrition"),
    ("What have I been eating the past few days?", "ask_nutrition"),
    ("How's my macro balance looking?", "ask_nutrition"),
    ("Did I hit my fiber target today?", "ask_nutrition"),
    # No tool - plain conversation / general Q&A
    ("What's a deload week?", None),
    ("Why is protein important for muscle growth?", None),
    ("What's the difference between RPE and RIR?", None),
    ("How long should I rest between sets?", None),
    ("What does progressive overload mean?", None),
]


def run_eval() -> dict:
    client = _get_client()
    system_prompt = _system_prompt(allow_plan_tools=False)

    correct = 0
    results = []
    latencies = []
    for query, expected in CASES:
        start = time.monotonic()
        response = client.messages.create(
            model=FAST_MODEL,
            max_tokens=1024,
            system=system_prompt,
            tools=[ROUTING_TOOL],
            messages=[{"role": "user", "content": query}],
        )
        latencies.append(time.monotonic() - start)

        got = None
        if response.stop_reason == "tool_use":
            got = next((b.input.get("tool_name") for b in response.content if b.type == "tool_use"), None)

        is_correct = got == expected
        correct += is_correct
        results.append((query, expected, got, is_correct))

    return {
        "accuracy": correct / len(CASES),
        "results": results,
        "latencies": sorted(latencies),
    }


if __name__ == "__main__":
    report = run_eval()

    misroutes = [r for r in report["results"] if not r[3]]
    print(f"=== Router eval: {len(CASES)} cases ===\n")
    if misroutes:
        print("Misroutes:")
        for query, expected, got, _ in misroutes:
            print(f"  expected={expected!r:<24} got={got!r:<24} ({query!r})")
        print()

    lat = report["latencies"]
    p50 = lat[len(lat) // 2]
    p95 = lat[int(len(lat) * 0.95)]
    print(f"Accuracy: {report['accuracy']:.0%} ({sum(r[3] for r in report['results'])}/{len(CASES)})")
    print(f"Latency: p50={p50:.2f}s p95={p95:.2f}s")
