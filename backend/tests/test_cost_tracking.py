"""Confirms app/cost_tracking.py's log_usage() computes a sane cost
estimate from real token counts and degrades gracefully (no crash, no
fabricated number) when it can't."""

import logging
import time
from types import SimpleNamespace

from app.cost_tracking import log_usage


def test_log_usage_emits_a_real_cost_estimate(caplog):
    usage = SimpleNamespace(input_tokens=1000, output_tokens=500)
    with caplog.at_level(logging.INFO, logger="app.cost"):
        log_usage("test_call", "claude-haiku-4-5", usage, time.monotonic())

    assert len(caplog.records) == 1
    message = caplog.records[0].getMessage()
    assert "label=test_call" in message
    assert "model=claude-haiku-4-5" in message
    assert "input_tokens=1000" in message
    assert "output_tokens=500" in message
    # 1000 input @ $1/M + 500 output @ $5/M = $0.001 + $0.0025 = $0.0035
    assert "cost_usd=0.00350" in message


def test_log_usage_handles_an_unpriced_model_without_crashing(caplog):
    usage = SimpleNamespace(input_tokens=100, output_tokens=50)
    with caplog.at_level(logging.INFO, logger="app.cost"):
        log_usage("test_call", "some-future-model", usage, time.monotonic())

    message = caplog.records[0].getMessage()
    assert "cost_usd=n/a" in message
