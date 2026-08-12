"""Retrieval step for analyze_form's RAG augmentation.

Given the specific form issue(s) a squat analysis flagged (depth /
knee_tracking / back_angle), retrieves the most relevant 1-2 knowledge-base
chunks so analyze_form's caller (the orchestrator LLM) can ground its
critique in real coaching text instead of composing one from scratch.

Every failure mode here - a missing vector store, a model-load error, the
collection not existing yet, anything - is caught and turns into an empty
list, never an exception. get_relevant_form_tips() being unusable for any
reason must be indistinguishable, to its caller, from "no flags were raised
today." See tools.py's analyze_form integration for how that guarantee is
used: the new key is only added to the response when this returns something.

chromadb and the embedding function (which pulls in sentence-transformers/
torch) are deliberately imported inside _get_collection() rather than at
module level - importing this module at all must stay cheap; the heavy ML
stack should only load the first time a flagged form issue actually reaches
retrieval, not merely because tools.py imports this module. This is fixing
a real production incident: sentence-transformers pulls in a full
CUDA-enabled torch build on Linux, and with that import at module top,
every backend boot paid that cost - on Render's free tier it was slow/heavy
enough to blow the platform's port-bind timeout and take the whole app down.
"""

VECTOR_STORE_DIR = "app/rag/vector_store"
COLLECTION_NAME = "exercise_form_knowledge"

# Reformulates each raw flag name (what execute_analyze_form actually has -
# a topic slug, not a sentence) into natural language before embedding it -
# measured directly against this project's real knowledge base: a natural
# sentence retrieves the correct doc with real separation from wrong docs
# (~0.19 vs ~0.27+ distance); the bare slug does not perform as reliably,
# since the embedding model was trained on natural sentences, not
# underscored keywords. Small and static because the scope is small and
# static (3 known squat flags today) - adding curl/pushup later is adding
# entries here, not restructuring anything.
FLAG_TO_QUERY = {
    "depth": "squat not reaching full depth, shallow reps",
    "knee_tracking": "knees caving inward during squat, knee tracking issue",
    "back_angle": "excessive forward lean or rounded back during squat",
}

# Measured empirically against this project's real 13-document knowledge
# base (see the Step 3 conversation): correct-topic matches land at
# distance ~0.18-0.20, wrong-topic-same-exercise matches at ~0.21-0.30, and
# a genuinely unrelated query at ~0.54-0.55. 0.4 sits in the wide, clean gap
# between "a real match in this domain" and "not related at all."
DISTANCE_THRESHOLD = 0.4
MAX_CHUNKS = 2

_client = None


def _get_collection():
    global _client
    if _client is None:
        import chromadb

        _client = chromadb.PersistentClient(path=VECTOR_STORE_DIR)
    from app.rag.embedding_function import get_embedding_function

    return _client.get_collection(COLLECTION_NAME, embedding_function=get_embedding_function())


def get_relevant_form_tips(exercise_name: str, flagged_topics: list[str]) -> list[dict]:
    if not flagged_topics:
        return []

    try:
        collection = _get_collection()
        candidates = []
        for topic in flagged_topics:
            query = FLAG_TO_QUERY.get(topic)
            if not query:
                continue
            result = collection.query(
                query_texts=[query],
                n_results=1,
                where={"exercise": exercise_name.lower()},
            )
            ids = result["ids"][0]
            if not ids:
                continue
            distance = result["distances"][0][0]
            if distance > DISTANCE_THRESHOLD:
                continue
            candidates.append(
                {
                    "topic": topic,
                    "text": result["documents"][0][0],
                    "source_file": ids[0],
                    "distance": round(distance, 4),
                }
            )

        candidates.sort(key=lambda c: c["distance"])
        return candidates[:MAX_CHUNKS]
    except Exception:
        # Any failure here (missing vector store, model load error, etc.)
        # degrades to "nothing retrieved" - never an exception that could
        # break analyze_form's response for what is otherwise a working
        # pose-estimation result.
        return []
