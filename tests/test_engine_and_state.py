"""Tests for validity gate, mastery, XP, orchestration, and aggregation."""

import pytest

from diagnostic_scoring import (
    BetaBernoulli,
    ConceptState,
    Response,
    SpeedAccuracyProfile,
    aggregate,
    level_for_xp,
    level_progress,
    rt_valid,
    score_response,
    speed_accuracy,
    xp_for_level,
    xp_item,
)
from diagnostic_scoring.scoring import DiagnosticCell


# --- §5.4 RT validity gate --------------------------------------------------

def test_rt_gate():
    assert not rt_valid(200, t_min_ms=800)
    assert rt_valid(800, t_min_ms=800)
    assert rt_valid(5000, t_min_ms=800)


@pytest.mark.parametrize(
    "correct, fast, expected",
    [
        (True, True, SpeedAccuracyProfile.AUTOMATICITY),
        (False, True, SpeedAccuracyProfile.IMPULSIVE),
        (True, False, SpeedAccuracyProfile.EFFORTFUL_CORRECT),
        (False, False, SpeedAccuracyProfile.STRUGGLING),
    ],
)
def test_speed_accuracy(correct, fast, expected):
    assert speed_accuracy(correct, fast) is expected


# --- Beta-Bernoulli mastery -------------------------------------------------

def test_beta_bernoulli_uniform_prior():
    m = BetaBernoulli()
    assert m.mean == pytest.approx(0.5)
    assert m.variance == pytest.approx(1 / 12)  # Beta(1,1) variance


def test_beta_bernoulli_converges_and_shrinks_variance():
    m = BetaBernoulli()
    v0 = m.variance
    for _ in range(20):
        m.update(correct=True)
    assert m.mean > 0.9
    assert m.variance < v0
    assert m.n_effective == pytest.approx(20)


# --- §8 XP transform --------------------------------------------------------

def test_xp_floored_and_monotone():
    assert xp_item(brier_reward=-1.0, difficulty=1.0) == 0        # floored
    assert xp_item(brier_reward=1.0, difficulty=1.0) == 100       # K * 1 * 1
    assert xp_item(brier_reward=0.0, difficulty=1.0) == 50        # midpoint
    # harder items pay more for the same reward
    assert xp_item(0.5, difficulty=2.0) > xp_item(0.5, difficulty=1.0)


def test_progression_only_ever_rises():
    """The CoC layer is monotone by design (plan §8) — honesty never demotes."""
    assert level_for_xp(0) == 1
    assert level_for_xp(-500) == 1  # XP can't go negative; a stale total can't demote
    last = 0
    for xp in range(0, 5000, 25):
        lvl = level_for_xp(xp)
        assert lvl >= last
        last = lvl


def test_level_thresholds_widen():
    """Each band costs more than the last, so levelling slows but never stops."""
    bands = [xp_for_level(n + 1) - xp_for_level(n) for n in range(1, 6)]
    assert bands == sorted(bands) and bands[0] < bands[-1]
    assert xp_for_level(1) == 0
    assert level_for_xp(xp_for_level(4)) == 4
    assert level_for_xp(xp_for_level(4) - 1) == 3


def test_level_progress_reports_position_in_band():
    level, into, span = level_progress(xp_for_level(3) + 10)
    assert level == 3 and into == 10
    assert span == xp_for_level(4) - xp_for_level(3)


# --- orchestration ----------------------------------------------------------

def test_score_response_full_record():
    scored = score_response(Response.AT, ground_truth=True, response_time_ms=3000)
    assert scored.direction_correct
    assert scored.confidence_high
    assert scored.diagnostic_cell is DiagnosticCell.SECURE
    assert scored.brier_reward == pytest.approx(0.99, abs=0.01)
    assert scored.rt_valid


def test_score_response_flags_invalid_rt():
    scored = score_response(Response.AT, ground_truth=True, response_time_ms=100)
    assert not scored.rt_valid


# --- §5.5 aggregation -------------------------------------------------------

def test_aggregation_excludes_invalid_rt():
    responses = [
        score_response(Response.AT, True, 3000),   # secure, valid
        score_response(Response.AT, True, 100),    # valid RT fails -> excluded
    ]
    state = aggregate(responses)
    assert state.valid_n == 1
    assert state.invalid_rt_share == pytest.approx(0.5)


def test_aggregation_metrics():
    responses = [
        score_response(Response.AT, True, 3000),   # secure
        score_response(Response.AF, True, 3000),   # misconception (confident-wrong)
        score_response(Response.ST, True, 3000),   # fragile
    ]
    state = aggregate(responses)
    assert state.valid_n == 3
    assert state.misconception_density == pytest.approx(1 / 3)
    # two of three correct -> mastery mean pulled above prior 0.5
    assert state.mastery_mean > 0.5
    # confident-wrong drags calibrated proficiency down from the AT ceiling
    assert state.calibrated_proficiency < 0.99


def test_calibration_bias_sign():
    # all confident but half wrong -> overconfident (positive bias)
    responses = [
        score_response(Response.AT, True, 3000),    # confident correct
        score_response(Response.AF, True, 3000),    # confident wrong
    ]
    state = aggregate(responses)
    assert state.calibration_bias > 0
