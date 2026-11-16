"""Pure-computation tests for app/agent/fatigue.py - no API key, no database.

Covers the Banister fitness/fatigue/form model, the injury-risk read, the
limb-asymmetry checker, and the calorie/load aggregation helpers - every
function in this module is deterministic math, so these run instantly and
need no mocking.
"""

from datetime import date, datetime, timedelta

from app.agent.fatigue import (
    ASYMMETRY_FLAG_THRESHOLD_PCT,
    assess_injury_risk,
    calories_by_day,
    check_asymmetry,
    compute_banister_series,
    session_load,
)
from app.models import _today


def test_session_load_with_rpe():
    # volume (sets*reps*weight) * (rpe/10): 3*8*100 * 0.8
    assert session_load(sets=3, reps=8, weight=100, rpe=8) == 1920.0


def test_session_load_without_rpe_falls_back_to_rpe_7():
    # No RPE logged -> intensity factor is 7/10 = 0.7, not a zero/None load.
    load = session_load(sets=3, reps=8, weight=100, rpe=None)
    assert load == 3 * 8 * 100 * 0.7


def test_banister_series_empty_without_workouts():
    assert compute_banister_series({}) == []


def test_banister_fatigue_fades_faster_than_fitness_after_one_hard_day():
    # compute_banister_series always runs through the real _today(), so test
    # dates must be anchored relative to it - a fixed past date would let
    # months of real-world decay run past the scenario before the series
    # ever reaches the assertion.
    today = _today()
    yesterday = today - timedelta(days=1)

    series = compute_banister_series({yesterday: 500.0})
    assert len(series) == 2  # the load day, then today
    assert series[0]["fitness"] == series[0]["fatigue"] == 500.0

    # One rest day later: fatigue (tau=7) decays faster than fitness
    # (tau=42), so fatigue must now be strictly below fitness.
    assert series[1]["fatigue"] < series[1]["fitness"]


def test_banister_form_equals_fitness_minus_2x_fatigue():
    today = _today()
    series = compute_banister_series({today - timedelta(days=1): 300.0, today: 150.0})
    for day in series:
        # Compared with a small tolerance since day["fitness"]/day["fatigue"]
        # are themselves rounded to 1 decimal for display - recomputing form
        # from those already-rounded values can differ from the stored,
        # unrounded-internal form by a trailing +/-0.1.
        expected = 1.0 * day["fitness"] - 2.0 * day["fatigue"]
        assert abs(day["form"] - expected) <= 0.1 + 1e-9


def test_injury_risk_flags_a_sudden_load_spike_as_high():
    # A two-week steady baseline (fitness ramps up, fatigue tracks it
    # closely) followed by one huge spike day, ending exactly on _today() so
    # no further decay washes the spike out before assess_injury_risk reads
    # the latest entry.
    today = _today()
    loads = {today - timedelta(days=d): 100.0 for d in range(1, 15)}
    loads[today] = 3000.0
    series = compute_banister_series(loads)
    result = assess_injury_risk(series)
    assert result["risk_level"] == "high"


def test_injury_risk_reads_low_for_steady_load():
    today = _today()
    loads = {today - timedelta(days=d): 200.0 for d in range(21)}
    series = compute_banister_series(loads)
    result = assess_injury_risk(series)
    assert result["risk_level"] == "low"


def test_injury_risk_unknown_with_no_history():
    result = assess_injury_risk([])
    assert result["risk_level"] == "unknown"
    assert result["form_ratio"] is None


def test_asymmetry_flags_a_12_percent_difference():
    result = check_asymmetry([100.0], [88.0], metric_name="squat depth")
    assert result["flagged"] is True


def test_asymmetry_does_not_flag_an_8_percent_difference():
    result = check_asymmetry([100.0], [92.0], metric_name="squat depth")
    assert result["flagged"] is False


def test_asymmetry_at_exactly_the_threshold_is_flagged():
    # flagged = diff_pct >= ASYMMETRY_FLAG_THRESHOLD_PCT, so the boundary
    # value itself counts as flagged (>=, not strictly >).
    bigger = 100.0
    smaller = bigger * (1 - ASYMMETRY_FLAG_THRESHOLD_PCT / 100)
    result = check_asymmetry([bigger], [smaller], metric_name="peak load")
    assert result["diff_pct"] == ASYMMETRY_FLAG_THRESHOLD_PCT
    assert result["flagged"] is True


def test_calories_by_day_sums_same_date_logs():
    logs = [
        {"performed_at": datetime(2026, 1, 1, 9, 0), "sets": 3, "reps": 8, "weight": 100, "rpe": 7},
        {"performed_at": datetime(2026, 1, 1, 18, 0), "sets": 2, "reps": 10, "weight": 50, "rpe": 6},
        {"performed_at": date(2026, 1, 2), "sets": 3, "reps": 8, "weight": 100, "rpe": 7},
    ]
    totals = calories_by_day(logs, weight_kg_user=80.0)
    assert set(totals) == {date(2026, 1, 1), date(2026, 1, 2)}
    assert totals[date(2026, 1, 1)] > totals[date(2026, 1, 2)]


def test_calories_by_day_empty_without_user_weight():
    logs = [{"performed_at": date(2026, 1, 1), "sets": 3, "reps": 8, "weight": 100, "rpe": 7}]
    assert calories_by_day(logs, weight_kg_user=None) == {}
