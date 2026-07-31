# Diagnostic Scoring Engine

The analytical core of the Class 7 Mathematics **pre-requisite audit** — a
diagnostic *measurement instrument*, not a tutoring system. It diagnoses what a
student believes and how strongly, and produces a per-concept mastery
fingerprint. It contains **no lessons, hints, or remediation** (scope boundary,
plan §1 / §7).

This package is Phase-1's first artifact: a pure-Python, **dependency-free**
reference implementation of the scoring model (plan §5). Keeping it in Python
means the same logic serves the FastAPI request path *and* the offline research
pipeline (calibration, cognitive-diagnosis models, twin-Δ) without duplication.

## The two-score principle (plan §1.1)

One response produces two numbers that are **never conflated**:

| Score | Source | Range | Audience |
|---|---|---|---|
| `brier_reward` | strictly proper scoring rule | `[-1, +1]`, signed | internal — adaptivity & analytics |
| `xp_item` | floored transform of the above | `≥ 0` | visible — the game layer |

A statistically honest diagnostic must penalise confident-wrong answers; a
child-facing score must not go demotivatingly negative. Separating them keeps
both correct.

## Modules

| Module | Plan ref | Responsibility |
|---|---|---|
| `encoding.py` | §5.1 | `Response` (AT/ST/SF/AF) → subjective probability `p̂` via tunable `(p2, p3)` bands |
| `scoring.py` | §5.2–5.3 | Brier & log proper scores; the 2×2 diagnostic cell |
| `validity.py` | §5.4 | Response-time validity gate; speed×accuracy quadrant |
| `mastery.py` | §5.5, §6 | Beta-Bernoulli mastery posterior (mean = estimate, variance = uncertainty) |
| `gamification.py` | §8 | Floored, cosmetic XP currency |
| `engine.py` | §11 | `score_response` → one full `responses`-row record |
| `aggregation.py` | §5.5, §11 | Per concept×student `ConceptState` (mastery, calibration, misconception density, fluency) |
| `twin_delta.py` | §12 | Reification gap `Δ = s_canonical − s_perturbed`, per-concept/per-student gaps, difference-in-differences |
| `cdm.py` | §6 | `QMatrix` + DINA/DINO fitted by EM — the Phase-3 cognitive-diagnosis upgrade |

## The 2×2 diagnostic cell — the interpretive payload (plan §5.3)

|              | Confident   | Hedged    |
|--------------|-------------|-----------|
| **Correct**  | Secure      | Fragile   |
| **Wrong**    | Misconception ⟵ top adaptivity priority | Gap |

`Misconception` (confident-wrong) is the instrument's high-value output: it
separates a *hardened misconception* from a mere *knowledge gap*.

## Why a *proper* scoring rule

A scoring rule is **strictly proper** when a student maximises expected score
only by reporting their true belief. Ad-hoc linear points are not proper and
reward constant hedging, collapsing the scale. The default is an affine-rescaled
**Brier** score (bounded, child-safe); a **logarithmic** score is available for
research-grade calibration work (`p3 < 1` keeps it finite). Propriety is
enforced by a test (`test_brier_is_strictly_proper`).

Worked values at the default bands `(p2, p3) = (0.70, 0.925)`, true statement:

| Response | `p̂` | `brier_reward` | cell |
|---|---|---|---|
| AT | 0.925 | **+0.99** | Secure |
| ST | 0.70  | **+0.82** | Fragile |
| SF | 0.30  | **+0.02** | Gap |
| AF | 0.075 | **−0.71** | Misconception |

## Usage

```python
from diagnostic_scoring import Response, score_response, aggregate

scored = score_response(Response.AT, ground_truth=True, response_time_ms=3200)
scored.diagnostic_cell   # DiagnosticCell.SECURE
scored.brier_reward      # ~0.99
scored.rt_valid          # True

state = aggregate([scored, ...])
state.mastery_mean, state.calibration_bias, state.misconception_density
```

## Develop

```bash
pip install -e ".[dev]"
pytest
```

## Roadmap position

Phase 0/1 delivers this engine and the fixed-form MVP around it; Phase 2 adds
the adaptive path and the game layer. The Phase-3 estimators — twin-Δ and
DINA/DINO over the Q-matrix — are **built and tested** in `twin_delta.py` and
`cdm.py`, and the data model has carried `twin_id` + `form` since day one, so
switching them on needs collected data rather than a migration (plan §4, §12).
See [research.md](research.md) for how to run them and what their limits are.

Tunable parameters — the band anchors `(p2, p3)`, the RT floor `T_min`, priors,
and the XP constant `K` — are marked `[assumption — tunable]` in code and fixed
in Phase 0. The RT floor is now **per item**, derived from statement length,
rather than one global constant.
