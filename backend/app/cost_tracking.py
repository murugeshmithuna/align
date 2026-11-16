"""Per-call cost/latency logging for every real Claude API call in this
app - item 15's actual ask: "log input and output tokens and latency per
turn, then show average cost per conversation and p95 latency."

Deliberately a structured log line, not a database table or a dashboard -
this app already has no analytics infrastructure, and one grep-able line
per call (`model=... input_tokens=... output_tokens=... latency_ms=...`)
is enough to compute real aggregates from Render's own log retention
without adding a new table/migration just to store this. See
scripts/report_cost.py for the aggregation step once real log lines exist.
"""

import logging
import time

logger = logging.getLogger("app.cost")

# Per-million-token pricing, current as of this app's own Claude model
# choices (see app/config.py) - used only to turn real token counts into a
# real dollar estimate in the log line, not charged/billed by this code.
_PRICING_PER_MILLION = {
    "claude-opus-4-8": {"input": 15.00, "output": 75.00},
    "claude-haiku-4-5": {"input": 1.00, "output": 5.00},
}


def _estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> float | None:
    rates = _PRICING_PER_MILLION.get(model)
    if not rates:
        return None
    return (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1_000_000


def log_usage(label: str, model: str, usage, started_at: float) -> None:
    """Call right after a successful Claude response - `usage` is the SDK
    response's own `.usage` object (has `.input_tokens`/`.output_tokens`)."""
    latency_ms = round((time.monotonic() - started_at) * 1000)
    input_tokens = getattr(usage, "input_tokens", None)
    output_tokens = getattr(usage, "output_tokens", None)
    cost = (
        _estimate_cost_usd(model, input_tokens, output_tokens)
        if input_tokens is not None and output_tokens is not None
        else None
    )
    cost_str = f"{cost:.5f}" if cost is not None else "n/a"
    logger.info(
        "claude_call label=%s model=%s input_tokens=%s output_tokens=%s latency_ms=%d cost_usd=%s",
        label,
        model,
        input_tokens,
        output_tokens,
        latency_ms,
        cost_str,
    )
