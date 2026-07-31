"""Mirror the authored item bank into the frontend's offline fallback.

The bank is authored once, in ``backend/app/itembank.py``. The client needs a
copy only for the offline path (plan §9: the lab may be air-gapped and the
laptop may drop off the network mid-session), so this generates a TypeScript
mirror rather than letting a second hand-maintained list drift out of sync.

    python backend/tools/export_bank.py          # write the mirror
    python backend/tools/export_bank.py --check  # verify it is current (CI/tests)

Ground truth *is* included in the mirror: it is only reachable on the offline
fallback path, where there is no server to score against. When the server is
up, items are delivered without their truth value and scoring is server-side.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "src"))

from app.itembank import BANK, STRANDS, validate_bank  # noqa: E402

TARGET = ROOT / "frontend" / "src" / "session" / "bank.generated.ts"

HEADER = """// GENERATED FILE — do not edit by hand.
// Source: backend/app/itembank.py  ·  regenerate: python backend/tools/export_bank.py
//
// The offline fallback copy of the authored item bank (plan §7, §9). When the
// server is reachable, items arrive from /api/session/next *without* their
// ground truth and are scored server-side; this mirror exists only so a lab PC
// that loses the uplink mid-session can keep measuring.

export interface BankItem {
  statement: string;   // [ ... ] fragments render monospace
  truth: boolean;
  strand: string;
  axis: string;
  difficulty: number;
  minReadMs: number;   // per-item RT validity floor (plan §5.4)
  siblingGroup: string;
  form: "standalone" | "canonical" | "perturbed";
}

export const STRANDS: string[] = [
"""


def ts_string(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def render() -> str:
    validate_bank()
    out = [HEADER]
    out += [f"  {ts_string(s)},\n" for s in STRANDS]
    out.append("];\n\nexport const BANK: BankItem[] = [\n")
    for i in BANK:
        out.append(
            "  { statement: %s, truth: %s, strand: %s, axis: %s, difficulty: %s, "
            "minReadMs: %d, siblingGroup: %s, form: %s },\n"
            % (ts_string(i.text), "true" if i.truth else "false", ts_string(i.strand),
               ts_string(i.axis), f"{i.difficulty:g}", i.min_read_ms,
               ts_string(i.sibling_group), ts_string(i.form))
        )
    out.append("];\n")
    return "".join(out)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="exit 1 if the mirror is stale")
    args = ap.parse_args()
    content = render()
    if args.check:
        current = TARGET.read_text(encoding="utf-8") if TARGET.exists() else ""
        if current != content:
            print(f"stale: {TARGET.relative_to(ROOT)} — run python backend/tools/export_bank.py")
            return 1
        print("item bank mirror is current")
        return 0
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(content, encoding="utf-8")
    print(f"wrote {TARGET.relative_to(ROOT)} ({len(BANK)} items)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
