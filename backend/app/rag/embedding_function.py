"""Shared embedding function for the form-knowledge RAG pipeline.

Both embed_knowledge_base.py (indexing, run once/offline) and Step 3's
retrieval code (run per analyze_form call) import get_embedding_function()
from here, so a query is always embedded with the exact same model as the
documents were. Using two different embedding models between index-time and
query-time is a common, easy-to-miss RAG bug - vectors from different models
don't share a coordinate space, so "similarity" scores between them are
meaningless even though nothing errors.

Model choice - BAAI/bge-small-en-v1.5 (via sentence-transformers), not
ChromaDB's own bundled default (all-MiniLM-L6-v2, via onnxruntime):
measured directly against this project's actual knowledge-base documents,
MiniLM-L6-v2's shipped tokenizer truncates at 128 tokens (cutting from the
end - i.e. the "Correction cues" section first) while every document here is
271-374 tokens. bge-small-en-v1.5 has a verified 512-token limit, comfortably
covering the longest document (374 tokens) with no truncation. Still small
(~140MB), still fully local/free/offline after the first download - just a
context window that actually matches this content instead of the library's
out-of-the-box default.
"""

from chromadb import Documents, EmbeddingFunction, Embeddings
from sentence_transformers import SentenceTransformer

MODEL_NAME = "BAAI/bge-small-en-v1.5"

_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


class FormKnowledgeEmbeddingFunction(EmbeddingFunction):
    """Chroma's EmbeddingFunction interface - implementing __call__ is what
    lets a Chroma collection created with this function auto-embed new query
    text at retrieval time using the identical model used at index time."""

    def __call__(self, input: Documents) -> Embeddings:
        model = _get_model()
        vectors = model.encode(list(input), normalize_embeddings=True)
        return vectors.tolist()


def get_embedding_function() -> FormKnowledgeEmbeddingFunction:
    return FormKnowledgeEmbeddingFunction()
