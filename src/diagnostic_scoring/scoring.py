"""Proper scoring rules and the 2x2 diagnostic cell (plan §5.2-5.3).

The core measurement principle: use a *strictly proper* scoring rule so a
student maximises expected score only by reporting their true belief. Ad-hoc
linear point schemes are not proper and collapse the scale toward constant
hedging. We default to an affine-rescaled Brier score (bounded, child-safe)
and keep the logarithmic score available for research-grade calibration work.
"""

from __future__ import annotations

import math
from enum import Enum

from .encoding import ConfidenceBands, DEFAULT_BANDS, Response


def brier_reward(response: Response, ground_truth: bool, bands: ConfidenceBands = DEFAULT_BANDS) -> float:
    """Signed Brier reward on a symmetric ``[-1, +1]`` scale (plan §5.2).

        s = 1 - 2 * (p_hat - y)**2

    +1 == perfectly calibrated and correct; -1 == confidently, maximally wrong.
    With the default bands this yields AT/ST/SF/AF -> +0.99/+0.82/+0.02/-0.71
    for a true statement (mirror image for a false one).
    """
    y = 1.0 if ground_truth else 0.0
    p_hat = bands.p_hat(response)
    return 1.0 - 2.0 * (p_hat - y) ** 2


def log_score(response: Response, ground_truth: bool, bands: ConfidenceBands = DEFAULT_BANDS) -> float:
    """Logarithmic proper score (plan §5.2, research-grade alternative).

        L = y * ln(p_hat) + (1 - y) * ln(1 - p_hat)

    Returned as a reward (higher is better; 0 is a perfect report). Punishes
    confident-wrong aggressively; finite only because ``p3 < 1``.
    """
    y = 1.0 if ground_truth else 0.0
    p_hat = bands.p_hat(response)
    return y * math.log(p_hat) + (1.0 - y) * math.log(1.0 - p_hat)


class DiagnosticCell(str, Enum):
    """The interpretive 2x2 payload (plan §5.3)."""

    SECURE = "Secure"              # correct + confident  -> mastery
    FRAGILE = "Fragile"            # correct + hedged     -> correct but unsure
    MISCONCEPTION = "Misconception"  # wrong + confident  -> top adaptivity priority
    GAP = "Gap"                    # wrong + hedged       -> likely absence of knowledge


def direction_correct(response: Response, ground_truth: bool) -> bool:
    """Whether the chosen side matches the ground truth (axis ``c``)."""
    return response.is_true_side == bool(ground_truth)


def classify_cell(response: Response, ground_truth: bool) -> DiagnosticCell:
    """Classify a response into the 2x2 diagnostic cell (plan §5.3)."""
    correct = direction_correct(response, ground_truth)
    confident = response.is_confident
    if correct:
        return DiagnosticCell.SECURE if confident else DiagnosticCell.FRAGILE
    return DiagnosticCell.MISCONCEPTION if confident else DiagnosticCell.GAP


def confidence_strength(response: Response, bands: ConfidenceBands = DEFAULT_BANDS) -> float:
    """Subjective probability the student assigns to *their chosen side*.

    ``max(p_hat, 1 - p_hat)`` in ``[0.5, 1)`` -- used for calibration analysis.
    """
    p_hat = bands.p_hat(response)
    return max(p_hat, 1.0 - p_hat)
