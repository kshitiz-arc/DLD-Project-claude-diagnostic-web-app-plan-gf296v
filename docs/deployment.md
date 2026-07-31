# Running HYPERION in the lab (plan §9)

One laptop runs the whole system. Lab PCs open a URL. Nothing needs the
internet — during a sitting, nothing *should* touch it.

```
   your laptop                          lab PCs
 ┌──────────────┐   Wi-Fi hotspot     ┌───────────┐
 │ uvicorn      │  or LAN switch      │ browser   │
 │ FastAPI+SQLite ├───────────────────┤ http://<ip>:8000
 │ frontend/dist│                     └───────────┘
 └──────────────┘
```

## Start it

```bat
backend\start.bat
```

That script installs dependencies, builds the frontend to static assets,
adds the firewall rule, prints the join addresses, and serves everything from
**one** uvicorn worker. A single worker is deliberate: it sidesteps SQLite
multi-process write contention entirely, and one async worker handles ~30
students comfortably.

`backend/start.sh` is the same flow for macOS/Linux.

### Environment overrides

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `8000` | Port to serve on |
| `HYPERION_ADMIN_PASSCODE` | `hyperion` | Admin gate — **change before a pilot** |
| `HYPERION_SEED_DEMO` | `1` | Synthetic demo cohort; set `0` for a real sitting |
| `HYPERION_DB` | `hyperion.db` | Database file |
| `HYPERION_BACKUP_MINUTES` | `15` | Snapshot interval; `0` disables |
| `HYPERION_BACKUP_KEEP` | `24` | Snapshots retained before pruning |
| `HYPERION_SESSION_CAP` | `12` | Items per sitting (fatigue ceiling, plan §6) |
| `HYPERION_CONCEPT_CAP` | `3` | Items per concept per sitting |
| `HYPERION_VARIANCE_STOP` | `0.02` | Per-concept convergence threshold |
| `HYPERION_OPEN_CONSOLE` | `0` | `1` drops the teacher-token requirement (demo only) |

## Getting the students connected

**Windows Mobile Hotspot** — fully self-contained, best for a controlled
pilot. Settings → Network & Internet → Mobile hotspot → on. Lab PCs join that
Wi-Fi network. Works with no school network and no internet at all.

**Shared LAN** — required if the lab PCs are Ethernet-only. Put the laptop and
the PCs on the same switch/subnet.

Either way, `start.bat` prints every reachable address. Put
**`http://localhost:8000/lan`** on the projector: it shows the join URL in
large type plus a QR code, rendered entirely offline.

### Firewall

`start.bat` tries to add the inbound rule itself. If it reports that it
couldn't, run it once as Administrator, or add the rule by hand:

```bat
netsh advfirewall firewall add rule name="HYPERION 8000" dir=in action=allow ^
  protocol=TCP localport=8000 profile=private,domain
```

Windows blocks inbound connections on *public* networks by default. If lab PCs
can't reach the laptop, check that the hotspot/LAN connection is classified
**Private**, not Public.

## When something goes wrong mid-sitting

The design assumes it will. Every response is written to the append-only log
the moment it arrives, so the failure modes degrade rather than destroy:

| What happens | What the system does |
|---|---|
| A lab PC drops off the Wi-Fi | The client keeps measuring against its local bank copy; answers after the drop are scored client-side. |
| A child refreshes or their PC restarts | `session/start` **resumes** the open sitting — same session, same position, nothing re-asked. |
| The laptop crashes | Every answered item is already committed. Restart; students resume. |
| The database looks wrong | `POST /api/admin/rebuild-state` recomputes the derived table from the log. The log itself is never rewritten. |

### Backups

A snapshot is taken every 15 minutes into `backend/backups/` using SQLite's
online backup API — not a file copy, which can capture a torn state under WAL.
`POST /api/admin/backup` takes one immediately. To restore: stop the server,
copy the snapshot over `hyperion.db`, delete any `-wal`/`-shm` files, restart,
then run the rebuild endpoint.

**Copy `backend/backups/` off the laptop at the end of every session.** The
whole cohort lives on one machine until you do.

## Offline-safe assets

No CDN, no web fonts, no external scripts — anywhere. The React build is fully
local and the `/lan` page inlines its own CSS and SVG. This is not a
performance preference: the moment the hotspot has no internet, anything
external is a blank screen in front of thirty children.

## Pilot-day checklist

1. `HYPERION_SEED_DEMO=0` and a real `HYPERION_ADMIN_PASSCODE` set.
2. Consent/assent in place (see [ethics-consent.md](ethics-consent.md)).
3. `start.bat` run once as Administrator so the firewall rule exists.
4. One lab PC tested against the join URL *before* the class arrives.
5. `/lan` on the projector.
6. Teacher IDs issued from the admin gate; PINs written down (they are shown
   once).
7. After the sitting: export the CSVs from the console, copy `backups/` off
   the laptop.
