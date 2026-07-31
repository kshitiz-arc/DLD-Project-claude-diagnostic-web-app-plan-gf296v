"""Signed-certainty response encoding (plan §5.1).

Each diagnostic item is a declarative statement with a boolean ``ground_truth``
(``True`` == the statement is genuinely true). The student answers on a
four-point signed-certainty scale:

    AT  Always True     -> confident the statement is TRUE
    ST  Somewhat True   -> hedged toward TRUE
    SF  Somewhat False  -> hedged toward FALSE
    AF  Always False     -> confident the statement is FALSE

We interpret each choice as a *subjective probability that the statement is
true* (``p_hat``), anchored by two tunable band midpoints ``p2`` (hedge band)
and ``p3`` (confident band) with ``0.5 < p2 < p3 < 1``:

    AT -> p3            ST -> p2
    SF -> 1 - p2       AF -> 1 - p3

``p3`` is deliberately held below 1.0 so the logarithmic score stays finite
(see ``scoring.log_score``).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class Response(str, Enum):
    """The four signed-certainty report values."""

    AT = "AT"  # Always True
    ST = "ST"  # Somewhat True
    SF = "SF"  # Somewhat False
    AF = "AF"  # Always False

    @property
    def is_true_side(self) -> bool:
        """Whether the response points at the statement being TRUE."""
        return self in (Response.AT, Response.ST)

    @property
    def is_confident(self) -> bool:
        """Whether the response is a confident (non-hedged) report."""
        return self in (Response.AT, Response.AF)


# Default band anchors [assumption -- tunable] (plan §5.1).
DEFAULT_P2 = 0.70
DEFAULT_P3 = 0.925


@dataclass(frozen=True)
class ConfidenceBands:
    """Tunable ``(p2, p3)`` anchors mapping a report value to ``p_hat``."""

    p2: float = DEFAULT_P2
    p3: float = DEFAULT_P3

    def __post_init__(self) -> None:
        if not (0.5 < self.p2 < self.p3 < 1.0):
            raise ValueError(
                f"require 0.5 < p2 < p3 < 1.0, got p2={self.p2}, p3={self.p3}"
            )

    def p_hat(self, response: Response) -> float:
        """Subjective probability that the statement is TRUE for ``response``."""
        if response is Response.AT:
            return self.p3
        if response is Response.ST:
            return self.p2
        if response is Response.SF:
            return 1.0 - self.p2
        if response is Response.AF:
            return 1.0 - self.p3
        raise ValueError(f"unknown response: {response!r}")


DEFAULT_BANDS = ConfidenceBands()
