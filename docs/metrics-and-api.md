# Metrics catalogue & API surface (plan §11)

"Whatever metric is necessary" resolves to the following. Every figure below is
computed from the append-only event-store, so any of it can be recomputed at
any time from the raw log.

## Per item — one `responses` row

| Metric | Field | Plan |
|---|---|---|
| Response option | `response_option` (AT/ST/SF/AF) | §5.1 |
| Direction correct | `direction_correct` | §5.3 |
| Confidence high | `confidence_high` | §5.3 |
| Diagnostic cell | `diagnostic_cell` (Secure/Fragile/Gap/Misconception) | §5.3 |
| Signed Brier reward | `brier_reward` ∈ [−1, +1] | §5.2 |
| Logarithmic score | `log_score` (research-grade alternative) | §5.2 |
| Response time | `response_time_ms` — **client-measured** | §5.4 |
| RT floor applied | `t_min_ms` — per item, from statement length | §5.4 |
| RT validity | `rt_valid` | §5.4 |
| Item position | `position_in_session` | §11 |
| Probe flag | `probe` — served by misconception probing | §6 |
| Twin linkage | `twin_id`, `form` | §12 |
| Tags | `strand`, `axis` | §7 |

Response time is measured client-side between item render and submit, so
network latency never contaminates a cognitive measurement; `server_received_at`
is the cross-check.

## Per concept × student — one `concept_state` row

| Metric | Field |
|---|---|
| Mastery posterior | `mastery_alpha`, `mastery_beta`, `mastery_mean`, `mastery_var` |
| Calibrated proficiency (s̄) | `calibrated_proficiency` |
| Calibration bias | `calibration_bias` — sign gives over/under-confidence |
| Misconception density | `misconception_density` |
| Fluency | `mean_rt_ms` over valid responses |
| Data quality | `n_valid`, `n_invalid` |
| Game layer | `xp`, `level` — cosmetic, never read back into a diagnostic |

`concept_state` is a **write-through cache**, not a second source of truth.
`POST /api/admin/rebuild-state` recomputes it from `responses`; a test asserts
the rebuild reproduces the live projection exactly.

## Per student

The 10-dimensional concept-mastery **fingerprint**, a global calibration
profile, a speed–accuracy profile, and the confident-wrong list with the
teacher-facing note for each item. Unseen concepts report the prior (0.5), not
zero — no evidence is not evidence of failure.

## Per session

Mode (fixed/adaptive), items served, `stop_reason` (`cap` / `converged` /
`exhausted`), `probes_served`, and the share of invalid-RT responses.

## Adaptivity

Which concepts triggered probing, per-concept posterior-variance convergence,
and the stopping reason — all in the session summary.

## Research (Phase 3)

Canonical vs perturbed scores, the reification gap Δ with its interval, and the
difference-in-differences estimator across collection waves. See
[research.md](research.md).

---

# API surface

Interactive docs are served at `/docs` when the server is running.

## Student

| Endpoint | Purpose |
|---|---|
| `POST /api/student/create` | Self-create an anonymous code (+ optional PIN) |
| `POST /api/student/login` | Return with a code; reports `onboarded` |
| `POST /api/student/onboarded` | Record that the scale tutorial was shown (§8) |
| `POST /api/session/start` | Start **or resume** a sitting (§9) |
| `POST /api/session/next` | Next item — delivered **without ground truth** |
| `POST /api/response` | Submit an answer; scored server-side |
| `GET /api/session/{id}/summary` | Cells, progression, convergence, stop reason |
| `GET /api/leaderboard` | `calibration` \| `growth` \| `effort` boards (§8) |

Items are never delivered with their truth value, and scoring never happens on
a machine a student controls.

## Teacher (requires `x-teacher-token`)

| Endpoint | Purpose |
|---|---|
| `GET /api/console/cohort` | Role-scoped aggregate: KPIs, roster, concept heat |
| `GET /api/console/hotspots` | Confident-wrong clusters, ranked |
| `GET /api/console/student/{code}` | Full per-student record + reification gap |
| `GET /api/export/responses.csv` | The event-store, scoped to their sections |
| `GET /api/export/concept-state.csv` | Derived per concept × student table |

Scope is resolved from the account behind the token, never from a query
parameter — a class teacher cannot widen their own view by editing a URL.

## Admin (requires `x-admin-passcode`)

| Endpoint | Purpose |
|---|---|
| `POST /api/admin/issue-teacher` | Mint a Teacher ID + PIN |
| `GET /api/export/items.csv` | The bank **with ground truth** — never served to a client |
| `GET /api/research/twin-delta` | Reification gap Δ, cohort and per concept |
| `POST /api/admin/backup` | Immediate consistent snapshot |
| `POST /api/admin/rebuild-state` | Recompute `concept_state` from the log |

## Open

`GET /api/health` · `GET /lan` (projector join page) · `/docs`
