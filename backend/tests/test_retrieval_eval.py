"""Regression test for scripts/eval_retrieval.py's measured numbers (see
README's Results section) - fails if a future embedding/threshold change
quietly regresses retrieval quality. Thresholds are set with headroom
below the real measured 92% precision@1 / 100% specificity, not at 100%,
since this is real embedding-model behavior, not a hand-crafted fixture -
a small amount of natural variance shouldn't fail CI.
"""

import pytest

from scripts.eval_retrieval import run_eval


@pytest.mark.slow
def test_retrieval_precision_at_1_stays_above_measured_baseline():
    report = run_eval()
    assert report["positive_precision"] >= 0.85


@pytest.mark.slow
def test_retrieval_specificity_stays_above_measured_baseline():
    report = run_eval()
    assert report["negative_specificity"] >= 0.95
