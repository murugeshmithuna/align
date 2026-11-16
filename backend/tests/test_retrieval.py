"""Checks the RAG relevance threshold in app/rag/retrieve.py against the
real committed ChromaDB index (app/rag/vector_store/) - no API key needed,
since embedding runs fully local/offline via sentence-transformers. Marked
slow since loading the embedding model takes a few real seconds.
"""

import pytest

from app.rag.retrieve import DISTANCE_THRESHOLD, get_relevant_form_tips


@pytest.mark.slow
def test_distance_threshold_is_the_documented_value():
    assert DISTANCE_THRESHOLD == 0.4


@pytest.mark.slow
def test_get_relevant_form_tips_returns_a_match_for_a_real_squat_flag():
    tips = get_relevant_form_tips("squat", ["depth"])
    assert len(tips) >= 1
    assert tips[0]["topic"] == "depth"


@pytest.mark.slow
def test_get_relevant_form_tips_returns_nothing_for_an_unrecognized_topic():
    # "chocolate_cake_recipe" isn't a key in FLAG_TO_QUERY, so there's no
    # query text to embed for it at all - this is the real, deterministic
    # "nothing to retrieve" path for an unrelated/unknown flag, distinct
    # from (but just as important as) the distance-threshold filtering that
    # happens for a recognized-but-dissimilar query.
    tips = get_relevant_form_tips("squat", ["chocolate_cake_recipe"])
    assert tips == []
