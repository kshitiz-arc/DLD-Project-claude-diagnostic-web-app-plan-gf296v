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
![Tests](https://img.shields.io/badge/tests-111_passing-3fb950?style=flat-square)
![No PII](https://img.shields.io/badge/data-no_PII-6f42c1?style=flat-square)
![Air-gapped](https://img.shields.io/badge/deploy-air--gapped_LAN-8957e5?style=flat-square)

[The idea](#the-idea) · [Quick start](#quick-start) · [A sitting, step by step](#a-sitting-step-by-step) · [Design decisions](#design-decisions-worth-knowing) · [Status](#status-against-the-plan) · [Docs](#docs)

</div>

---

## The idea

HYPERION measures. It records a student's answer *and* their stated certainty, then holds apart two quantities that assessment tools usually blur together.

> [!IMPORTANT]
> **Two scores, never one.** One response yields an internal **signed diagnostic score** — a strictly-proper Brier rule that drives every analytic — and a separate, floored **XP currency** that drives the game layer. The two are never conflated, so gamification cannot corrupt the measurement. *(plan §1.1)*

The result is a ten-dimensional mastery fingerprint, one per student, routed to the teacher. The scope boundary is deliberate and enforced end to end (plan §1 / §7): **diagnosis only — no lessons, no hints, no remediation.**

---

## Repository map

| Path | What it is |
|------|------------|
| **`src/diagnostic_scoring/`** | **Analytical core** — pure-Python, dependency-free. Proper scoring, the 2×2 diagnostic cell, the RT validity gate, Beta-Bernoulli mastery, aggregation, the twin-Δ estimator, and DINA/DINO over a Q-matrix. The source of truth for analytics. |
| **`tests/`** | 64-test suite: pins the §5.2 worked values, proves the Brier rule is strictly proper, and recovers DINA parameters from simulated data. |
| **`backend/`** | **FastAPI · SQLModel · SQLite (WAL)** — identity, adaptive item delivery, the append-only event-store, server-side scoring, a role-scoped console, CSV research exports, backups, and the LAN join page. 47 tests. |
| **`backend/app/itembank.py`** | The **authored item bank** — 44 tagged statements across 10 strands, with sibling groups and canonical/perturbed twins. One source of truth; the frontend mirror is generated. |
| **`frontend/`** | **React · Vite · TS** — sign-in gate, scale-anchoring onboarding, the diagnostic HUD, and the live teacher console. Builds to static assets served by FastAPI. |
| **`prototypes/`** | Self-contained interactive HTML prototypes of every screen — the design reference. |
| **`docs/`** | Scoring engine, concept taxonomy, metrics & API, deployment, research layer, ethics. |

---

## Quick start

```bash
# Analytical core
pip install -e ".[dev]" && pytest        # 64 passing

# Backend
pip install -r backend/requirements.txt
cd backend && pytest                     # 47 passing

# The whole thing, as it runs in the lab
backend\start.bat                        # Windows   (backend/start.sh elsewhere)
```

Once it's up:

| Who | Where |
|-----|-------|
| Students | `http://<laptop-ip>:8000` |
| Projector (join screen) | `http://localhost:8000/lan` |
| Teacher | `http://localhost:8000/console` |

---

## A sitting, step by step

1. **Sign in.** Students self-create an anonymous code — no PII, ever. Teachers use an admin-issued ID; the admin issues those.
2. **Onboarding.** One practice item anchors what *"somewhat"* means — a measurement control, since twelve-year-olds read the hedge bins inconsistently.
3. **Adaptive delivery.** Items are chosen to shrink uncertainty fastest. A confident-wrong answer triggers a deeper probe: first the item's **perturbed twin**, then its **sibling sub-skill**, then the **concept**. Budgets cap both the sitting and any single concept, so the fingerprint stays ten-dimensional.
4. **Server-side scoring.** Items ship without ground truth. Each response yields a Brier reward, a log score, a diagnostic cell, and an RT validity verdict against that item's own reading floor.
5. **Stopping** on convergence, cap, or exhaustion — with the reason recorded.
6. **The console** shows concept heat, ranked confident-wrong hotspots, and a per-student record. CSV exports carry everything needed for offline analysis.

---

## Design decisions worth knowing

**Confident-wrong is the product, not the failure.** It's what separates a hardened misconception from a plain knowledge gap. Both the scoring and the adaptivity are built around isolating that one cell.

**The leaderboard is a validity threat.** So there is no raw-score board. The calibration, growth, and effort boards reward exactly the behaviours that produce clean data — and rushing earns nothing.

**The event-store is the truth.** `concept_state` is a write-through cache, fully rebuildable from the log; a test asserts the rebuild reproduces it exactly.

**Invalid responses are holes, not zeros.** A rushed answer moves no posterior, earns no XP, and enters no estimate.

**Nothing external loads.** No CDN, no web fonts, no outbound calls. The lab may be fully air-gapped.

---

## Status against the plan

| Phase | State |
|-------|-------|
| **0 — Foundations** | **Done.** Stack, twin-ready data model, tuned parameters, 44-item calibrated seed bank, consent/ethics documented. **Open:** textbook chapter mapping still needs your confirmation — see `docs/concept-taxonomy.md`. |
| **1 — Core MVP** | **Done.** Code login, balanced fixed form, signed-certainty capture + client RT, server-side scoring, append-only store, console + CSV export, one-click LAN deployment. |
| **2 — Adaptivity + game** | **Done.** Beta-Bernoulli tracking, twin/sibling probing, stopping rules, style meter + Town-Hall progression + growth/calibration boards, live RT gates, full teacher dashboard. |
| **3 — Twin-Δ & CDM** | **Built & tested.** `twin_delta.py`, `cdm.py`, authored twins, and `/api/research/twin-delta` are live. **Awaiting collected data** — see `docs/research.md`. |
| **4 — IRT / item generation** | **Not started, by design.** Auto-generation stays gated on QC. |

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
