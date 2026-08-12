"""One-off indexing script for the exercise form-knowledge RAG pipeline.

Reads every .md file in knowledge_base/, embeds each ONE FULL DOCUMENT as
ONE CHUNK (see embedding_function.py's docstring for why one-doc-per-chunk
is safe with this specific model), and persists the resulting vectors +
text + metadata to a local ChromaDB directory (vector_store/) that gets
committed to the repo, since this corpus is tiny (13 documents) and static.

Run manually whenever the knowledge_base/ documents change:

    cd backend && source venv/bin/activate
    python -m app.rag.embed_knowledge_base

Safe to re-run: the collection is deleted and rebuilt from scratch each run
(idempotent), rather than appended to - with only 13 static documents there
is no incremental-update case worth the extra complexity of diffing.

This script does not import or touch anything under app/agent/, app/models.py,
app/database.py, or any existing route - it only reads knowledge_base/*.md
and writes to vector_store/.
"""

import re
from pathlib import Path

import chromadb

from app.rag.embedding_function import get_embedding_function

RAG_DIR = Path(__file__).parent
KNOWLEDGE_BASE_DIR = RAG_DIR / "knowledge_base"
VECTOR_STORE_DIR = RAG_DIR / "vector_store"
COLLECTION_NAME = "exercise_form_knowledge"

# Every filename follows <exercise>_<topic>.md (e.g. squat_knee_tracking.md
# -> exercise="squat", topic="knee_tracking") - parsed once here rather than
# hand-writing a metadata table, so adding a 14th document later just means
# dropping in a correctly-named file, no code change required.
KNOWN_EXERCISES = ("squat", "curl", "pushup")


def parse_metadata(filename: str) -> dict:
    stem = filename.removesuffix(".md")
    for exercise in KNOWN_EXERCISES:
        prefix = f"{exercise}_"
        if stem.startswith(prefix):
            topic = stem[len(prefix) :]
            return {"exercise": exercise, "topic": topic, "source_file": filename}
    raise ValueError(
        f"'{filename}' doesn't start with a known exercise prefix {KNOWN_EXERCISES} - "
        "rename it or add the new exercise prefix to KNOWN_EXERCISES above."
    )


def load_documents() -> list[dict]:
    docs = []
    for path in sorted(KNOWLEDGE_BASE_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8").strip()
        metadata = parse_metadata(path.name)
        docs.append({"id": metadata["source_file"], "text": text, "metadata": metadata})
    return docs


def build_index() -> None:
    documents = load_documents()
    if not documents:
        raise SystemExit(f"No .md files found in {KNOWLEDGE_BASE_DIR}")

    print(f"Found {len(documents)} documents in {KNOWLEDGE_BASE_DIR}:")
    for doc in documents:
        m = doc["metadata"]
        print(f"  - {doc['id']:<32} exercise={m['exercise']:<8} topic={m['topic']}")

    client = chromadb.PersistentClient(path=str(VECTOR_STORE_DIR))

    # Rebuilt fresh every run (see module docstring) - drop any existing
    # collection from a prior run first so this stays idempotent.
    existing = {c.name for c in client.list_collections()}
    if COLLECTION_NAME in existing:
        client.delete_collection(COLLECTION_NAME)
        print(f"\nDropped existing '{COLLECTION_NAME}' collection before rebuilding.")

    collection = client.create_collection(
        name=COLLECTION_NAME,
        embedding_function=get_embedding_function(),
        # Cosine similarity over normalized vectors (see embedding_function.py's
        # normalize_embeddings=True) - the standard pairing for BGE-family
        # embedding models, which are trained/evaluated with cosine similarity.
        metadata={"hnsw:space": "cosine"},
    )

    print(f"\nEmbedding {len(documents)} documents with {get_embedding_function.__module__}...")
    collection.add(
        ids=[d["id"] for d in documents],
        documents=[d["text"] for d in documents],
        metadatas=[d["metadata"] for d in documents],
    )

    print(f"Persisted {collection.count()} embedded chunks to {VECTOR_STORE_DIR}")


if __name__ == "__main__":
    build_index()
