"""Adaptive item selection (plan §6) — measurement-oriented, not remediation.

The goal is to reduce uncertainty on the concept-mastery vector *efficiently*,
sampling more where misconceptions appear:

  0. An **opening block** of the hardest available items, one per concept, runs
     before adaptivity engages. This is a deliberate override: it front-loads
     difficulty while the child is freshest, and a hard item discriminates
     better than an easy one because almost everybody clears an easy item, so
     it moves no posterior. The cost is that the first few items are chosen
     without regard to uncertainty, and misconception probes are deferred until
     the block is done — they are not lost, since the responses still record
     their cells and the variance rule picks those concepts up immediately
     after. Set ``HYPERION_OPENING_HARD=0`` to disable and go fully adaptive.
  1. A fresh **Misconception** (confident-wrong) triggers *probe-deeper*. The
     probe escalates in order of diagnostic value:
       a. the **perturbed twin** of the item just missed — does the structure
          survive a change of surface? (plan §12, the reification probe)
       b. another item from the same ``sibling_group`` — is this specific
          sub-skill misconception stable, or was that a slip?
       c. any other item in the same concept.
  2. Otherwise pick the concept with the highest posterior **variance** (a
     Beta-Bernoulli over direction-correct), so unseen / uncertain concepts
     are sampled before ones already estimated well.

Stopping (all recorded as a ``stop_reason`` on the session, plan §11):
  * ``cap``       — the session item budget, set by children's attention span;
  * ``converged`` — every remaining concept is estimated below the variance
                    threshold, so more items would buy no information;
  * ``exhausted`` — the bank has nothing left to serve.

A per-concept budget stops one misconception from eating a whole sitting: the
instrument must still return a *ten*-dimensional fingerprint.

This is the v1 "evolving path" through a fixed, tagged bank — not content
generation (plan §1.4).
"""

from __future__ import annotations

import os
from collections import Counter, defaultdict
from typing import Dict, List, NamedTuple, Optional, Tuple

from diagnostic_scoring import BetaBernoulli

from .models import Item, Response

# Stop probing a concept once its posterior variance drops below this, cap the
# total items so fatigue never degrades data quality, and cap per concept so
# the fingerprint stays broad. All [assumption — tunable], env-overridable so
# a pilot can be re-tuned without a redeploy.
VARIANCE_STOP = float(os.environ.get("HYPERION_VARIANCE_STOP", "0.02"))
SESSION_CAP = int(os.environ.get("HYPERION_SESSION_CAP", "15"))
# 10 strands x 4 = 40 reachable, far above a 15-item sitting, so the budget
# never binds at this length — with 15 items over 10 concepts breadth is
# forced anyway and most concepts see one or two items.
CONCEPT_CAP = int(os.environ.get("HYPERION_CONCEPT_CAP", "4"))
# Items served hardest-first across distinct concepts before adaptivity starts.
# Scaled with the cap: 6 openers out of 35 was a sixth of the sitting, but out
# of 15 it would be 40% and leave the adaptive selector almost nothing to do.
OPENING_HARD = int(os.environ.get("HYPERION_OPENING_HARD", "3"))

STOP_CAP = "cap"
STOP_CONVERGED = "converged"
STOP_EXHAUSTED = "exhausted"


class Selection(NamedTuple):
    """What to serve next, or why the session is over."""

    item: Optional[Item]
    probing: bool = False
    stop_reason: str = ""


def _beta_by_strand(responses: List[Response]) -> Dict[str, BetaBernoulli]:
    betas: Dict[str, BetaBernoulli] = defaultdict(BetaBernoulli)
    for r in responses:
        if r.rt_valid:
            betas[r.strand].update(r.direction_correct)
    return betas


def _probe_candidates(last: Response, remaining: List[Item], by_id: Dict[int, Item]) -> List[Item]:
    """Ordered probe targets after a confident-wrong answer (most telling first)."""
    missed = by_id.get(last.item_id)
    ordered: List[Item] = []
    taken: set = set()

    def take(candidates):
        for i in candidates:
            if i.id not in taken:
                taken.add(i.id)
                ordered.append(i)

    if missed is not None and missed.twin_id is not None:
        # (a) the perturbed twin of the item just missed
        take(i for i in remaining if i.twin_id == missed.twin_id and i.id != missed.id)
    if missed is not None and missed.sibling_group:
        # (b) the same sub-skill
        take(i for i in remaining if i.sibling_group == missed.sibling_group)
    # (c) anything else in the concept
    take(i for i in remaining if i.strand == last.strand)
    return ordered


def select_next(
    active_items: List[Item],
    responses: List[Response],
    *,
    session_cap: int = SESSION_CAP,
    concept_cap: int = CONCEPT_CAP,
    opening_hard: int = OPENING_HARD,
) -> Selection:
    """Choose the next item, or stop the session with a recorded reason."""
    if len(responses) >= session_cap:
        return Selection(None, False, STOP_CAP)

    answered = {r.item_id for r in responses}
    by_id = {i.id: i for i in active_items if i.id is not None}
    remaining = [i for i in active_items if i.id not in answered]
    if not remaining:
        return Selection(None, False, STOP_EXHAUSTED)

    served_per_concept = Counter(r.strand for r in responses)
    betas = _beta_by_strand(responses)

    def uncertainty(strand: str) -> float:
        return betas[strand].variance if strand in betas else BetaBernoulli().variance

    # 0) opening block: hardest first, breadth before depth. Sorting on the
    #    served count first guarantees a fresh concept every time while any
    #    remain, so six opening items means six different concepts.
    if len(responses) < opening_hard:
        opening = sorted(
            remaining,
            key=lambda it: (served_per_concept[it.strand], -it.difficulty, it.id or 0),
        )
        return Selection(opening[0], False, "")

    # 1) misconception-triggered deeper probe (twin -> sibling -> concept)
    if responses and responses[-1].diagnostic_cell == "MISCONCEPTION":
        last = responses[-1]
        if served_per_concept[last.strand] < concept_cap:
            for candidate in _probe_candidates(last, remaining, by_id):
                return Selection(candidate, True, "")

    # 2) otherwise sample the least-certain concept. Unseen concepts sit at the
    #    Beta(1,1) maximum variance, so breadth comes before depth.
    within_budget = [i for i in remaining if served_per_concept[i.strand] < concept_cap]
    pool = within_budget or remaining
    pool = sorted(pool, key=lambda it: (-uncertainty(it.strand), -it.difficulty, it.id or 0))

    # Every concept still in play is already well estimated -> stop early
    # rather than over-testing a tired child for no information gain.
    if all(uncertainty(it.strand) < VARIANCE_STOP for it in pool):
        return Selection(None, False, STOP_CONVERGED)
    return Selection(pool[0], False, "")


def concept_convergence(responses: List[Response]) -> List[Tuple[str, float, float]]:
    """``(strand, mastery_mean, posterior_variance)`` — the §11 adaptivity trace."""
    betas = _beta_by_strand(responses)
    return sorted((s, b.mean, b.variance) for s, b in betas.items())
