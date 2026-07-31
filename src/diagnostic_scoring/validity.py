"""Response-time validity gate (plan §5.4).

Response time is measured client-side (``performance.now()`` between item
render and submit) so network latency never contaminates a cognitive
measurement; the server timestamp is a cross-check only. A per-item minimum
reading time acts as a validity floor: below it, the response is flagged
non-engaged and excluded/down-weighted from diagnostic estimates. This gate
is what protects construct validity against the gamification layer.
"""

from __future__ import annotations

from enum import Enum

# A conservative floor for the fastest plausible genuine engagement, used
# when an item carries no bespoke reading-time estimate. [assumption -- tunable]
DEFAULT_T_MIN_MS = 800


def rt_valid(response_time_ms: float, t_min_ms: float = DEFAULT_T_MIN_MS) -> bool:
    """Whether a response time clears the engagement floor."""
    return response_time_ms >= t_min_ms


class SpeedAccuracyProfile(str, Enum):
    """RT x correctness cross-tab (plan §5.4)."""

    AUTOMATICITY = "Automaticity"      # fast + correct
    IMPULSIVE = "Impulsive"            # fast + wrong (hardened misconception if confident)
    EFFORTFUL_CORRECT = "EffortfulCorrect"  # slow + correct
    STRUGGLING = "Struggling"          # slow + wrong


def speed_accuracy(is_correct: bool, is_fast: bool) -> SpeedAccuracyProfile:
    """Classify the speed/accuracy quadrant for a response."""
    if is_correct:
        return SpeedAccuracyProfile.AUTOMATICITY if is_fast else SpeedAccuracyProfile.EFFORTFUL_CORRECT
    return SpeedAccuracyProfile.IMPULSIVE if is_fast else SpeedAccuracyProfile.STRUGGLING
