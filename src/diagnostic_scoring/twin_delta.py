"""Twin-Delta / reification-gap estimator (plan §12, Phase 3).

Each concept can carry **twin items**: a ``canonical`` form and a ``perturbed``
form that share surface structure but differ on the reification-critical
feature, linked by ``twin_id``. The reification gap is

    Delta = s_canonical - s_perturbed

on the signed diagnostic score. A large *positive* Delta -- competent on the
canonical form, failing on the perturbed one -- is the signature of
procedural-without-structural understanding, i.e. the reification failure the
framework targets.

This module is the pluggable estimator the schema was built for: ``responses``
has carried ``twin_id`` + ``form`` since day one, so switching it on needs no
re-collection. Pure Python (no SciPy) so it runs in the same process as the
server; the significance test is a normal approximation, stated as such.

**[Efficacy of Delta as a reification discriminator is a hypothesis to
validate on collected data, not an assumed result.]**
"""

from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

CANONICAL = "canonical"
PERTURBED = "perturbed"


@dataclass(frozen=True)
class TwinObservation:
    """One scored response to a twinned item (a row of the event-store)."""

    student: str
    twin_id: int
    form: str  # canonical | perturbed
    brier_reward: float
    concept: str = ""
    wave: str = "base"  # labels a collection wave for the DiD design


@dataclass(frozen=True)
class TwinDelta:
    """A paired within-student reification gap on one twin."""

    student: str
    twin_id: int
    concept: str
    wave: str
    s_canonical: float
    s_perturbed: float

    @property
    def delta(self) -> float:
        return self.s_canonical - self.s_perturbed


@dataclass(frozen=True)
class GapEstimate:
    """Summary of a set of Deltas (mean, spread, normal-approx test)."""

    n: int
    mean: float
    sd: float
    stderr: float
    ci95: Tuple[float, float]
    t_stat: float
    p_two_sided: float
    label: str = ""

    @property
    def significant_at_05(self) -> bool:
        """Normal-approximation flag -- a screening aid, not a verdict."""
        return self.n >= 2 and self.p_two_sided < 0.05


# --- small pure-Python statistics ------------------------------------------

def _mean(xs: Sequence[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def _sd(xs: Sequence[float]) -> float:
    """Sample standard deviation (n-1); 0.0 for fewer than two points."""
    if len(xs) < 2:
        return 0.0
    m = _mean(xs)
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))


def _normal_p_two_sided(z: float) -> float:
    """Two-sided p under the standard normal (via ``math.erf``)."""
    return math.erfc(abs(z) / math.sqrt(2.0))


def summarise(values: Sequence[float], label: str = "") -> GapEstimate:
    """Mean / SD / SE / 95% CI / normal-approx test for a sample of Deltas."""
    n = len(values)
    if n == 0:
        return GapEstimate(0, 0.0, 0.0, 0.0, (0.0, 0.0), 0.0, 1.0, label)
    m = _mean(values)
    sd = _sd(values)
    se = sd / math.sqrt(n) if n > 1 and sd > 0 else 0.0
    half = 1.96 * se
    z = m / se if se > 0 else 0.0
    return GapEstimate(
        n=n, mean=m, sd=sd, stderr=se, ci95=(m - half, m + half),
        t_stat=z, p_two_sided=_normal_p_two_sided(z) if se > 0 else 1.0, label=label,
    )


# --- pairing ----------------------------------------------------------------

def pair_twins(observations: Iterable[TwinObservation]) -> List[TwinDelta]:
    """Pair canonical/perturbed observations *within* student x twin x wave.

    Repeat attempts on the same form are averaged before pairing (an honest
    aggregate rather than an arbitrary first/last choice). Unpaired forms are
    dropped -- a Delta is only defined on a complete pair.
    """
    bucket: Dict[Tuple[str, int, str], Dict[str, List[float]]] = defaultdict(
        lambda: {CANONICAL: [], PERTURBED: []}
    )
    concepts: Dict[Tuple[str, int, str], str] = {}
    for o in observations:
        if o.form not in (CANONICAL, PERTURBED):
            continue
        key = (o.student, o.twin_id, o.wave)
        bucket[key][o.form].append(o.brier_reward)
        concepts.setdefault(key, o.concept)

    out: List[TwinDelta] = []
    for (student, twin_id, wave), forms in bucket.items():
        if not forms[CANONICAL] or not forms[PERTURBED]:
            continue
        out.append(TwinDelta(
            student=student, twin_id=twin_id, concept=concepts.get((student, twin_id, wave), ""),
            wave=wave, s_canonical=_mean(forms[CANONICAL]), s_perturbed=_mean(forms[PERTURBED]),
        ))
    out.sort(key=lambda d: (d.student, d.twin_id, d.wave))
    return out


# --- estimators -------------------------------------------------------------

def cohort_gap(deltas: Sequence[TwinDelta], label: str = "cohort") -> GapEstimate:
    """Mean reification gap across every paired Delta in the cohort."""
    return summarise([d.delta for d in deltas], label)


def gap_by_concept(deltas: Sequence[TwinDelta]) -> Dict[str, GapEstimate]:
    """Reification gap per concept -- where structure is thinnest."""
    grouped: Dict[str, List[float]] = defaultdict(list)
    for d in deltas:
        grouped[d.concept].append(d.delta)
    return {c: summarise(v, c) for c, v in sorted(grouped.items())}


def gap_by_student(deltas: Sequence[TwinDelta]) -> Dict[str, GapEstimate]:
    """Per-student mean gap -- who is running on procedure alone."""
    grouped: Dict[str, List[float]] = defaultdict(list)
    for d in deltas:
        grouped[d.student].append(d.delta)
    return {s: summarise(v, s) for s, v in sorted(grouped.items())}


@dataclass(frozen=True)
class DiDEstimate:
    """Difference-in-differences on the reification gap (plan §12)."""

    pre: GapEstimate
    post: GapEstimate
    did: float          # mean(post Delta) - mean(pre Delta)
    stderr: float
    ci95: Tuple[float, float]
    z_stat: float
    p_two_sided: float
    paired: bool        # True when the same students appear in both waves


def difference_in_differences(
    deltas: Sequence[TwinDelta], pre_wave: str, post_wave: str,
) -> DiDEstimate:
    """Compare the reification gap across two collection waves.

    When the same students are present in both waves the estimator pairs them
    within student (a within-subject DiD, far more powerful on a small pilot);
    otherwise it falls back to an unpaired two-sample contrast. The design is
    the one carried over from the DLD paper.
    """
    pre_by_student: Dict[str, List[float]] = defaultdict(list)
    post_by_student: Dict[str, List[float]] = defaultdict(list)
    for d in deltas:
        if d.wave == pre_wave:
            pre_by_student[d.student].append(d.delta)
        elif d.wave == post_wave:
            post_by_student[d.student].append(d.delta)

    pre_vals = [v for vs in pre_by_student.values() for v in vs]
    post_vals = [v for vs in post_by_student.values() for v in vs]
    pre, post = summarise(pre_vals, pre_wave), summarise(post_vals, post_wave)

    common = sorted(set(pre_by_student) & set(post_by_student))
    if common:
        diffs = [_mean(post_by_student[s]) - _mean(pre_by_student[s]) for s in common]
        est = summarise(diffs, f"{post_wave}-{pre_wave}")
        return DiDEstimate(pre, post, est.mean, est.stderr, est.ci95, est.t_stat,
                           est.p_two_sided, paired=True)

    did = post.mean - pre.mean
    se = math.sqrt(pre.stderr ** 2 + post.stderr ** 2)
    half = 1.96 * se
    z = did / se if se > 0 else 0.0
    return DiDEstimate(pre, post, did, se, (did - half, did + half), z,
                       _normal_p_two_sided(z) if se > 0 else 1.0, paired=False)


def from_response_rows(
    rows: Iterable[dict],
    *,
    wave_key: Optional[str] = None,
) -> List[TwinDelta]:
    """Build Deltas straight from event-store rows (dicts or ORM ``__dict__``).

    Expects ``student``/``student_id``, ``twin_id``, ``form``, ``brier_reward``
    and optionally ``strand``/``concept``. Rows without a ``twin_id`` (i.e.
    ``standalone`` items) are ignored, so this can be pointed at the whole log.
    """
    obs: List[TwinObservation] = []
    for r in rows:
        twin = r.get("twin_id")
        form = r.get("form")
        if twin is None or form not in (CANONICAL, PERTURBED):
            continue
        obs.append(TwinObservation(
            student=str(r.get("student", r.get("student_id", ""))),
            twin_id=int(twin), form=form,
            brier_reward=float(r.get("brier_reward", 0.0)),
            concept=str(r.get("concept", r.get("strand", ""))),
            wave=str(r.get(wave_key, "base")) if wave_key else "base",
        ))
    return pair_twins(obs)
