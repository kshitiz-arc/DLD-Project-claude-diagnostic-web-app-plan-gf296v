"""Signed-certainty response encoding (plan §5.1).

Each diagnostic item is a declarative statement with a boolean ``ground_truth``
(``True`` == the statement is genuinely true). The student answers on a
*six-point* signed-certainty scale — three confidence bands either side of the
midpoint, with no midpoint itself:

    AT  Always True    -> sure the statement is TRUE
    MT  Mostly True    -> leaning TRUE, fairly sure
    ST  Maybe True     -> hedged toward TRUE
    SF  Maybe False    -> hedged toward FALSE
    MF  Mostly False   -> leaning FALSE, fairly sure
    AF  Always False   -> sure the statement is FALSE

There is deliberately **no 50/50 option**. A midpoint is a free dodge: under
pressure children cluster on it, and a response that carries no direction
cannot populate the confident-wrong cell, which is the whole product (§5.3).

We interpret each choice as a *subjective probability that the statement is
true* (``p_hat``), anchored by three tunable band midpoints with
``0.5 < p2 < p3 < p4 < 1``:

    AT -> p4        MT -> p3        ST -> p2
    SF -> 1 - p2    MF -> 1 - p3    AF -> 1 - p4

``p4`` is deliberately held below 1.0 so the logarithmic score stays finite
(see ``scoring.log_score``).

Confidence for the 2x2 cell (§5.3) is the *outer two* bands per side, not just
the outermost. Filing a child who answered "Mostly False" on a true statement
as a mere Gap would throw away exactly the hardened wrong belief the instrument
exists to catch — at p_hat = 0.20 they are not unsure, they are wrong and fairly
sure of it.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Response(str, Enum):
    """The six signed-certainty report values."""

    AT = "AT"  # Always True
    MT = "MT"  # Mostly True
    ST = "ST"  # Maybe True  (hedged)
    SF = "SF"  # Maybe False (hedged)
    MF = "MF"  # Mostly False
    AF = "AF"  # Always False

    @property
    def is_true_side(self) -> bool:
        """Whether the response points at the statement being TRUE."""
        return self in (Response.AT, Response.MT, Response.ST)

    @property
    def is_confident(self) -> bool:
        """Whether the response is a confident (non-hedged) report.

        The outer two bands per side. Only the ``S*`` pair is treated as a
        genuine hedge; see the module docstring for why ``M*`` counts as
        confident.
        """
        return self in (Response.AT, Response.MT, Response.MF, Response.AF)

    @property
    def band(self) -> int:
        """Distance from the midpoint: 1 (hedged) .. 3 (sure)."""
        if self in (Response.ST, Response.SF):
            return 1
        if self in (Response.MT, Response.MF):
            return 2
        return 3


# Default band anchors [assumption -- tunable] (plan §5.1).
DEFAULT_P2 = 0.62
DEFAULT_P3 = 0.80
DEFAULT_P4 = 0.95


@dataclass(frozen=True)
class ConfidenceBands:
    """Tunable ``(p2, p3, p4)`` anchors mapping a report value to ``p_hat``."""

    p2: float = DEFAULT_P2
    p3: float = DEFAULT_P3
    p4: float = DEFAULT_P4

    def __post_init__(self) -> None:
        if not (0.5 < self.p2 < self.p3 < self.p4 < 1.0):
            raise ValueError(
                "require 0.5 < p2 < p3 < p4 < 1.0, got "
                f"p2={self.p2}, p3={self.p3}, p4={self.p4}"
            )

    def p_hat(self, response: Response) -> float:
        """Subjective probability that the statement is TRUE for ``response``."""
        if response is Response.AT:
            return self.p4
        if response is Response.MT:
            return self.p3
        if response is Response.ST:
            return self.p2
        if response is Response.SF:
            return 1.0 - self.p2
        if response is Response.MF:
            return 1.0 - self.p3
        if response is Response.AF:
            return 1.0 - self.p4
        raise ValueError(f"unknown response: {response!r}")


DEFAULT_BANDS = ConfidenceBands()
