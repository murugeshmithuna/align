"""Banister impulse-response (fitness-fatigue) model and limb-asymmetry checker.

Both are pure numerical calculations - no LLM calls - consistent with how
progress charts (`GET /logs/user/{id}/progress`) are plain aggregation rather
than agent-routed. Kept in `app/agent/` alongside `tools.py`/`resolution.py` since
conceptually it's still part of the coaching-intelligence layer, just the
purely-computational corner of it.
"""

from __future__ import annotations

import math
from collections import defaultdict
from datetime import date, datetime, timedelta

from app.models import _today

# Standard sports-science defaults for the two-component Banister model:
# fitness accumulates and decays slowly (~42 days), fatigue spikes and clears
# quickly (~7 days). Gains weight how much each contributes to net "form".
FITNESS_TAU_DAYS = 42.0
FATIGUE_TAU_DAYS = 7.0
FITNESS_GAIN = 1.0
FATIGUE_GAIN = 2.0

# Side-to-side difference threshold commonly cited in inter-limb strength/
# asymmetry testing literature as worth flagging for injury-risk follow-up.
ASYMMETRY_FLAG_THRESHOLD_PCT = 10.0


def session_load(sets: int | None, reps: int | None, weight: float | None, rpe: float | None) -> float:
    """Single-log training load proxy, session-RPE style: volume * (RPE / 10).
    Falls back to an assumed moderate RPE of 7 when not logged, so every set
    still contributes some load instead of silently vanishing."""
    volume = (sets or 0) * (reps or 0) * (weight or 0)
    intensity_factor = (rpe if rpe is not None else 7.0) / 10.0
    return volume * intensity_factor


def daily_loads(logs: list[dict]) -> dict[date, float]:
    """logs: [{performed_at, sets, reps, weight, rpe}, ...] -> {date: total_load}."""
    totals: dict[date, float] = defaultdict(float)
    for log in logs:
        performed_at = log["performed_at"]
        day = performed_at.date() if isinstance(performed_at, datetime) else performed_at
        totals[day] += session_load(log.get("sets"), log.get("reps"), log.get("weight"), log.get("rpe"))
    return dict(totals)


def compute_banister_series(
    loads_by_day: dict[date, float],
    fitness_tau: float = FITNESS_TAU_DAYS,
    fatigue_tau: float = FATIGUE_TAU_DAYS,
    fitness_gain: float = FITNESS_GAIN,
    fatigue_gain: float = FATIGUE_GAIN,
) -> list[dict]:
    """Runs the model day-by-day from the first logged day through today,
    including rest days as zero-load entries so the exponential decay is
    actually applied across gaps rather than skipped."""
    if not loads_by_day:
        return []

    start = min(loads_by_day)
    end = max(max(loads_by_day), _today())

    fitness_decay = math.exp(-1.0 / fitness_tau)
    fatigue_decay = math.exp(-1.0 / fatigue_tau)

    fitness = 0.0
    fatigue = 0.0
    series = []

    day = start
    while day <= end:
        load = loads_by_day.get(day, 0.0)
        fitness = fitness * fitness_decay + load
        fatigue = fatigue * fatigue_decay + load
        form = fitness_gain * fitness - fatigue_gain * fatigue
        series.append(
            {
                "date": day,
                "load": round(load, 1),
                "fitness": round(fitness, 1),
                "fatigue": round(fatigue, 1),
                "form": round(form, 1),
            }
        )
        day += timedelta(days=1)

    return series


def assess_injury_risk(series: list[dict]) -> dict:
    """Deterministic read of the most recent form value. Very negative form
    (fatigue running well ahead of fitness) is the classic Banister-model
    overtraining/injury-risk signal. Normalized by the user's own fitness
    level so the thresholds are scale-free regardless of load units."""
    if not series:
        return {"risk_level": "unknown", "message": "Not enough training history yet to model fatigue.", "form_ratio": None}

    latest = series[-1]
    fitness = latest["fitness"]
    form = latest["form"]

    if fitness <= 0:
        return {"risk_level": "unknown", "message": "Not enough training history yet to model fatigue.", "form_ratio": None}

    form_ratio = form / fitness

    if form_ratio < -0.6:
        risk_level = "high"
        message = "Fatigue is running well ahead of fitness - high overtraining/injury risk. Consider a deload."
    elif form_ratio < -0.25:
        risk_level = "moderate"
        message = "Fatigue is elevated relative to fitness - keep an eye on recovery over the next few days."
    else:
        risk_level = "low"
        message = "Fitness and fatigue are in a reasonable balance right now."

    return {"risk_level": risk_level, "message": message, "form_ratio": round(form_ratio, 3)}


def check_asymmetry(left_values: list[float], right_values: list[float], metric_name: str = "measurement") -> dict:
    """Compares average left vs. right side measurements - per-rep knee angle,
    rep tempo, or peak load - and flags a side-to-side imbalance past the
    standard 10% threshold used in inter-limb asymmetry testing.

    Takes raw numeric samples rather than video/pose input: real per-rep
    left/right measurements will come from the MediaPipe pose pipeline once
    that's built, and this checker is written to consume exactly that shape
    of data (a list of numbers per side) without needing to wait on it -
    the math is independent of where the numbers come from.
    """
    if not left_values or not right_values:
        raise ValueError("Need at least one measurement for each side")

    left_avg = sum(left_values) / len(left_values)
    right_avg = sum(right_values) / len(right_values)
    bigger = max(left_avg, right_avg)
    smaller = min(left_avg, right_avg)
    diff_pct = ((bigger - smaller) / bigger * 100) if bigger else 0.0
    stronger_side = "left" if left_avg > right_avg else "right" if right_avg > left_avg else "even"
    flagged = diff_pct >= ASYMMETRY_FLAG_THRESHOLD_PCT

    if flagged:
        message = (
            f"{diff_pct:.1f}% {stronger_side}-side dominance on {metric_name} - above the "
            f"{ASYMMETRY_FLAG_THRESHOLD_PCT:.0f}% threshold typically flagged for injury-risk follow-up."
        )
    else:
        message = f"{diff_pct:.1f}% side-to-side difference on {metric_name} - within normal range."

    return {
        "metric_name": metric_name,
        "left_avg": round(left_avg, 2),
        "right_avg": round(right_avg, 2),
        "diff_pct": round(diff_pct, 1),
        "stronger_side": stronger_side,
        "flagged": flagged,
        "message": message,
    }
