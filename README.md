<div align="center">

# HYPERION

### Class 7 Mathematics Pre-requisite Diagnostic

**A measurement instrument, not a tutoring system.**
HYPERION diagnoses *what a student believes and how strongly*, produces a per-concept mastery fingerprint, and routes it to the teacher — no lessons, hints, or remediation.

<br>

![Python](https://img.shields.io/badge/Python-pure_core-3776AB?logo=python&logoColor=white&style=flat-square)
![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi&logoColor=white&style=flat-square)
![React](https://img.shields.io/badge/React-frontend-61DAFB?logo=react&logoColor=black&style=flat-square)
![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white&style=flat-square)
![Tests](https://img.shields.io/badge/tests-137_passing-3fb950?style=flat-square)
![Scale](https://img.shields.io/badge/scale-6--point_signed-22e7ff?style=flat-square)
![No PII](https://img.shields.io/badge/pupil_data-no_PII-6f42c1?style=flat-square)
![Air-gapped](https://img.shields.io/badge/deploy-air--gapped_LAN-8957e5?style=flat-square)

[The idea](#the-idea) · [Quick start](#quick-start) · [A sitting, step by step](#a-sitting-step-by-step) · [Design decisions](#design-decisions-worth-knowing) · [Status](#status-against-the-plan) · [Docs](#docs)

</div>

---

## The idea

HYPERION measures. It records a student's answer *and* their stated certainty — on a **six-point signed scale with no midpoint**, because a 50/50 option is a free dodge that carries no direction — then holds apart two quantities that assessment tools usually blur together.

> [!IMPORTANT]
> **Two scores, never one.** One response yields an internal **signed diagnostic score** — a strictly-proper Brier rule that drives every analytic — and a separate, floored **XP currency** that drives the game layer. The two are never conflated, so gamification cannot corrupt the measurement. *(plan §1.1)*

The result is a ten-dimensional mastery fingerprint, one per student, routed to the teacher. The scope boundary is deliberate and enforced end to end (plan §1 / §7): **diagnosis only — no lessons, no hints, no remediation.**

---

## Repository map

| Path | What it is |
|------|------------|
| **`src/diagnostic_scoring/`** | **Analytical core** — pure-Python, dependency-free. Proper scoring, the 2×2 diagnostic cell, the RT validity gate, Beta-Bernoulli mastery, aggregation, the twin-Δ estimator, and DINA/DINO over a Q-matrix. The source of truth for analytics. |
| **`tests/`** | 74-test suite: pins the §5.2 worked values, proves the Brier rule is strictly proper, and recovers DINA parameters from simulated data. |
| **`backend/`** | **FastAPI · SQLModel · SQLite (WAL)** — identity, adaptive item delivery, the append-only event-store, server-side scoring, a role-scoped console, CSV research exports, backups, and the LAN join page. 63 tests. |
| **`backend/app/itembank.py`** | The **authored item bank** — 44 tagged statements across 10 strands, with sibling groups and canonical/perturbed twins. One source of truth; the frontend mirror is generated. |
| **`frontend/`** | **React · Vite · TS** — sign-in gate, scale-anchoring onboarding, the RANGE warm-up, the diagnostic HUD, the live teacher console, and the PTM report card. Builds to static assets served by FastAPI. |
| **`prototypes/`** | Self-contained interactive HTML prototypes of every screen — the design reference. |
| **`docs/`** | Scoring engine, concept taxonomy, metrics & API, deployment, research layer, ethics. |

---

## Quick start

```bash
# Analytical core
pip install -e ".[dev]" && pytest        # 74 passing

# Backend
pip install -r backend/requirements.txt
cd backend && pytest                     # 63 passing

# The whole thing, as it runs in the lab
backend\start.bat                        # Windows   (backend/start.sh elsewhere)
```

Once it's up:

| Who | Where |
|-----|-------|
| Students | `http://<laptop-ip>:8000` |
| Warm-up (optional, not assessed) | `http://<laptop-ip>:8000/range` |
| Projector (join screen + QR) | `http://localhost:8000/lan` |
| Teacher | `http://localhost:8000/console` |
| Parents' evening report | `http://localhost:8000/report/<code>` |

> [!NOTE]
> On Windows the LAN port needs an inbound firewall rule. `backend\start.bat`
> adds it when run as Administrator; otherwise other devices simply time out
> while the host itself still loads the page perfectly — which is a confusing
> way to lose ten minutes before a demo.

---

## A sitting, step by step

1. **Sign in.** Students self-create an anonymous code — a random call-sign, no PII. A PIN is optional but enforced when set; a forgotten one is cleared by the teacher, who is the only person who can verify in the room that the child asking owns the code. Teachers use an admin-issued ID.
2. **Onboarding.** One practice item anchors what *"maybe"* means — a measurement control, since twelve-year-olds read the hedge bins inconsistently. **RANGE**, an optional warm-up, sits outside the instrument: its content is deliberately absent from the Q-matrix so practising cannot inflate what is about to be measured.
3. **Adaptive delivery.** A sitting is **15 items**, opening with the 3 hardest available across distinct concepts while the child is freshest; after that items are chosen to shrink uncertainty fastest. A confident-wrong answer triggers a deeper probe: first the item's **perturbed twin**, then its **sibling sub-skill**, then the **concept**. Budgets cap both the sitting and any single concept, so the fingerprint stays ten-dimensional.
4. **Server-side scoring.** Items ship without ground truth. Each response yields a Brier reward, a log score, a diagnostic cell, and an RT validity verdict against that item's own reading floor.
5. **Stopping** on convergence, cap, or exhaustion — with the reason recorded. A child may also end early; those answers still count, and the sitting is marked `abandoned`.
6. **The console** shows concept heat, ranked confident-wrong hotspots, a per-student record, and a built-in *How to read this* explaining every statistic and the marking rubric. CSV exports carry everything needed for offline analysis.
7. **The report card** turns one student into a page for a parents' evening — effort shown apart from attainment, confident-wrong framed as "worth a conversation", thin evidence labelled provisional, and no class rank anywhere.

---

## Design decisions worth knowing

**Confident-wrong is the product, not the failure.** It's what separates a hardened misconception from a plain knowledge gap. Both the scoring and the adaptivity are built around isolating that one cell.

**The leaderboard is a validity threat.** So there is no raw-score board. The calibration, growth, and effort boards reward exactly the behaviours that produce clean data — and rushing earns nothing.

**The event-store is the truth.** `concept_state` is a write-through cache, fully rebuildable from the log; a test asserts the rebuild reproduces it exactly.

**Invalid responses are holes, not zeros.** A rushed answer moves no posterior, earns no XP, and enters no estimate.

**Nothing external loads.** No CDN, no web fonts, no outbound calls. The lab may be fully air-gapped.

**No midpoint on the scale.** Six bands, three either side. A 50/50 option is a free dodge — children cluster on it under pressure, and an answer with no direction can never populate the confident-wrong cell, which is the one the instrument exists to find. "Mostly false" counts as *confident*: a child at p̂ = 0.20 on a true statement is not unsure, they are wrong and fairly sure of it.

**Analytics are never actionable mid-sitting.** The Lens is a results-screen control. Showing a running signed score while answers can still change lets a child tune their next confidence report against it, which attacks the strictly-proper rule the whole instrument rests on.

**A child can stop.** Ending early records `abandoned` and keeps every answer given. The store is append-only, so a short sitting is a *complete record of fewer items*, not a damaged one — and feeling trapped in an instrument produces endurance data, not belief data.

**Thin evidence says so.** A concept seen once is drawn hollow and marked provisional everywhere it appears. At 15 items across ten concepts most concepts *are* provisional; the fingerprint is a screen, not a verdict, and it says so rather than overclaiming.

**One deliberate exception to "no PII."** A teacher may attach a child's real name for a parents' evening. It is teacher-scoped, clearable in one call, and excluded from every research export by column allow-list — with a test that writes a name and asserts it appears in none of the CSVs.

---

## Status against the plan

| Phase | State |
|-------|-------|
| **0 — Foundations** | **Done.** Stack, twin-ready data model, tuned parameters, 44-item calibrated seed bank, consent/ethics documented. **Open:** textbook chapter mapping still needs your confirmation — see `docs/concept-taxonomy.md`. |
| **1 — Core MVP** | **Done.** Code login, balanced fixed form, signed-certainty capture + client RT, server-side scoring, append-only store, console + CSV export, one-click LAN deployment. |
| **2 — Adaptivity + game** | **Done.** Beta-Bernoulli tracking, twin/sibling probing, stopping rules, style meter + Town-Hall progression + growth/calibration boards, live RT gates, full teacher dashboard. |
| **3 — Twin-Δ & CDM** | **Built & tested.** `twin_delta.py`, `cdm.py`, authored twins, and `/api/research/twin-delta` are live. **Awaiting collected data** — see `docs/research.md`. |
| **4 — IRT / item generation** | **Not started, by design.** Auto-generation stays gated on QC. |

### Since the plan was written

| Added | Why |
|---|---|
| **Six-point signed scale** | Four bands gave the hedge no resolution; six separates "fairly sure" from "guessing" while keeping the Brier rule strictly proper (a test sweeps every band and proves truthful reporting wins). |
| **RANGE warm-up** | The first items of a sitting were being spent learning the interface. Optional, non-assessed, and deliberately built from content outside the Q-matrix. |
| **Activity history** | Sessions, time in the test, time on RANGE, and a total-grind title — effort kept structurally apart from attainment. |
| **PTM report card** | `/report/<code>` — one student, framed for a parent rather than a researcher, print-styled for A4. |
| **Console *How to read this*** | Every statistic with what moves it *and* how it can mislead you, plus the full four-cell rubric. A number a teacher cannot interpret is worse than no number. |
| **Code recovery** | An anonymous instrument has no email to reset against. Three layers: codes remembered per device, a PIN that guards them on shared machines, and teacher-side PIN reset. |

---

## Stack

**FastAPI · SQLModel/SQLite (WAL)** backend · **React (Vite + TS)** frontend · single-host LAN deployment *(plan §3)*.

Analytics stay in Python on purpose: the scoring engine, mastery model, twin-Δ, and cognitive-diagnosis work all share one language with the research pipeline.

---

## Docs

| Document | Covers |
|----------|--------|
| [`scoring-engine.md`](docs/scoring-engine.md) | The measurement model |
| [`concept-taxonomy.md`](docs/concept-taxonomy.md) | Strands, axes, Q-matrix, twins |
| [`metrics-and-api.md`](docs/metrics-and-api.md) | Every metric, every endpoint |
| [`deployment.md`](docs/deployment.md) | Running it in the lab |
| [`research.md`](docs/research.md) | Twin-Δ and DINA/DINO |
| [`ethics-consent.md`](docs/ethics-consent.md) | Minors, consent, retention |
