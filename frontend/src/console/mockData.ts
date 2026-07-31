// Deterministic mock cohort for the teacher console. Anonymous codes only
// (no PII). Replaced by real API data in deployment; seeded here so the
// dashboard renders identically every load.
import type { DiagnosticCell } from "../scoring";

export const CONCEPTS = [
  "Integers", "Fractions", "Ratio & %", "Algebra", "Equations",
  "Exponents", "Lines & Angles", "Triangles", "Mensuration", "Data Handling",
];

const ANIMALS = [
  "KESTREL", "FALCON", "OTTER", "LYNX", "MOTH", "HERON", "VIPER", "CRANE",
  "SABLE", "WREN", "ORYX", "TERN", "IBIS", "MERLIN", "FINCH", "ROOK",
  "GULL", "HARE", "JAY", "KITE", "LARK", "MOLE", "NEWT", "OWL",
];
const COLORS = ["var(--admin)", "var(--r-a)", "var(--gap)", "var(--secure)", "var(--fragile)", "var(--gold)"];

export interface Student {
  code: string; av: string; avc: string; section: string;
  attempted: number; completion: number; invalid: number; cal: number;
  cells: Record<DiagnosticCell, number>; vec: number[]; sbar: number;
}

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/* The offline stand-in.
 *
 * It has to agree with the real thing, or the console tells two different
 * stories depending on whether the LAN is up. Earlier this produced 10-12
 * attempted items when a sitting is 35, and up to 42% rushed when real data
 * runs nearer 14% — numbers a teacher would reasonably have believed.
 *
 * So it mirrors the server's generative model rather than inventing
 * statistics: a latent ability, a per-concept offset, a calibration bias, and
 * a separate misconception-proneness. Cells are then *consequences* of those,
 * which is what keeps the four of them mutually consistent.
 */
function makeStudents(section: string, n: number, seed: number): Student[] {
  const rnd = mulberry32(seed);
  // Same section ordering the seeded cohort has: A ahead, C behind.
  const shift = section === "A" ? 0.09 : section === "C" ? -0.09 : 0;
  const out: Student[] = [];
  for (let i = 0; i < n; i++) {
    const ability = clamp(0.62 + shift + (rnd() - 0.5) * 0.46, 0.2, 0.97);
    const cal = (rnd() - 0.45) * 0.55;              // >0 over-confident
    const miscProne = rnd() * 0.5;                  // concept-specific in reality

    // Most sittings run to the 35-item cap; a few end early or are abandoned.
    const attempted = rnd() < 0.78 ? 35 : 12 + Math.floor(rnd() * 22);
    const completion = clamp(attempted / 35, 0.3, 1);
    // Rushed answers: usually a handful, occasionally a child tapping through.
    const invalid = clamp(rnd() * rnd() * 0.34 + 0.03, 0.02, 0.36);

    const valid = Math.max(1, Math.round(attempted * (1 - invalid)));
    const correct = Math.round(valid * ability);
    const wrong = valid - correct;

    // Of the correct answers, how many were said with conviction.
    const secShare = clamp(0.42 + ability * 0.45 + cal * 0.35, 0.15, 0.94);
    const secure = Math.round(correct * secShare);
    const fragile = correct - secure;

    // Of the wrong ones, how many were a held belief rather than a blank.
    const wrongConf = clamp(miscProne + cal * 0.7, 0.04, 0.75);
    const misc = Math.round(wrong * wrongConf);
    const gap = wrong - misc;

    const vec: number[] = [];
    for (let c = 0; c < 10; c++) vec.push(clamp(ability + (rnd() - 0.5) * 0.42, 0.05, 0.99));

    const name = `${ANIMALS[i % ANIMALS.length]}·${1 + Math.floor(rnd() * 9)}${section}${10 + Math.floor(rnd() * 90)}`;
    out.push({
      code: name, av: name.slice(0, 2).toUpperCase(), avc: COLORS[i % COLORS.length], section,
      attempted, completion, invalid, cal,
      cells: { SECURE: secure, FRAGILE: fragile, GAP: gap, MISCONCEPTION: misc },
      // Signed Brier mean: strongly positive for a secure child, negative only
      // for one who is confidently wrong more often than not.
      vec, sbar: clamp(ability * 1.9 - 0.85 - Math.max(0, cal) * 0.45, -0.6, 0.98),
    });
  }
  return out;
}

export const SECTIONS: Record<string, Student[]> = {
  A: makeStudents("A", 21, 101),
  B: makeStudents("B", 21, 202),
  C: makeStudents("C", 21, 303),
};
export const ALL: Student[] = [...SECTIONS.A, ...SECTIONS.B, ...SECTIONS.C];

export interface Hotspot { html: string; concept: string; rate: number; }
export const HOTSPOTS: Hotspot[] = [
  { html: "The product of two negative integers is <b>negative</b>.", concept: "Integers", rate: 0.41 },
  { html: '<span class="mfrag">2³</span> means <span class="mfrag">2 × 3</span>.', concept: "Exponents", rate: 0.38 },
  { html: "Doubling the side of a square <b>doubles</b> its area.", concept: "Mensuration", rate: 0.34 },
  { html: '<span class="mfrag">½ + ⅓ = ⅖</span>.', concept: "Fractions", rate: 0.29 },
  { html: '<span class="mfrag">2x</span> and <span class="mfrag">2</span> are <b>like terms</b>.', concept: "Algebra", rate: 0.24 },
  { html: "The perimeter of a rectangle is <b>length × breadth</b>.", concept: "Mensuration", rate: 0.19 },
  { html: "A triangle can have <b>two right angles</b>.", concept: "Triangles", rate: 0.14 },
];

export type StatusKey = "secure" | "fragile" | "misc" | "low";
export const STATUS_LABEL: Record<StatusKey, string> = { secure: "On track", fragile: "Fragile", misc: "Misconception", low: "Low data" };

export function statusOf(s: Student): StatusKey {
  const att = s.attempted;
  const m = s.cells.MISCONCEPTION / att;
  const fr = s.cells.FRAGILE / att;
  if (s.invalid > 0.28 || s.completion < 0.62) return "low";
  if (m >= 0.22) return "misc";
  if (fr >= 0.34) return "fragile";
  return "secure";
}
