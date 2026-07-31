"""Beta-Bernoulli mastery tracking (plan §5.5, §6).

Per student x concept we hold a Beta posterior over the probability of a
correct *direction*. Each valid response updates it by one Bernoulli trial.
Posterior mean is the mastery estimate; posterior variance is the current
uncertainty that the adaptive engine (plan §6) drives down by sampling.
"""

from __future__ import annotations

from dataclasses import dataclass

# Weak uniform prior Beta(1, 1). [assumption -- tunable]
DEFAULT_ALPHA = 1.0
DEFAULT_BETA = 1.0


@dataclass
class BetaBernoulli:
    """A Beta(alpha, beta) posterior updated by direction-correct outcomes."""

    alpha: float = DEFAULT_ALPHA
    beta: float = DEFAULT_BETA

    def update(self, correct: bool, weight: float = 1.0) -> "BetaBernoulli":
        """Fold in one (optionally down-weighted) Bernoulli observation."""
        if weight < 0:
            raise ValueError("weight must be non-negative")
        if correct:
            self.alpha += weight
        else:
            self.beta += weight
        return self

    @property
    def mean(self) -> float:
        """Posterior mean == mastery point estimate."""
        return self.alpha / (self.alpha + self.beta)

    @property
    def variance(self) -> float:
        """Posterior variance == current uncertainty (selection signal)."""
        a, b = self.alpha, self.beta
        n = a + b
        return (a * b) / (n * n * (n + 1.0))

    @property
    def n_effective(self) -> float:
        """Effective observation count accumulated beyond the prior."""
        return (self.alpha - DEFAULT_ALPHA) + (self.beta - DEFAULT_BETA)
