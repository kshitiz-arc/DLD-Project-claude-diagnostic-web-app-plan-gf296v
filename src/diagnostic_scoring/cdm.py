"""Cognitive diagnosis over a Q-matrix — DINA / DINO (plan §6 Phase 2/3).

The Beta-Bernoulli mastery model (``mastery.py``) is the day-one estimator: it
needs no calibration and works from the first response. Once enough response
data accumulates, the plan moves mastery estimation to a formal
**cognitive-diagnosis model** over a **Q-matrix** (items x skills) — the
established formalisation of "which of these skills does this student
possess?", and the methodological bridge to a TI-CDM publication.

Two conjunctive/disjunctive siblings are provided:

* **DINA** (conjunctive) — a student answers correctly only if they have *all*
  skills the item requires; ``slip`` and ``guess`` absorb the exceptions.
* **DINO** (disjunctive) — *any one* required skill suffices.

Parameters are fitted by marginal-maximum-likelihood **EM** over the 2^K
attribute profiles. Pure Python, no SciPy: honest about its ceiling —
complexity is O(iterations x students x 2^K x items), so ``K`` beyond ~12
skills needs a numerical stack. For the Class 7 instrument K = 10 strands
(1024 classes), which fits comfortably in an offline batch job.

**Do not read a CDM fit off a pilot-sized sample as fact.** Slip/guess are
weakly identified below a few hundred respondents; the fit reports its own
sample size so callers can refuse to over-interpret it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

# Keep slip/guess away from the boundary: at 0 or 1 the log-likelihood is
# degenerate and EM can lock onto a corner. [assumption -- tunable]
PARAM_FLOOR = 1e-3
PARAM_CEIL = 0.45  # a slip/guess above this describes a broken item, not a student
MIN_STUDENTS_FOR_TRUST = 200  # [assumption -- tunable] see module docstring


@dataclass(frozen=True)
class QMatrix:
    """Binary items x skills loading matrix (plan §7 — the Q-matrix).

    ``rows[j][k] == 1`` when item ``j`` requires skill ``k``. The Class 7
    instrument builds this from each item's (strand, cognitive-axis) tags: the
    pairing *is* the Q-matrix.
    """

    skills: Tuple[str, ...]
    rows: Tuple[Tuple[int, ...], ...]

    def __post_init__(self) -> None:
        if not self.skills:
            raise ValueError("a Q-matrix needs at least one skill")
        for j, row in enumerate(self.rows):
            if len(row) != len(self.skills):
                raise ValueError(f"row {j} has {len(row)} entries, expected {len(self.skills)}")
            if not any(row):
                raise ValueError(f"item {j} loads on no skill — every item must require something")

    @property
    def n_items(self) -> int:
        return len(self.rows)

    @property
    def n_skills(self) -> int:
        return len(self.skills)

    @classmethod
    def from_tags(
        cls,
        item_tags: Sequence[Sequence[str]],
        skills: Optional[Sequence[str]] = None,
    ) -> "QMatrix":
        """Build from per-item skill-tag lists, e.g. ``[["Integers", "Structural"], ...]``."""
        if skills is None:
            seen: List[str] = []
            for tags in item_tags:
                for t in tags:
                    if t not in seen:
                        seen.append(t)
            skills = seen
        index = {s: k for k, s in enumerate(skills)}
        rows = []
        for tags in item_tags:
            row = [0] * len(skills)
            for t in tags:
                if t in index:
                    row[index[t]] = 1
            rows.append(tuple(row))
        return cls(tuple(skills), tuple(rows))


@dataclass
class CdmFit:
    """A fitted DINA/DINO model plus its per-student diagnosis."""

    model: str                       # "DINA" | "DINO"
    skills: Tuple[str, ...]
    slip: List[float]                # per item
    guess: List[float]               # per item
    class_prior: List[float]         # over the 2^K attribute profiles
    log_likelihood: float
    iterations: int
    converged: bool
    n_students: int
    # per student, in the order responses were supplied
    profiles: List[Tuple[int, ...]] = field(default_factory=list)   # MAP attribute pattern
    marginals: List[List[float]] = field(default_factory=list)      # P(skill mastered)

    @property
    def trustworthy_sample(self) -> bool:
        """Whether the sample is large enough to read slip/guess as parameters."""
        return self.n_students >= MIN_STUDENTS_FOR_TRUST

    def mastery(self, student_index: int) -> Dict[str, float]:
        """Posterior P(mastered) per skill for one student."""
        return dict(zip(self.skills, self.marginals[student_index]))

    def item_quality(self) -> List[Tuple[int, float]]:
        """Items ranked by ``slip + guess`` — the QC list (worst first).

        A high sum means the item discriminates poorly whatever the student
        knows; it belongs in review, not in a diagnostic bank.
        """
        pairs = [(j, self.slip[j] + self.guess[j]) for j in range(len(self.slip))]
        return sorted(pairs, key=lambda p: -p[1])


def _all_profiles(n_skills: int) -> List[Tuple[int, ...]]:
    return [tuple((c >> k) & 1 for k in range(n_skills)) for c in range(2 ** n_skills)]


def _eta(profile: Tuple[int, ...], q_row: Tuple[int, ...], conjunctive: bool) -> int:
    """Ideal response: DINA needs every required skill, DINO needs any one."""
    required = [k for k, q in enumerate(q_row) if q]
    if conjunctive:
        return int(all(profile[k] for k in required))
    return int(any(profile[k] for k in required))


def _clip(x: float) -> float:
    return min(PARAM_CEIL, max(PARAM_FLOOR, x))


def fit_cdm(
    responses: Sequence[Sequence[Optional[int]]],
    q: QMatrix,
    *,
    model: str = "DINA",
    max_iter: int = 200,
    tol: float = 1e-6,
    max_classes: int = 4096,
) -> CdmFit:
    """Fit DINA (or DINO) by EM.

    ``responses[i][j]`` is 1/0 for student ``i`` on item ``j``, or ``None``
    when the item was not administered — adaptive delivery means the matrix is
    *sparse by design*, and a missing cell must not be read as a failure.
    """
    conjunctive = model.upper() == "DINA"
    if model.upper() not in ("DINA", "DINO"):
        raise ValueError("model must be 'DINA' or 'DINO'")
    if 2 ** q.n_skills > max_classes:
        raise ValueError(
            f"{q.n_skills} skills = {2 ** q.n_skills} attribute profiles exceeds "
            f"max_classes={max_classes}; coarsen the Q-matrix or raise the cap"
        )

    n_students, n_items = len(responses), q.n_items
    if n_students == 0:
        raise ValueError("no responses to fit")

    profiles = _all_profiles(q.n_skills)
    n_classes = len(profiles)
    # eta[c][j] -- the ideal response of class c on item j (precomputed once)
    eta = [[_eta(p, q.rows[j], conjunctive) for j in range(n_items)] for p in profiles]

    slip = [0.15] * n_items   # [assumption -- tunable] neutral starting values
    guess = [0.15] * n_items
    prior = [1.0 / n_classes] * n_classes
    prev_ll = -math.inf
    converged = False
    it = 0
    posterior: List[List[float]] = []

    for it in range(1, max_iter + 1):
        # --- E step: posterior over attribute profiles per student ----------
        posterior = []
        log_lik = 0.0
        # per item, the probability of a correct answer for eta=0 and eta=1
        p_correct = [(guess[j], 1.0 - slip[j]) for j in range(n_items)]
        for i in range(n_students):
            row = responses[i]
            logs = []
            for c in range(n_classes):
                acc = math.log(prior[c]) if prior[c] > 0 else -math.inf
                if acc != -math.inf:
                    eta_c = eta[c]
                    for j in range(n_items):
                        x = row[j] if j < len(row) else None
                        if x is None:
                            continue
                        p = p_correct[j][eta_c[j]]
                        acc += math.log(p) if x else math.log(1.0 - p)
                logs.append(acc)
            m = max(logs)
            exps = [math.exp(v - m) for v in logs]
            total = sum(exps)
            log_lik += m + math.log(total)
            posterior.append([e / total for e in exps])

        # --- M step: expected counts -> slip/guess/prior ---------------------
        prior = [sum(posterior[i][c] for i in range(n_students)) / n_students
                 for c in range(n_classes)]
        for j in range(n_items):
            n0 = r0 = n1 = r1 = 0.0  # (n) expected attempts, (r) expected correct
            for i in range(n_students):
                x = responses[i][j] if j < len(responses[i]) else None
                if x is None:
                    continue
                post = posterior[i]
                for c in range(n_classes):
                    w = post[c]
                    if w <= 0.0:
                        continue
                    if eta[c][j]:
                        n1 += w
                        r1 += w * x
                    else:
                        n0 += w
                        r0 += w * x
            # guess = P(correct | lacks the skills); slip = P(wrong | has them)
            guess[j] = _clip(r0 / n0) if n0 > 0 else guess[j]
            slip[j] = _clip(1.0 - r1 / n1) if n1 > 0 else slip[j]

        if abs(log_lik - prev_ll) < tol:
            prev_ll = log_lik
            converged = True
            break
        prev_ll = log_lik

    map_profiles = [profiles[max(range(n_classes), key=lambda c: post[c])] for post in posterior]
    marginals = [
        [sum(post[c] for c in range(n_classes) if profiles[c][k]) for k in range(q.n_skills)]
        for post in posterior
    ]
    return CdmFit(
        model=model.upper(), skills=q.skills, slip=slip, guess=guess, class_prior=prior,
        log_likelihood=prev_ll, iterations=it, converged=converged, n_students=n_students,
        profiles=map_profiles, marginals=marginals,
    )


def response_matrix(
    rows: Sequence[dict], item_ids: Sequence[int], student_key: str = "student_id",
) -> Tuple[List[str], List[List[Optional[int]]]]:
    """Pivot event-store rows into the (students x items) matrix ``fit_cdm`` wants.

    Only RT-valid responses are used — the validity gate (plan §5.4) protects
    the CDM from non-engaged noise exactly as it protects every other estimate.
    Repeat attempts collapse to the *first*, which is the uncontaminated one.
    """
    col = {item_id: j for j, item_id in enumerate(item_ids)}
    by_student: Dict[str, List[Optional[int]]] = {}
    for r in rows:
        if not r.get("rt_valid", True):
            continue
        j = col.get(r.get("item_id"))
        if j is None:
            continue
        key = str(r.get(student_key, ""))
        row = by_student.setdefault(key, [None] * len(item_ids))
        if row[j] is None:
            row[j] = 1 if r.get("direction_correct") else 0
    students = sorted(by_student)
    return students, [by_student[s] for s in students]
