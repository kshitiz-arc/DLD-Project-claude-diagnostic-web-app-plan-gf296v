"""Tests for the proper scoring rules and diagnostic cell (plan §5.2-5.3)."""

import math

import pytest

from diagnostic_scoring import (
    DEFAULT_BANDS,
    ConfidenceBands,
    DiagnosticCell,
    Response,
    brier_reward,
    classify_cell,
    direction_correct,
    log_score,
)


# --- §5.2 worked values (true statement); false is the mirror image ---------

@pytest.mark.parametrize(
    "response, expected",
    [
        (Response.AT, +0.99),   # confident-correct
        (Response.ST, +0.82),   # hedge-correct
        (Response.SF, +0.02),   # hedge-wrong
        (Response.AF, -0.71),   # confident-wrong
    ],
)
def test_brier_worked_values_true_statement(response, expected):
    assert brier_reward(response, ground_truth=True) == pytest.approx(expected, abs=0.01)


@pytest.mark.parametrize(
    "response, expected",
    [
        (Response.AF, +0.99),
        (Response.SF, +0.82),
        (Response.ST, +0.02),
        (Response.AT, -0.71),
    ],
)
def test_brier_is_mirror_for_false_statement(response, expected):
    assert brier_reward(response, ground_truth=False) == pytest.approx(expected, abs=0.01)


def test_brier_bounded_in_unit_interval():
    for r in Response:
        for y in (True, False):
            assert -1.0 <= brier_reward(r, y) <= 1.0


# --- strict propriety: honest reporting maximises expected score ------------

def test_brier_is_strictly_proper():
    """For any true belief band, reporting that band beats every other report.

    We sweep a student's internal true-probability ``q`` that the statement is
    true. Expected Brier reward under honest reporting must be maximal at the
    report whose p_hat is closest to q.
    """
    bands = DEFAULT_BANDS
    reports = list(Response)
    for q in [i / 20 for i in range(1, 20)]:
        # expected reward of each report given true belief q
        exp = {
            r: q * brier_reward(r, True, bands) + (1 - q) * brier_reward(r, False, bands)
            for r in reports
        }
        best_report = max(exp, key=exp.get)
        # the report closest in p_hat to q should be (one of) the best
        closest = min(reports, key=lambda r: abs(bands.p_hat(r) - q))
        assert exp[best_report] == pytest.approx(exp[closest], abs=1e-9)


def test_log_score_is_finite_and_proper_ordering():
    # p3 < 1 keeps the log score finite for the worst case.
    worst = log_score(Response.AF, ground_truth=True)
    assert math.isfinite(worst)
    # confident-correct beats hedge-correct beats confident-wrong
    assert (
        log_score(Response.AT, True)
        > log_score(Response.ST, True)
        > log_score(Response.AF, True)
    )


# --- §5.3 diagnostic cell ---------------------------------------------------

@pytest.mark.parametrize(
    "response, ground_truth, expected",
    [
        (Response.AT, True, DiagnosticCell.SECURE),
        (Response.ST, True, DiagnosticCell.FRAGILE),
        (Response.AF, True, DiagnosticCell.MISCONCEPTION),
        (Response.SF, True, DiagnosticCell.GAP),
        # mirror for a false statement
        (Response.AF, False, DiagnosticCell.SECURE),
        (Response.SF, False, DiagnosticCell.FRAGILE),
        (Response.AT, False, DiagnosticCell.MISCONCEPTION),
        (Response.ST, False, DiagnosticCell.GAP),
    ],
)
def test_classify_cell(response, ground_truth, expected):
    assert classify_cell(response, ground_truth) is expected


def test_direction_correct_matches_side():
    assert direction_correct(Response.AT, True)
    assert direction_correct(Response.ST, True)
    assert not direction_correct(Response.SF, True)
    assert direction_correct(Response.AF, False)


# --- tunable bands ----------------------------------------------------------

def test_bands_validation():
    with pytest.raises(ValueError):
        ConfidenceBands(p2=0.9, p3=0.7)  # p2 > p3
    with pytest.raises(ValueError):
        ConfidenceBands(p2=0.4, p3=0.9)  # p2 <= 0.5


def test_tighter_confident_band_increases_penalty():
    aggressive = ConfidenceBands(p2=0.70, p3=0.99)
    assert brier_reward(Response.AF, True, aggressive) < brier_reward(Response.AF, True, DEFAULT_BANDS)
