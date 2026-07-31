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

function makeStudents(section: string, n: number, seed: number): Student[] {
  const rnd = mulberry32(seed);
  const out: Student[] = [];
  for (let i = 0; i < n; i++) {
    const ability = clamp(0.3 + rnd() * 0.62 + (rnd() - 0.5) * 0.1, 0.18, 0.97);
    const cal = (rnd() - 0.35) * 0.6;
    const attempted = 10 + Math.floor(rnd() * 3);
    const completion = clamp(0.62 + rnd() * 0.4, 0.5, 1);
    const invalid = clamp(rnd() * rnd() * 0.4, 0, 0.42);
    const correct = Math.round(ability * attempted);
    const wrong = attempted - correct;
    const secShare = clamp(0.35 + ability * 0.6 - Math.max(0, -cal) * 0.5, 0.1, 0.95);
    const secure = Math.round(correct * secShare);
    const fragile = correct - secure;
    const wrongConf = clamp(0.28 + cal * 1.4, 0.05, 0.92);
    const misc = Math.round(wrong * wrongConf);
    const gap = wrong - misc;
    const vec: number[] = [];
    for (let c = 0; c < 10; c++) vec.push(clamp(ability + (rnd() - 0.5) * 0.4, 0.05, 0.99));
    const name = `${ANIMALS[i % ANIMALS.length]}·${1 + Math.floor(rnd() * 9)}${section}`;
    out.push({
      code: name, av: name.slice(0, 1) + (1 + Math.floor(rnd() * 9)), avc: COLORS[i % COLORS.length], section,
      attempted, completion, invalid, cal,
      cells: { SECURE: secure, FRAGILE: fragile, GAP: gap, MISCONCEPTION: misc },
      vec, sbar: clamp(ability * 1.7 - 0.72 - Math.max(0, cal) * 0.5, -0.6, 0.98),
    });
  }
  return out;
}

export const SECTIONS: Record<string, Student[]> = {
  A: makeStudents("A", 24, 101),
  B: makeStudents("B", 22, 202),
  C: makeStudents("C", 20, 303),
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
