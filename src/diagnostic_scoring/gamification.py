"""Visible XP currency (plan §1.1, §8).

The internal signed diagnostic score (``brier_reward``) drives adaptivity and
analytics and may go negative. It is *never* shown to children. The visible
currency is a floored, growth-oriented XP derived from the same response but
kept strictly separate, so gaming the game cannot corrupt the diagnostic.
"""

from __future__ import annotations

import math

# XP scale constant -- cosmetic only. [assumption -- tunable]
DEFAULT_K = 100


def xp_item(brier_reward: float, difficulty: float, k: int = DEFAULT_K) -> int:
    """Cosmetic per-item XP, floored at 0 (plan §8 XP transform).

        XP = floor(K * (s + 1) / 2 * difficulty)

    ``(s + 1) / 2`` maps the signed reward from ``[-1, 1]`` to ``[0, 1]``.
    """
    normalised = (brier_reward + 1.0) / 2.0
    return max(0, math.floor(k * normalised * difficulty))


# --- Town-Hall progression (plan §8, the CoC layer) -------------------------
# Each concept is a "building" that levels up with genuine mastery gains and
# effort, and *only ever rises*. Monotonicity is the point: a weaker student
# must still see progress, otherwise honest hedging becomes a losing strategy
# and the confidence signal -- the thing being measured -- goes bad.

LEVEL_BASE = 150   # XP from level 1 to 2 [assumption -- tunable]
LEVEL_GROWTH = 25  # extra XP added to each subsequent band


def xp_for_level(level: int) -> int:
    """Cumulative XP required to *reach* ``level`` (level 1 == 0 XP)."""
    if level <= 1:
        return 0
    n = level - 1
    return LEVEL_BASE * n + LEVEL_GROWTH * n * (n - 1) // 2


def level_for_xp(xp: float) -> int:
    """Current level for a cumulative XP total. Monotone non-decreasing."""
    xp = max(0.0, xp)
    level = 1
    while xp >= xp_for_level(level + 1):
        level += 1
        if level > 999:  # pragma: no cover - guard against a runaway total
            break
    return level


def level_progress(xp: float) -> tuple:
    """``(level, xp_into_band, xp_needed_for_band)`` for a progress bar."""
    level = level_for_xp(xp)
    floor_xp = xp_for_level(level)
    span = xp_for_level(level + 1) - floor_xp
    return level, int(max(0.0, xp) - floor_xp), span
