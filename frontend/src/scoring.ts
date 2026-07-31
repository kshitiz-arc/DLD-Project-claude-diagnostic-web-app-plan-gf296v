// Client-side mirror of the Python scoring engine (src/diagnostic_scoring).
// The Python package is the source of truth for research/analytics; this TS
// copy exists only so the student UI can score instantly and offline. Keep the
// two in sync — the worked values (§5.2) are identical by construction.

// Six-point signed-certainty scale — three bands either side, no midpoint.
// A 50/50 option would be a free dodge and carries no direction, so it could
// never populate the confident-wrong cell, which is the product (§5.3).
export type ResponseOption = "AT" | "MT" | "ST" | "SF" | "MF" | "AF";
export type DiagnosticCell = "SECURE" | "FRAGILE" | "GAP" | "MISCONCEPTION";

const P2 = 0.62;
const P3 = 0.80;
const P4 = 0.95;
export const T_MIN_MS = 800;

const PHAT: Record<ResponseOption, number> = {
  AT: P4,
  MT: P3,
  ST: P2,
  SF: 1 - P2,
  MF: 1 - P3,
  AF: 1 - P4,
};
const TRUE_SIDE: Record<ResponseOption, boolean> = {
  AT: true, MT: true, ST: true, SF: false, MF: false, AF: false,
};
// The outer *two* bands per side count as confident. "Mostly False" on a true
// statement is p̂ = 0.20 — a wrong belief held fairly firmly, not an absence of
// one, so it must reach MISCONCEPTION rather than hide in GAP.
const CONFIDENT: Record<ResponseOption, boolean> = {
  AT: true, MT: true, MF: true, AF: true, ST: false, SF: false,
};

/** Signed Brier reward on [-1, +1] (plan §5.2). */
export function brierReward(r: ResponseOption, groundTruth: boolean): number {
  const y = groundTruth ? 1 : 0;
  return 1 - 2 * (PHAT[r] - y) ** 2;
}

export function directionCorrect(r: ResponseOption, groundTruth: boolean): boolean {
  return TRUE_SIDE[r] === groundTruth;
}

export function classifyCell(r: ResponseOption, groundTruth: boolean): DiagnosticCell {
  const correct = directionCorrect(r, groundTruth);
  const confident = CONFIDENT[r];
  if (correct) return confident ? "SECURE" : "FRAGILE";
  return confident ? "MISCONCEPTION" : "GAP";
}

/** Strength of belief in the chosen side, in [0.5, 1). */
export function confidenceStrength(r: ResponseOption): number {
  return Math.max(PHAT[r], 1 - PHAT[r]);
}

/** Visible, floored XP currency — never conflated with the signed score (§8). */
export function xpItem(brier: number, difficulty: number, k = 100): number {
  return Math.max(0, Math.floor(k * ((brier + 1) / 2) * difficulty));
}

export function rtValid(responseTimeMs: number, tMin = T_MIN_MS): boolean {
  return responseTimeMs >= tMin;
}
