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
        (Response.AT, +0.995),  # sure-correct
        (Response.MT, +0.920),  # confident-correct
        (Response.ST, +0.711),  # hedge-correct
        (Response.SF, +0.231),  # hedge-wrong
        (Response.MF, -0.280),  # confident-wrong
        (Response.AF, -0.805),  # sure-wrong
    ],
)
def test_brier_worked_values_true_statement(response, expected):
    assert brier_reward(response, ground_truth=True) == pytest.approx(expected, abs=0.01)


@pytest.mark.parametrize(
    "response, expected",
    [
        (Response.AF, +0.995),
        (Response.MF, +0.920),
        (Response.SF, +0.711),
        (Response.ST, +0.231),
        (Response.MT, -0.280),
        (Response.AT, -0.805),
    ],
)
def test_brier_is_mirror_for_false_statement(response, expected):
    assert brier_reward(response, ground_truth=False) == pytest.approx(expected, abs=0.01)


def test_scale_is_monotone_and_has_no_midpoint():
    """p_hat strictly decreases AT -> AF, and no band sits on 0.5.

    A 50/50 option would be a free dodge and would carry no direction, so it
    could never populate the confident-wrong cell (§5.3).
    """
    order = [Response.AT, Response.MT, Response.ST, Response.SF, Response.MF, Response.AF]
    phats = [DEFAULT_BANDS.p_hat(r) for r in order]
    assert phats == sorted(phats, reverse=True)
    assert all(abs(p - 0.5) > 1e-9 for p in phats)


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
        (Response.MT, True, DiagnosticCell.SECURE),
        (Response.ST, True, DiagnosticCell.FRAGILE),
        (Response.AF, True, DiagnosticCell.MISCONCEPTION),
        (Response.MF, True, DiagnosticCell.MISCONCEPTION),
        (Response.SF, True, DiagnosticCell.GAP),
        # mirror for a false statement
        (Response.AF, False, DiagnosticCell.SECURE),
        (Response.MF, False, DiagnosticCell.SECURE),
        (Response.SF, False, DiagnosticCell.FRAGILE),
        (Response.AT, False, DiagnosticCell.MISCONCEPTION),
        (Response.MT, False, DiagnosticCell.MISCONCEPTION),
        (Response.ST, False, DiagnosticCell.GAP),
    ],
)
def test_classify_cell(response, ground_truth, expected):
    assert classify_cell(response, ground_truth) is expected


def test_only_the_inner_band_is_a_hedge():
    """M* must classify as confident, or the instrument loses its product.

    "Mostly False" on a true statement is p_hat = 0.20 — that child is not
    unsure, they hold a wrong belief and are fairly sure of it. Filing it as a
    Gap would hide exactly the misconception the sitting exists to surface.
    """
    hedged = {r for r in Response if not r.is_confident}
    assert hedged == {Response.ST, Response.SF}


def test_direction_correct_matches_side():
    assert direction_correct(Response.AT, True)
    assert direction_correct(Response.MT, True)
    assert direction_correct(Response.ST, True)
    assert not direction_correct(Response.SF, True)
    assert not direction_correct(Response.MF, True)
    assert direction_correct(Response.AF, False)


# --- tunable bands ----------------------------------------------------------

def test_bands_validation():
    with pytest.raises(ValueError):
        ConfidenceBands(p2=0.9, p3=0.7)          # p2 > p3
    with pytest.raises(ValueError):
        ConfidenceBands(p2=0.4, p3=0.9)          # p2 <= 0.5
    with pytest.raises(ValueError):
        ConfidenceBands(p2=0.6, p3=0.9, p4=0.8)  # p4 < p3
    with pytest.raises(ValueError):
        ConfidenceBands(p2=0.6, p3=0.8, p4=1.0)  # p4 >= 1 makes log_score infinite


def test_tighter_confident_band_increases_penalty():
    aggressive = ConfidenceBands(p2=0.70, p3=0.85, p4=0.99)
    assert brier_reward(Response.AF, True, aggressive) < brier_reward(Response.AF, True, DEFAULT_BANDS)
