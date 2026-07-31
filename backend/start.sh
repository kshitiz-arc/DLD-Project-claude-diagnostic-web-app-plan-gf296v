#!/usr/bin/env bash
# One-command single-host start (plan §9). Builds the frontend to static
# assets, then serves API + app from one uvicorn worker bound to the LAN.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"

# 1) analytical core + backend deps
pip install -e "$root" >/dev/null
pip install -r "$here/requirements.txt" >/dev/null

# 2) build the frontend (served by FastAPI from frontend/dist)
if [ -d "$root/frontend" ]; then
  ( cd "$root/frontend" && npm install && npm run build )
fi

# 3) serve. Single worker sidesteps SQLite multi-process write contention.
export HYPERION_DB="${HYPERION_DB:-$here/hyperion.db}"
cd "$here"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
