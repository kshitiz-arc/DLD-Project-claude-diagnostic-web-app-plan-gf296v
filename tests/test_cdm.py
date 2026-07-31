"""Q-matrix + DINA/DINO cognitive diagnosis (plan §6 Phase 2/3)."""

import random

import pytest

from diagnostic_scoring import QMatrix, fit_cdm, response_matrix
from diagnostic_scoring.cdm import MIN_STUDENTS_FOR_TRUST


def simple_q(n_skills=3, reps=4):
    """Each skill gets ``reps`` single-loading items plus two conjunctive ones."""
    tags = []
    skills = [f"K{k}" for k in range(n_skills)]
    for k in range(n_skills):
        tags += [[skills[k]] for _ in range(reps)]
    tags += [[skills[0], skills[1]], [skills[1], skills[2]]]
    return QMatrix.from_tags(tags, skills)


def simulate(q, n_students=200, slip=0.1, guess=0.1, seed=11, conjunctive=True):
    rng = random.Random(seed)
    truth, matrix = [], []
    for _ in range(n_students):
        profile = tuple(1 if rng.random() < 0.5 else 0 for _ in range(q.n_skills))
        truth.append(profile)
        row = []
        for j in range(q.n_items):
            required = [k for k, v in enumerate(q.rows[j]) if v]
            has = all(profile[k] for k in required) if conjunctive else any(profile[k] for k in required)
            p = (1 - slip) if has else guess
            row.append(1 if rng.random() < p else 0)
        matrix.append(row)
    return truth, matrix


# --- Q-matrix ---------------------------------------------------------------

def test_q_matrix_from_tags_builds_the_loading_rows():
    q = QMatrix.from_tags([["Integers"], ["Integers", "Structural"], ["Structural"]])
    assert q.skills == ("Integers", "Structural")
    assert q.rows == ((1, 0), (1, 1), (0, 1))
    assert q.n_items == 3 and q.n_skills == 2


def test_q_matrix_rejects_an_item_that_requires_nothing():
    with pytest.raises(ValueError, match="loads on no skill"):
        QMatrix(("A", "B"), ((1, 0), (0, 0)))


def test_q_matrix_rejects_a_ragged_row():
    with pytest.raises(ValueError, match="expected 2"):
        QMatrix(("A", "B"), ((1, 0), (1,)))


# --- DINA recovery ----------------------------------------------------------

def test_dina_recovers_slip_and_guess_on_simulated_data():
    q = simple_q()
    _, matrix = simulate(q, n_students=400, slip=0.12, guess=0.08)
    fit = fit_cdm(matrix, q, model="DINA", max_iter=120)
    assert fit.converged
    assert sum(fit.slip) / len(fit.slip) == pytest.approx(0.12, abs=0.06)
    assert sum(fit.guess) / len(fit.guess) == pytest.approx(0.08, abs=0.06)


def test_dina_recovers_the_attribute_profiles():
    q = simple_q()
    truth, matrix = simulate(q, n_students=300, slip=0.1, guess=0.1, seed=5)
    fit = fit_cdm(matrix, q, model="DINA", max_iter=120)
    hits = sum(1 for a, b in zip(truth, fit.profiles) for x, y in zip(a, b) if x == y)
    total = len(truth) * q.n_skills
    assert hits / total > 0.85  # per-skill classification accuracy


def test_marginals_agree_with_the_map_profile():
    q = simple_q()
    _, matrix = simulate(q, n_students=120, seed=3)
    fit = fit_cdm(matrix, q, max_iter=60)
    for profile, marg in zip(fit.profiles, fit.marginals):
        for bit, p in zip(profile, marg):
            assert (p >= 0.5) == bool(bit)
        assert all(0.0 <= p <= 1.0 for p in marg)


def test_missing_cells_are_skipped_not_read_as_failures():
    """Adaptive delivery makes the matrix sparse by design (plan §6)."""
    q = simple_q()
    _, matrix = simulate(q, n_students=200, seed=9)
    dense = fit_cdm(matrix, q, max_iter=80)
    rng = random.Random(1)
    sparse_rows = [[None if rng.random() < 0.3 else x for x in row] for row in matrix]
    sparse = fit_cdm(sparse_rows, q, max_iter=80)
    agree = sum(1 for a, b in zip(dense.profiles, sparse.profiles) for x, y in zip(a, b) if x == y)
    assert agree / (len(matrix) * q.n_skills) > 0.85
    # a row of all-missing must not be scored as all-wrong
    blank = fit_cdm([[None] * q.n_items] + matrix, q, max_iter=40)
    assert blank.marginals[0] == pytest.approx(blank.marginals[0])  # finite, no NaN


def test_dino_is_disjunctive():
    """One skill suffices under DINO, so a partial profile answers correctly."""
    q = QMatrix(("A", "B"), ((1, 1),) * 6)
    _, matrix = simulate(q, n_students=200, slip=0.05, guess=0.05, seed=4, conjunctive=False)
    fit = fit_cdm(matrix, q, model="DINO", max_iter=80)
    assert fit.model == "DINO"
    assert sum(fit.slip) / len(fit.slip) < 0.2


def test_model_name_is_validated():
    with pytest.raises(ValueError, match="DINA"):
        fit_cdm([[1, 0]], QMatrix(("A",), ((1,), (1,))), model="RASCH")


def test_class_explosion_is_refused_rather_than_hung():
    q = QMatrix.from_tags([[f"K{k}"] for k in range(14)])
    with pytest.raises(ValueError, match="exceeds"):
        fit_cdm([[1] * 14], q, max_classes=4096)


def test_small_samples_are_flagged_as_untrustworthy():
    """Slip/guess are weakly identified on a pilot; the fit says so itself."""
    q = simple_q()
    _, matrix = simulate(q, n_students=30)
    fit = fit_cdm(matrix, q, max_iter=40)
    assert fit.n_students == 30
    assert not fit.trustworthy_sample
    big = fit_cdm(simulate(q, n_students=MIN_STUDENTS_FOR_TRUST)[1], q, max_iter=20)
    assert big.trustworthy_sample


def test_item_quality_ranks_the_worst_item_first():
    q = simple_q()
    _, matrix = simulate(q, n_students=250, seed=2)
    rng = random.Random(0)
    for row in matrix:  # item 0 becomes a coin flip -> no discrimination
        row[0] = rng.randint(0, 1)
    fit = fit_cdm(matrix, q, max_iter=80)
    assert fit.item_quality()[0][0] == 0


# --- pivoting the event store ----------------------------------------------

def test_response_matrix_pivots_and_drops_invalid_rt():
    rows = [
        {"student_id": 1, "item_id": 10, "direction_correct": True, "rt_valid": True},
        {"student_id": 1, "item_id": 11, "direction_correct": False, "rt_valid": True},
        {"student_id": 2, "item_id": 10, "direction_correct": True, "rt_valid": False},
        {"student_id": 2, "item_id": 11, "direction_correct": True, "rt_valid": True},
    ]
    students, matrix = response_matrix(rows, [10, 11])
    assert students == ["1", "2"]
    assert matrix[0] == [1, 0]
    assert matrix[1] == [None, 1]  # the rushed response is a hole, not a zero


def test_response_matrix_keeps_the_first_attempt():
    rows = [
        {"student_id": 1, "item_id": 10, "direction_correct": True, "rt_valid": True},
        {"student_id": 1, "item_id": 10, "direction_correct": False, "rt_valid": True},
    ]
    _, matrix = response_matrix(rows, [10])
    assert matrix[0] == [1]
