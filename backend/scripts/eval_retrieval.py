"""Retrieval evaluation for the exercise-form RAG pipeline (app/rag/retrieve.py).

Measures precision@1 at the real 0.4 distance threshold this app actually
uses: for each of the 13 knowledge-base documents, one natural-language
query a user might plausibly type, run through the exact same
collection.query(..., where={"exercise": ...}) call get_relevant_form_tips
makes - does the correct document come back as the top, under-threshold
match? Plus a set of genuinely unrelated queries, checked the opposite way:
does the top result correctly land OVER the threshold (i.e. would be
filtered out), so an irrelevant query never contaminates a real critique.

No Claude API call involved - this is pure embedding + ChromaDB, fully
offline and reproducible. Run with:

    cd backend && source venv/bin/activate && python scripts/eval_retrieval.py
"""

import sys

sys.path.insert(0, __file__.rsplit("/backend/", 1)[0] + "/backend")

from app.rag.retrieve import DISTANCE_THRESHOLD, _get_collection

# (query, expected_document_id, exercise_filter) - one per real knowledge-base
# document, phrased the way a user would actually describe the problem, not
# copied from the document's own text.
POSITIVE_CASES = [
    ("my squats aren't reaching full depth, I come up too early", "squat_depth.md", "squat"),
    ("my knees cave inward when I squat heavy", "squat_knee_tracking.md", "squat"),
    ("I'm leaning too far forward and rounding my back on squats", "squat_back_angle.md", "squat"),
    ("how do I brace my core properly before squatting", "squat_setup_bracing.md", "squat"),
    ("my pushups aren't going low enough to the floor", "pushup_shallow_depth.md", "pushup"),
    ("my hips sag down during push-ups", "pushup_hip_sag.md", "pushup"),
    ("my neck juts forward and I'm looking up during pushups", "pushup_neck_alignment.md", "pushup"),
    ("my elbows flare straight out to the sides doing pushups", "pushup_elbow_flare.md", "pushup"),
    ("where exactly should my hands be placed for push-ups", "pushup_hand_placement.md", "pushup"),
    ("I'm not curling the weight through the full range of motion", "curl_partial_range.md", "curl"),
    ("my elbows drift forward away from my body during bicep curls", "curl_elbow_drift.md", "curl"),
    ("I keep swinging my whole body to heave the weight up on curls", "curl_momentum_swinging.md", "curl"),
    ("my wrists bend back too much while curling", "curl_wrist_position.md", "curl"),
]

# Genuinely unrelated to any exercise-form topic - should land well outside
# the threshold regardless of which exercise filter happens to be applied.
NEGATIVE_QUERIES = [
    "chocolate cake recipe with buttercream frosting",
    "what's the weather forecast for tomorrow",
    "capital city of France",
    "stock market trends this week",
    "how do I file my taxes this year",
    "best sci-fi movies of the 1980s",
    "how to change a flat tire on a car",
]


def run_eval() -> dict:
    collection = _get_collection()

    positive_hits = 0
    positive_results = []
    for query, expected_id, exercise in POSITIVE_CASES:
        result = collection.query(query_texts=[query], n_results=1, where={"exercise": exercise})
        got_id = result["ids"][0][0] if result["ids"][0] else None
        distance = result["distances"][0][0] if result["distances"][0] else None
        correct = got_id == expected_id and distance is not None and distance <= DISTANCE_THRESHOLD
        positive_hits += correct
        positive_results.append((query, expected_id, got_id, distance, correct))

    negative_hits = 0
    negative_results = []
    for query in NEGATIVE_QUERIES:
        result = collection.query(query_texts=[query], n_results=1, where={"exercise": "squat"})
        distance = result["distances"][0][0] if result["distances"][0] else None
        correctly_filtered = distance is None or distance > DISTANCE_THRESHOLD
        negative_hits += correctly_filtered
        negative_results.append((query, distance, correctly_filtered))

    return {
        "positive_precision": positive_hits / len(POSITIVE_CASES),
        "positive_results": positive_results,
        "negative_specificity": negative_hits / len(NEGATIVE_QUERIES),
        "negative_results": negative_results,
    }


if __name__ == "__main__":
    report = run_eval()

    print(f"=== Positive cases ({len(POSITIVE_CASES)} real knowledge-base documents) ===")
    for query, expected, got, distance, correct in report["positive_results"]:
        mark = "✓" if correct else "✗"
        dist_str = f"{distance:.4f}" if distance is not None else "n/a"
        print(f"  {mark} dist={dist_str}  expected={expected:<28} got={got}  ({query!r})")
    print(f"\nPrecision@1: {report['positive_precision']:.0%} ({sum(c for *_, c in report['positive_results'])}/{len(POSITIVE_CASES)})")

    print(f"\n=== Negative cases ({len(NEGATIVE_QUERIES)} unrelated queries) ===")
    for query, distance, correct in report["negative_results"]:
        mark = "✓" if correct else "✗"
        dist_str = f"{distance:.4f}" if distance is not None else "n/a"
        print(f"  {mark} dist={dist_str}  ({query!r})")
    negative_pass_count = sum(c for _, _, c in report["negative_results"])
    print(f"\nSpecificity: {report['negative_specificity']:.0%} ({negative_pass_count}/{len(NEGATIVE_QUERIES)})")
