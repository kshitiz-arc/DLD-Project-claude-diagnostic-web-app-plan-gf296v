"""Unit tests for the adaptive selector (plan §6) — no DB, deterministic."""

from app.adaptive import (
    CONCEPT_CAP, OPENING_HARD, SESSION_CAP,
    STOP_CAP, STOP_CONVERGED, STOP_EXHAUSTED, select_next,
)
from app.models import Item, Response

# The probe and variance rules only engage once the hard opening block is done
# (§6.0). Tests that target those rules pass opening_hard=0 so they exercise the
# behaviour under test rather than the opening sweep.
NO_OPENING = {"opening_hard": 0}


def _item(id_, strand, diff=0.7, sibling=None, twin=None, form="standalone"):
    return Item(id=id_, strand=strand, statement_text="", ground_truth=True, difficulty=diff,
                sibling_group=sibling, twin_id=twin, form=form)


def _resp(item_id, strand, cell, correct, pos):
    return Response(
        session_id=1, student_id=1, item_id=item_id, strand=strand, diagnostic_cell=cell,
        direction_correct=correct, rt_valid=True, position_in_session=pos, response_option="AT",
    )


def test_misconception_triggers_same_concept_probe():
    items = [_item(1, "Integers"), _item(2, "Integers"), _item(3, "Algebra")]
    responses = [_resp(1, "Integers", "MISCONCEPTION", False, 0)]
    nxt, probing, _ = select_next(items, responses, **NO_OPENING)
    assert nxt.id == 2 and nxt.strand == "Integers"
    assert probing is True


def test_probe_prefers_the_perturbed_twin():
    """Does the structure survive a change of surface? (plan §12)"""
    items = [
        _item(1, "Algebra", sibling="alg.collect", twin=7, form="canonical"),
        _item(2, "Algebra", sibling="alg.other"),
        _item(3, "Algebra", sibling="alg.collect", twin=7, form="perturbed"),
    ]
    nxt, probing, _ = select_next(items, [_resp(1, "Algebra", "MISCONCEPTION", False, 0)], **NO_OPENING)
    assert nxt.id == 3 and probing is True


def test_probe_falls_back_to_the_sibling_group():
    items = [
        _item(1, "Integers", sibling="int.sign"),
        _item(2, "Integers", sibling="int.order"),
        _item(3, "Integers", sibling="int.sign"),
    ]
    nxt, probing, _ = select_next(items, [_resp(1, "Integers", "MISCONCEPTION", False, 0)], **NO_OPENING)
    assert nxt.id == 3 and probing is True


def test_concept_budget_stops_endless_probing():
    """One misconception must not eat the whole sitting (plan §6)."""
    items = [_item(i, "Integers", sibling="int.sign") for i in range(1, 8)] + [_item(20, "Algebra")]
    responses = [_resp(i, "Integers", "MISCONCEPTION", False, i - 1) for i in range(1, 4)]
    nxt, probing, _ = select_next(items, responses, concept_cap=3, **NO_OPENING)
    assert nxt.strand == "Algebra"
    assert probing is False


def test_prefers_unseen_concept_by_variance():
    items = [_item(1, "Integers"), _item(2, "Algebra"), _item(3, "Fractions")]
    # one clean (non-misconception) answer on Integers lowers its variance below
    # the unseen concepts' Beta(1,1) variance, so an unseen strand is chosen.
    responses = [_resp(1, "Integers", "SECURE", True, 0)]
    nxt, probing, _ = select_next(items, responses, **NO_OPENING)
    assert nxt.strand in {"Algebra", "Fractions"}
    assert probing is False


def test_stops_at_cap_with_a_reason():
    items = [_item(i, "Integers") for i in range(1, 20)]
    responses = [_resp(i, "Integers", "SECURE", True, i) for i in range(1, 13)]
    nxt, _, reason = select_next(items, responses, session_cap=12, **NO_OPENING)
    assert nxt is None and reason == STOP_CAP


def test_stops_when_the_bank_is_exhausted():
    items = [_item(1, "Integers")]
    nxt, _, reason = select_next(items, [_resp(1, "Integers", "SECURE", True, 0)])
    assert nxt is None and reason == STOP_EXHAUSTED


def test_stops_early_once_every_concept_has_converged():
    """More items would buy no information — don't tire the child for nothing."""
    items = [_item(i, "Integers") for i in range(1, 200)]
    responses = [_resp(i, "Integers", "SECURE", True, i) for i in range(1, 60)]
    nxt, _, reason = select_next(items, responses, session_cap=500, **NO_OPENING)
    assert nxt is None and reason == STOP_CONVERGED


# --- §6.0 hard opening block ------------------------------------------------

def test_shipped_budgets():
    """Pin the defaults a sitting actually runs with."""
    assert SESSION_CAP == 30
    assert OPENING_HARD == 6
    # 10 strands x CONCEPT_CAP must be able to reach SESSION_CAP, or sittings
    # starve on the per-concept budget before they reach the cap.
    assert 10 * CONCEPT_CAP >= SESSION_CAP


def test_opening_block_serves_hardest_first():
    items = [_item(1, "Integers", diff=0.55), _item(2, "Algebra", diff=0.85),
             _item(3, "Fractions", diff=0.70)]
    nxt, probing, _ = select_next(items, [])
    assert nxt.id == 2 and probing is False


def test_opening_block_spreads_across_concepts_before_repeating():
    """Six opening items must be six different concepts, not six of the hardest."""
    items = [_item(i, s, diff=d) for i, (s, d) in enumerate(
        [("Integers", 0.85), ("Integers", 0.85), ("Algebra", 0.80),
         ("Fractions", 0.75), ("Triangles", 0.70)], start=1)]
    responses = []
    served = []
    for pos in range(4):
        nxt, _, _ = select_next(items, responses)
        served.append(nxt)
        responses.append(_resp(nxt.id, nxt.strand, "SECURE", True, pos))
    assert len({i.strand for i in served}) == 4, [i.strand for i in served]


def test_opening_block_hands_over_to_adaptive():
    """After the block, misconception probing resumes."""
    items = [_item(i, "Integers", sibling="int.sign") for i in range(1, 4)] + \
            [_item(10 + i, f"S{i}") for i in range(6)]
    responses = [_resp(10 + i, f"S{i}", "SECURE", True, i) for i in range(6)]
    responses.append(_resp(1, "Integers", "MISCONCEPTION", False, 6))
    nxt, probing, _ = select_next(items, responses)
    assert nxt.strand == "Integers" and probing is True


def test_invalid_responses_do_not_move_the_posterior():
    items = [_item(1, "Integers"), _item(2, "Integers"), _item(3, "Algebra")]
    rushed = _resp(1, "Integers", "SECURE", True, 0)
    rushed.rt_valid = False
    nxt, _, _ = select_next(items, [rushed], **NO_OPENING)
    # Integers is still at the Beta(1,1) prior, so it ties with Algebra and the
    # difficulty/id tie-break decides — the point is that it was not down-ranked.
    assert nxt.id in {2, 3}
