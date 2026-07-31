# HYPERION Backend (FastAPI + SQLModel + SQLite)

The single-host LAN server (plan §3, §9). It provisions identities, selects and
delivers items, records the **append-only response event-store**, exports the
research dataset, and serves the built React app — all from one process. Every
response is scored server-side by the `diagnostic_scoring` engine (the source
of truth), never re-implemented here.

## Run

```bash
# from repo root: install the engine, then backend deps
pip install -e .
pip install -r backend/requirements.txt

# dev
cd backend && uvicorn app.main:app --reload --port 8000

# the lab: builds the frontend, opens the firewall, serves everything
backend\start.bat        # Windows      (backend/start.sh elsewhere)
```

Tests: `cd backend && pytest` — 47 passing, covering identity and admin
gating, the fixed form, the adaptive selector, the RT gate, resume, console
scoping, the boards, the exports, and the rebuild-equals-live-projection
invariant. See [`../docs/deployment.md`](../docs/deployment.md) for the lab
runbook and every environment override.

## Modules

| Module | Plan | Responsibility |
|---|---|---|
| `main.py` | §3–§12 | The API surface, console aggregates, exports, ops, `/lan` |
| `models.py` | §4 | `Student` · `TeacherAccount` · `Concept` · `Item` · `Session` · **`Response`** · `ConceptState` |
| `itembank.py` | §7 | The **authored bank** — 44 tagged statements, sibling groups, twins, per-item RT floors, plus `validate_bank()` QC |
| `adaptive.py` | §6 | Twin→sibling→concept probing, variance-driven selection, stopping reasons, per-concept budget |
| `state.py` | §4, §5.5 | Write-through `concept_state` projection **and** its rebuild from the log |
| `seed.py` | §7 | Concepts, bank load with twin ids, synthetic demo cohort |
| `db.py` | §3, §9 | WAL engine, additive migration guard, online backups |
| `lan.py` | §9 | LAN address discovery and the offline QR code |

## Data model (plan §4)

The `Response` table is the append-only event-store and the research dataset:
every attempt is stored with its full context and server-computed diagnostic
payload, including `twin_id`/`form` (Phase-3 Δ), `axis`, both proper scores, and
the RT floor it was judged against. `ConceptState` is a **derived cache** —
`POST /api/admin/rebuild-state` recomputes it from the log, and a test asserts
the rebuild reproduces the live projection exactly.

SQLite runs in **WAL** with a busy timeout; `init_db()` additively migrates an
existing `.db` so a pilot never loses data to a schema addition. Migration to
Postgres remains a config change.

## API

Full surface in [`../docs/metrics-and-api.md`](../docs/metrics-and-api.md);
interactive docs at `/docs` while running.

Ground truth never leaves the server: items are delivered truthless and the
client posts back a choice, so the diagnostic can't be reverse-engineered from
the wire. Console and export endpoints require `x-teacher-token` (scope is read
from the account behind it, never from the URL); admin endpoints require
`x-admin-passcode`, which defaults to `hyperion` and **must be changed before a
pilot**. Demo data seeds unless `HYPERION_SEED_DEMO=0`.
