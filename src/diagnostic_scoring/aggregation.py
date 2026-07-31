"""Per concept x student aggregation (plan §5.5, §11 ``concept_state``).

Folds a stream of scored responses into the derived state a teacher dashboard
and the adaptive engine read: Bayesian mastery, calibrated proficiency,
calibration bias, misconception density, and fluency. Only RT-valid responses
feed the diagnostic estimates; invalid ones are counted for data-quality
reporting but excluded from measurement.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List

from .engine import ScoredResponse
from .mastery import BetaBernoulli
from .scoring import DiagnosticCell


@dataclass
class ConceptState:
    """Running per concept x student diagnostic summary."""

    mastery: BetaBernoulli = field(default_factory=BetaBernoulli)
    _valid_n: int = 0
    _invalid_n: int = 0
    _brier_sum: float = 0.0
    _confidence_sum: float = 0.0
    _correct_sum: float = 0.0
    _misconception_n: int = 0
    _rt_sum: float = 0.0

    def update(self, scored: ScoredResponse) -> "ConceptState":
        """Fold one scored response into the summary."""
        if not scored.rt_valid:
            self._invalid_n += 1
            return self
        self._valid_n += 1
        self.mastery.update(scored.direction_correct)
        self._brier_sum += scored.brier_reward
        self._confidence_sum += scored.confidence_strength
        self._correct_sum += 1.0 if scored.direction_correct else 0.0
        self._rt_sum += scored.response_time_ms
        if scored.diagnostic_cell is DiagnosticCell.MISCONCEPTION:
            self._misconception_n += 1
        return self

    # --- reported metrics (plan §11) -------------------------------------

    @property
    def mastery_mean(self) -> float:
        return self.mastery.mean

    @property
    def mastery_variance(self) -> float:
        return self.mastery.variance

    @property
    def calibrated_proficiency(self) -> float:
        """Mean signed Brier reward over valid responses (``s_bar``)."""
        return self._brier_sum / self._valid_n if self._valid_n else 0.0

    @property
    def calibration_bias(self) -> float:
        """Mean(confidence) - mean(correctness); >0 == overconfident."""
        if not self._valid_n:
            return 0.0
        return (self._confidence_sum - self._correct_sum) / self._valid_n

    @property
    def misconception_density(self) -> float:
        """Fraction of valid responses in the Misconception cell."""
        return self._misconception_n / self._valid_n if self._valid_n else 0.0

    @property
    def mean_rt_ms(self) -> float:
        return self._rt_sum / self._valid_n if self._valid_n else 0.0

    @property
    def valid_n(self) -> int:
        return self._valid_n

    @property
    def invalid_rt_share(self) -> float:
        """Data-quality signal: share of responses failing the RT gate."""
        total = self._valid_n + self._invalid_n
        return self._invalid_n / total if total else 0.0


def aggregate(responses: List[ScoredResponse]) -> ConceptState:
    """Convenience: fold a list of scored responses into a ``ConceptState``."""
    state = ConceptState()
    for r in responses:
        state.update(r)
    return state
