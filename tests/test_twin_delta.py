"""Twin-Delta / reification-gap estimator (plan §12)."""

import random

import pytest

from diagnostic_scoring import (
    Response,
    TwinObservation,
    brier_reward,
    cohort_gap,
    difference_in_differences,
    from_response_rows,
    gap_by_concept,
    gap_by_student,
    pair_twins,
)
from diagnostic_scoring.twin_delta import CANONICAL, PERTURBED, summarise


def obs(student, twin, form, s, concept="Integers", wave="base"):
    return TwinObservation(student=student, twin_id=twin, form=form,
                           brier_reward=s, concept=concept, wave=wave)


def test_delta_is_canonical_minus_perturbed():
    deltas = pair_twins([obs("A", 1, CANONICAL, 0.99), obs("A", 1, PERTURBED, -0.71)])
    assert len(deltas) == 1
    assert deltas[0].delta == pytest.approx(1.70)


def test_delta_uses_real_brier_values():
    """A student confident-right on canonical, confident-wrong on perturbed."""
    canonical = brier_reward(Response.AT, True)     # +0.99
    perturbed = brier_reward(Response.AT, False)    # -0.71
    deltas = pair_twins([obs("A", 1, CANONICAL, canonical), obs("A", 1, PERTURBED, perturbed)])
    assert deltas[0].delta == pytest.approx(canonical - perturbed)
    assert deltas[0].delta > 1.5  # the reification-failure signature


def test_unpaired_forms_are_dropped():
    """A Delta is only defined on a complete canonical+perturbed pair."""
    assert pair_twins([obs("A", 1, CANONICAL, 0.99)]) == []
    assert pair_twins([obs("A", 1, PERTURBED, 0.99)]) == []


def test_repeat_attempts_on_a_form_are_averaged():
    deltas = pair_twins([
        obs("A", 1, CANONICAL, 1.0), obs("A", 1, CANONICAL, 0.0),
        obs("A", 1, PERTURBED, 0.0),
    ])
    assert deltas[0].s_canonical == pytest.approx(0.5)
    assert deltas[0].delta == pytest.approx(0.5)


def test_pairing_is_within_student():
    """One student's canonical must never pair with another's perturbed."""
    deltas = pair_twins([obs("A", 1, CANONICAL, 1.0), obs("B", 1, PERTURBED, -1.0)])
    assert deltas == []


def test_no_gap_when_both_forms_score_alike():
    """Structural understanding: the perturbation costs nothing."""
    obsv = []
    for i in range(20):
        obsv += [obs(f"S{i}", 1, CANONICAL, 0.9), obs(f"S{i}", 1, PERTURBED, 0.9)]
    est = cohort_gap(pair_twins(obsv))
    assert est.mean == pytest.approx(0.0)
    assert not est.significant_at_05


def test_cohort_gap_detects_a_systematic_reification_failure():
    rng = random.Random(7)
    obsv = []
    for i in range(40):
        base = rng.uniform(0.6, 1.0)
        obsv += [obs(f"S{i}", 1, CANONICAL, base),
                 obs(f"S{i}", 1, PERTURBED, base - 1.2 + rng.uniform(-0.1, 0.1))]
    est = cohort_gap(pair_twins(obsv))
    assert est.n == 40
    assert est.mean == pytest.approx(1.2, abs=0.1)
    assert est.ci95[0] > 0        # the gap is bounded away from zero
    assert est.significant_at_05


def test_gap_by_concept_and_student_group_correctly():
    obsv = [
        obs("A", 1, CANONICAL, 1.0, "Integers"), obs("A", 1, PERTURBED, 0.0, "Integers"),
        obs("A", 2, CANONICAL, 1.0, "Fractions"), obs("A", 2, PERTURBED, 1.0, "Fractions"),
        obs("B", 1, CANONICAL, 1.0, "Integers"), obs("B", 1, PERTURBED, 0.0, "Integers"),
    ]
    deltas = pair_twins(obsv)
    by_concept = gap_by_concept(deltas)
    assert by_concept["Integers"].mean == pytest.approx(1.0)
    assert by_concept["Fractions"].mean == pytest.approx(0.0)
    by_student = gap_by_student(deltas)
    assert by_student["A"].n == 2
    assert by_student["A"].mean == pytest.approx(0.5)


def test_summarise_handles_degenerate_samples():
    empty = summarise([])
    assert empty.n == 0 and empty.mean == 0.0 and not empty.significant_at_05
    single = summarise([0.9])
    assert single.n == 1 and single.mean == pytest.approx(0.9)
    assert single.stderr == 0.0 and not single.significant_at_05


def test_did_pairs_within_student_when_waves_overlap():
    """Gap shrinks from 1.0 to 0.2 for every student: DiD == -0.8."""
    obsv = []
    for i in range(15):
        obsv += [obs(f"S{i}", 1, CANONICAL, 1.0, wave="pre"),
                 obs(f"S{i}", 1, PERTURBED, 0.0, wave="pre"),
                 obs(f"S{i}", 1, CANONICAL, 1.0, wave="post"),
                 obs(f"S{i}", 1, PERTURBED, 0.8, wave="post")]
    est = difference_in_differences(pair_twins(obsv), "pre", "post")
    assert est.paired
    assert est.pre.mean == pytest.approx(1.0)
    assert est.post.mean == pytest.approx(0.2)
    assert est.did == pytest.approx(-0.8)


def test_did_falls_back_to_unpaired_when_cohorts_differ():
    obsv = []
    for i in range(12):
        obsv += [obs(f"P{i}", 1, CANONICAL, 1.0, wave="pre"),
                 obs(f"P{i}", 1, PERTURBED, 0.0, wave="pre")]
    for i in range(12):
        obsv += [obs(f"Q{i}", 1, CANONICAL, 1.0, wave="post"),
                 obs(f"Q{i}", 1, PERTURBED, 0.5, wave="post")]
    est = difference_in_differences(pair_twins(obsv), "pre", "post")
    assert not est.paired
    assert est.did == pytest.approx(-0.5)


def test_from_response_rows_ignores_standalone_items():
    """Pointed at the whole event-store, it picks out only twinned rows."""
    rows = [
        {"student_id": 1, "twin_id": None, "form": "standalone", "brier_reward": 0.99, "strand": "Integers"},
        {"student_id": 1, "twin_id": 3, "form": "canonical", "brier_reward": 0.99, "strand": "Integers"},
        {"student_id": 1, "twin_id": 3, "form": "perturbed", "brier_reward": -0.71, "strand": "Integers"},
    ]
    deltas = from_response_rows(rows)
    assert len(deltas) == 1
    assert deltas[0].concept == "Integers"
    assert deltas[0].delta == pytest.approx(1.70)
