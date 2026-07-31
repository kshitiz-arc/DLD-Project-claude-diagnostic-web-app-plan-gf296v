# The research layer — twin-Δ and cognitive diagnosis (plan §6, §12)

Two Phase-3 estimators live in the analytical core. Both are switched on by
data, not by a migration: the schema has carried `twin_id` + `form` since day
one, so nothing needs re-collecting.

Both are also **hypotheses under test**, and the code says so where it matters.

## Reification gap Δ (`diagnostic_scoring.twin_delta`)

Each twin pair is a canonical and a perturbed form of the same structure. The
gap is

```
Δ = s_canonical − s_perturbed
```

on the signed Brier score. A large positive Δ — competent on the canonical
form, failing the perturbed one — is the signature of procedural-without-
structural understanding.

```python
from diagnostic_scoring import from_response_rows, cohort_gap, gap_by_concept

deltas = from_response_rows(rows)        # rows straight from the event-store
est = cohort_gap(deltas)
est.n, est.mean, est.ci95, est.p_two_sided, est.significant_at_05
gap_by_concept(deltas)                   # where structure is thinnest
```

Design decisions worth knowing:

- **Pairing is within student × twin × wave.** One child's canonical never
  pairs with another's perturbed.
- **Repeat attempts on a form are averaged** before pairing — an honest
  aggregate rather than an arbitrary first/last choice.
- **Unpaired forms are dropped.** A Δ is only defined on a complete pair.
- **The significance test is a normal approximation** (`math.erfc`), not a
  t-distribution. On pilot-sized samples treat it as a screening aid.

### Difference-in-differences

```python
from diagnostic_scoring import difference_in_differences
did = difference_in_differences(deltas, pre_wave="base", post_wave="post")
did.did, did.ci95, did.paired
```

Label collection waves via `SessionStart.wave`; the estimator pairs within
student when the same children appear in both waves (far more powerful on a
small pilot) and falls back to an unpaired contrast otherwise.

`GET /api/research/twin-delta` exposes the cohort and per-concept gaps, with
the caveat attached to the payload.

## Cognitive diagnosis: DINA / DINO (`diagnostic_scoring.cdm`)

The Beta-Bernoulli model is the day-one estimator — no calibration needed,
works from the first response. The CDM is the Phase-2/3 upgrade once volume
allows.

```python
from diagnostic_scoring import QMatrix, fit_cdm, response_matrix

q = QMatrix.from_tags([[item.strand, item.axis] for item in items])
students, matrix = response_matrix(rows, [i.id for i in items])
fit = fit_cdm(matrix, q, model="DINA")

fit.mastery(0)            # P(mastered) per skill for one student
fit.item_quality()        # items ranked by slip+guess — the QC list
fit.trustworthy_sample    # False below ~200 respondents
```

Honest limits, stated in the code as well as here:

- **Complexity is O(iterations × students × 2^K × items).** Pure Python, no
  SciPy. K = 10 strands (1024 profiles) runs fine as an offline batch; beyond
  ~12 skills you need a numerical stack. `fit_cdm` refuses rather than hangs.
- **Missing cells are holes, not zeros.** Adaptive delivery makes the matrix
  sparse *by design*; an unadministered item must never read as a failure.
- **Only RT-valid responses enter the matrix.** The validity gate protects the
  CDM exactly as it protects every other estimate.
- **Slip/guess are weakly identified on a pilot.** `trustworthy_sample` is
  `False` below 200 respondents; don't publish parameters from 30 children.

## The export path

```
GET /api/export/responses.csv       # one row per response, self-contained
GET /api/export/concept-state.csv   # derived per concept × student
GET /api/export/items.csv           # the bank with ground truth (admin only)
```

The response export carries `twin_id`, `form`, `axis`, `wave`, both proper
scores, and the RT floor each response was judged against — enough to
reproduce every derived figure offline, in Python, with no access to the
server.
