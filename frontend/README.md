# HYPERION Frontend (React + Vite + TypeScript)

The client for the Class 7 Maths diagnostic. Built to static assets and served
by FastAPI on the LAN (plan §3, §9). **No CDN, no web fonts, no external
request of any kind** — the lab may be fully air-gapped.

## Screens

| Route | File | What it is |
|---|---|---|
| `/` | `pages/Gate.tsx` | Sign-in gate — the three provisioning flows (plan §5.i, §10): students self-create an anonymous code, teachers use an admin-issued ID, the admin issues those IDs. |
| `/session` | `session/Session.tsx` | The diagnostic HUD: signed-certainty spectrum, per-item reading-time gate, style meter, Town-Hall progression, and the multi-board results screen. |
| — | `session/Tutorial.tsx` | One-item onboarding that anchors what "somewhat" means (plan §8) — a measurement control, not decoration. The practice answer is never recorded. |
| `/console` | `console/Console.tsx` | Role-scoped teacher console: KPIs, concept heat, ranked misconception hotspots, roster, per-student record, CSV export. |

## How it talks to the server

`src/api.ts` is the typed client. Teacher login mints a token that is attached
to every console/export call; the server resolves scope from the account behind
it, so the UI can't widen its own view.

**Offline tolerance is a contract, not a fallback.** If the uplink drops the
session keeps measuring against `session/bank.generated.ts` and scores with
`src/scoring.ts`, the client mirror of the Python engine. When the server is
reachable, items arrive *without* ground truth and all scoring is server-side.

The bank mirror is **generated** — never hand-edited:

```bash
python backend/tools/export_bank.py        # after editing backend/app/itembank.py
```

A backend test fails if the mirror drifts out of sync.

## Develop

```bash
npm install
npm run dev       # http://localhost:5173  (set VITE_API_BASE to reach a backend)
npm run build     # tsc -b && vite build -> dist/, served by FastAPI
npm run typecheck
```

The Python package in `../src/diagnostic_scoring` remains the source of truth
for analytics; `src/scoring.ts` mirrors its worked values (§5.2) by
construction.
