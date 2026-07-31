// Session-layer view of the item bank.
//
// The bank itself is authored in `backend/app/itembank.py` and mirrored into
// `bank.generated.ts` by `python backend/tools/export_bank.py` — one source of
// truth, no hand-maintained second copy. This module adds only the *display*
// mapping the HUD needs (symbols, arsenal grouping, rank ladder).
import { BANK, type BankItem } from "./bank.generated";

export type Item = BankItem;

export const CONCEPT_SYMBOL: Record<string, string> = {
  Integers: "s-int",
  Fractions: "s-frac",
  "Ratio & %": "s-ratio",
  Algebra: "s-alg",
  Equations: "s-eq",
  Exponents: "s-exp",
  "Lines & Angles": "s-ang",
  Triangles: "s-tri",
  Mensuration: "s-mens",
  "Data Handling": "s-data",
};

/** The offline fallback form: breadth-first across strands, mirroring the
 *  server's fixed form (backend `fixed_form`) so an uplink drop doesn't change
 *  which instrument the child is taking. */
export const ITEMS: Item[] = (() => {
  const byStrand = new Map<string, Item[]>();
  for (const item of [...BANK].sort((a, b) => Number(a.form === "perturbed") - Number(b.form === "perturbed"))) {
    const list = byStrand.get(item.strand) ?? [];
    list.push(item);
    byStrand.set(item.strand, list);
  }
  const order = [...byStrand.keys()];
  const out: Item[] = [];
  for (let depth = 0; out.length < 12 && order.some((s) => (byStrand.get(s)?.length ?? 0) > depth); depth++) {
    for (const strand of order) {
      if (out.length >= 12) break;
      const list = byStrand.get(strand)!;
      if (list.length > depth) out.push(list[depth]);
    }
  }
  return out;
})();

export interface Arm {
  name: string;
  symbol: string;
  accent: string;
}

export const ARSENAL: Arm[] = [
  { name: "Integers", symbol: "s-int", accent: "var(--r-c, #5a86c9)" },
  { name: "Fractions", symbol: "s-frac", accent: "var(--admin)" },
  { name: "Ratio & %", symbol: "s-ratio", accent: "var(--misc)" },
  { name: "Algebra", symbol: "s-alg", accent: "var(--teach)" },
  { name: "Geometry", symbol: "s-tri", accent: "var(--secure)" },
];

// map a strand to its arsenal index
export const STRAND_TO_ARM: Record<string, number> = {
  Integers: 0,
  Fractions: 1,
  "Ratio & %": 2,
  Algebra: 3,
  Equations: 3,
  Exponents: 3,
  "Lines & Angles": 4,
  Triangles: 4,
  Mensuration: 4,
};

/** Render [ ... ] fragments as monospace spans. Returns HTML for dangerouslySet. */
export function renderStatement(s: string): string {
  return s.replace(/\[(.*?)\]/g, '<span class="mfrag">$1</span>');
}

export const RANKS = [
  { k: "D", name: "DIALING IN", color: "var(--r-d, #6d7f9e)" },
  { k: "C", name: "CLICKING", color: "var(--r-c, #5a86c9)" },
  { k: "B", name: "BLAZING", color: "var(--admin)" },
  { k: "A", name: "ACING", color: "var(--misc)" },
  { k: "S", name: "SHARP", color: "var(--r-s, #ff5a3c)" },
  { k: "SS", name: "STELLAR", color: "var(--r-ss, #ff9d1e)" },
  { k: "SSS", name: "SCHOLAR SUPREME", color: "var(--r-sss, #ffd84a)" },
];
export const HEAT_MAX = 700;
export const TIER = HEAT_MAX / RANKS.length;
