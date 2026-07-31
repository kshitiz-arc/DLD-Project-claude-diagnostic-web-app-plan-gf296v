"""Diagnostic scoring engine -- the analytical core (plan §5, §6, §8, §11).

Pure-Python, dependency-free reference implementation of the measurement model
for the Class 7 mathematics pre-requisite diagnostic. Two scores from one
response, never conflated (plan §1.1):

  * ``brier_reward`` -- internal signed diagnostic score, drives adaptivity
    and analytics; may be negative; never shown to students.
  * ``xp_item``      -- visible, floored XP currency for the game layer.
"""

from __future__ import annotations

from .aggregation import ConceptState, aggregate
from .cdm import CdmFit, QMatrix, fit_cdm, response_matrix
from .encoding import (
    DEFAULT_BANDS,
    DEFAULT_P2,
    DEFAULT_P3,
    ConfidenceBands,
    Response,
)
from .engine import ScoredResponse, score_response
from .gamification import level_for_xp, level_progress, xp_for_level, xp_item
from .mastery import BetaBernoulli
from .scoring import (
    DiagnosticCell,
    brier_reward,
    classify_cell,
    confidence_strength,
    direction_correct,
    log_score,
)
from .twin_delta import (
    DiDEstimate,
    GapEstimate,
    TwinDelta,
    TwinObservation,
    cohort_gap,
    difference_in_differences,
    from_response_rows,
    gap_by_concept,
    gap_by_student,
    pair_twins,
)
from .validity import (
    DEFAULT_T_MIN_MS,
    SpeedAccuracyProfile,
    rt_valid,
    speed_accuracy,
)

__version__ = "0.1.0"

__all__ = [
    "ConfidenceBands",
    "Response",
    "DEFAULT_BANDS",
    "DEFAULT_P2",
    "DEFAULT_P3",
    "brier_reward",
    "log_score",
    "DiagnosticCell",
    "classify_cell",
    "direction_correct",
    "confidence_strength",
    "rt_valid",
    "speed_accuracy",
    "SpeedAccuracyProfile",
    "DEFAULT_T_MIN_MS",
    "BetaBernoulli",
    "xp_item",
    "level_for_xp",
    "level_progress",
    "xp_for_level",
    "score_response",
    "ScoredResponse",
    "ConceptState",
    "aggregate",
    # research layer (plan §12 twin-Delta, §6 Phase 2/3 cognitive diagnosis)
    "TwinObservation",
    "TwinDelta",
    "GapEstimate",
    "DiDEstimate",
    "pair_twins",
    "cohort_gap",
    "gap_by_concept",
    "gap_by_student",
    "difference_in_differences",
    "from_response_rows",
    "QMatrix",
    "CdmFit",
    "fit_cdm",
    "response_matrix",
    "__version__",
]
