"""Top-level orchestration: one response in, one scored record out (plan §11).

``score_response`` turns a raw student answer into the full per-item metrics
row that the append-only event store (plan §4 ``responses``) persists. It is
pure and dependency-free so it can be unit-tested and called identically from
the FastAPI request handler and from an offline research batch job.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .encoding import ConfidenceBands, DEFAULT_BANDS, Response
from .scoring import (
    DiagnosticCell,
    brier_reward,
    classify_cell,
    confidence_strength,
    direction_correct,
    log_score,
)
from .validity import DEFAULT_T_MIN_MS, rt_valid


@dataclass(frozen=True)
class ScoredResponse:
    """The scored per-item payload (mirrors the ``responses`` table, plan §4)."""

    response_option: Response
    ground_truth: bool
    direction_correct: bool
    confidence_high: bool
    diagnostic_cell: DiagnosticCell
    brier_reward: float
    log_score: float
    confidence_strength: float
    response_time_ms: float
    rt_valid: bool


def score_response(
    response: Response,
    ground_truth: bool,
    response_time_ms: float,
    *,
    bands: ConfidenceBands = DEFAULT_BANDS,
    t_min_ms: float = DEFAULT_T_MIN_MS,
) -> ScoredResponse:
    """Score a single response into a complete diagnostic record."""
    return ScoredResponse(
        response_option=response,
        ground_truth=bool(ground_truth),
        direction_correct=direction_correct(response, ground_truth),
        confidence_high=response.is_confident,
        diagnostic_cell=classify_cell(response, ground_truth),
        brier_reward=brier_reward(response, ground_truth, bands),
        log_score=log_score(response, ground_truth, bands),
        confidence_strength=confidence_strength(response, bands),
        response_time_ms=response_time_ms,
        rt_valid=rt_valid(response_time_ms, t_min_ms),
    )
