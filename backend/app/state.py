"""Derived per student x concept state (plan §4 ``concept_state``, §5.5, §11).

The append-only ``responses`` log is the source of truth. This module keeps a
write-through projection of it so the console, the adaptive engine and the
game layer read cheap rows instead of re-folding the whole log — and it can
rebuild that projection from the log at any time, which is what makes the
cache safe to hold.

Running means are updated incrementally (``mean += (x - mean) / n``); the
rebuild path recomputes them exactly, so drift is bounded and correctable.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional, Tuple

from sqlmodel import Session as DbSession
from sqlmodel import select

from diagnostic_scoring import Response as Opt
from diagnostic_scoring import confidence_strength, level_for_xp, xp_item

from .models import ConceptState, Response


def _touch(state: ConceptState) -> ConceptState:
    a, b = state.mastery_alpha, state.mastery_beta
    n = a + b
    state.mastery_mean = a / n
    state.mastery_var = (a * b) / (n * n * (n + 1.0))
    state.level = level_for_xp(state.xp)
    state.updated_at = datetime.now(timezone.utc)
    return state


def get_or_create(db: DbSession, student_id: int, strand: str) -> ConceptState:
    row = db.exec(
        select(ConceptState)
        .where(ConceptState.student_id == student_id)
        .where(ConceptState.strand == strand)
    ).first()
    if row is None:
        row = ConceptState(student_id=student_id, strand=strand)
        db.add(row)
    return row


def apply_response(db: DbSession, response: Response, difficulty: float) -> ConceptState:
    """Fold one persisted response into the student's concept state.

    Invalid-RT responses (plan §5.4) update only the data-quality counter: they
    move neither the mastery posterior nor the XP, so a child who taps through
    can neither corrupt their diagnosis nor farm the game layer.
    """
    state = get_or_create(db, response.student_id, response.strand)
    _fold(state, response, difficulty)
    return state


def rebuild_concept_state(db: DbSession, student_id: Optional[int] = None) -> int:
    """Recompute concept state from the event-store. Returns rows written.

    The projection is disposable by construction — this is the proof. Run it
    after a restore, after a scoring-parameter change, or whenever the cache
    is in doubt.
    """
    from .models import Item  # local import keeps the module import graph flat

    difficulty: Dict[int, float] = {
        i.id: i.difficulty for i in db.exec(select(Item)).all() if i.id is not None
    }
    q = select(Response)
    if student_id is not None:
        q = q.where(Response.student_id == student_id)
    rows = db.exec(q.order_by(Response.id)).all()

    stale = select(ConceptState)
    if student_id is not None:
        stale = stale.where(ConceptState.student_id == student_id)
    for old in db.exec(stale).all():
        db.delete(old)
    db.commit()

    fresh: Dict[Tuple[int, str], ConceptState] = {}
    for r in rows:
        key = (r.student_id, r.strand)
        if key not in fresh:
            fresh[key] = ConceptState(student_id=r.student_id, strand=r.strand)
            db.add(fresh[key])
        _fold(fresh[key], r, difficulty.get(r.item_id, 0.7))
    db.commit()
    return len(fresh)


def _fold(state: ConceptState, response: Response, difficulty: float) -> None:
    """Fold one response into a state row — shared by the live and rebuild paths.

    Visible XP (plan §1.1) accrues here but is never read back into any
    diagnostic estimate; it exists only for the Town-Hall progression.
    """
    if not response.rt_valid:
        state.n_invalid += 1
        _touch(state)
        return
    n = state.n_valid + 1
    state.n_valid = n
    if response.direction_correct:
        state.mastery_alpha += 1.0
    else:
        state.mastery_beta += 1.0
    conf = confidence_strength(Opt(response.response_option))
    bias = conf - (1.0 if response.direction_correct else 0.0)
    misc = 1.0 if response.diagnostic_cell == "MISCONCEPTION" else 0.0
    state.calibrated_proficiency += (response.brier_reward - state.calibrated_proficiency) / n
    state.calibration_bias += (bias - state.calibration_bias) / n
    state.misconception_density += (misc - state.misconception_density) / n
    state.mean_rt_ms += (response.response_time_ms - state.mean_rt_ms) / n
    state.xp += xp_item(response.brier_reward, difficulty)
    _touch(state)


def fingerprint(states: Iterable[ConceptState], strands: List[str]) -> List[float]:
    """The concept-mastery vector in a fixed strand order (plan §5.5, §11).

    Unseen concepts report the prior mean (0.5), not zero: no evidence is not
    the same measurement as evidence of failure.
    """
    by_strand = {s.strand: s for s in states}
    return [round(by_strand[c].mastery_mean, 3) if c in by_strand else 0.5 for c in strands]
