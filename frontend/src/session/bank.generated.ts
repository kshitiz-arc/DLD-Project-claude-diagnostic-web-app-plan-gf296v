// GENERATED FILE — do not edit by hand.
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
  "Integers",
  "Fractions",
  "Ratio & %",
  "Algebra",
  "Equations",
  "Exponents",
  "Lines & Angles",
  "Triangles",
  "Mensuration",
  "Data Handling",
];

export const BANK: BankItem[] = [
  { statement: "The product of two negative integers, like [(-4) × (-5)], is a negative number.", truth: false, strand: "Integers", axis: "Structural sense", difficulty: 0.7, minReadMs: 1960, siblingGroup: "int.sign-product", form: "canonical" },
  { statement: "If [a] and [b] are positive whole numbers, then [(-a) × (-b)] is a negative number.", truth: false, strand: "Integers", axis: "Generalisation", difficulty: 0.8, minReadMs: 2140, siblingGroup: "int.sign-product", form: "perturbed" },
  { statement: "On the number line, [-7] lies to the left of [-3].", truth: true, strand: "Integers", axis: "Representation", difficulty: 0.6, minReadMs: 1690, siblingGroup: "int.order", form: "standalone" },
  { statement: "[-7] is greater than [-3], because [7] is greater than [3].", truth: false, strand: "Integers", axis: "Property reasoning", difficulty: 0.65, minReadMs: 1690, siblingGroup: "int.order", form: "standalone" },
  { statement: "Subtracting a negative number, as in [8 - (-3)], gives an answer smaller than [8].", truth: false, strand: "Integers", axis: "Structural sense", difficulty: 0.75, minReadMs: 2050, siblingGroup: "int.subtraction", form: "standalone" },
  { statement: "[½ + ⅓ = ⅖].", truth: false, strand: "Fractions", axis: "Procedural fluency", difficulty: 0.7, minReadMs: 1150, siblingGroup: "frac.addition", form: "standalone" },
  { statement: "[¾] is greater than [⅔].", truth: true, strand: "Fractions", axis: "Representation", difficulty: 0.75, minReadMs: 1150, siblingGroup: "frac.compare", form: "canonical" },
  { statement: "For any whole number [n] bigger than [0], three quarters of [n] is more than two thirds of [n].", truth: true, strand: "Fractions", axis: "Generalisation", difficulty: 0.85, minReadMs: 2410, siblingGroup: "frac.compare", form: "perturbed" },
  { statement: "[0.7] is smaller than [0.65], because [65] is bigger than [7].", truth: false, strand: "Fractions", axis: "Representation", difficulty: 0.7, minReadMs: 1690, siblingGroup: "frac.decimal", form: "standalone" },
  { statement: "Dividing a number by [½] gives a result larger than the number itself.", truth: true, strand: "Fractions", axis: "Structural sense", difficulty: 0.85, minReadMs: 1870, siblingGroup: "frac.division", form: "standalone" },
  { statement: "If boys : girls in a class is [2 : 3], then [⅖] of the class are boys.", truth: true, strand: "Ratio & %", axis: "Structural sense", difficulty: 0.8, minReadMs: 2320, siblingGroup: "ratio.part-whole", form: "canonical" },
  { statement: "If red beads : blue beads is [2 : 3], then the red beads are [⅔] of the blue beads.", truth: true, strand: "Ratio & %", axis: "Representation", difficulty: 0.85, minReadMs: 2500, siblingGroup: "ratio.part-whole", form: "perturbed" },
  { statement: "Increasing a price by [10%] and then decreasing it by [10%] returns it to the original price.", truth: false, strand: "Ratio & %", axis: "Property reasoning", difficulty: 0.8, minReadMs: 2230, siblingGroup: "ratio.percent-change", form: "standalone" },
  { statement: "[25%] of [80] is the same as [80%] of [25].", truth: true, strand: "Ratio & %", axis: "Structural sense", difficulty: 0.75, minReadMs: 1600, siblingGroup: "ratio.percent-of", form: "standalone" },
  { statement: "[2x] and [2] are like terms.", truth: false, strand: "Algebra", axis: "Structural sense", difficulty: 0.7, minReadMs: 1240, siblingGroup: "alg.like-terms", form: "standalone" },
  { statement: "[3x + 2x] simplifies to [5x].", truth: true, strand: "Algebra", axis: "Procedural fluency", difficulty: 0.55, minReadMs: 1240, siblingGroup: "alg.like-terms", form: "canonical" },
  { statement: "[3(y + 1) + 2(y + 1)] simplifies to [5(y + 1)].", truth: true, strand: "Algebra", axis: "Structural sense", difficulty: 0.85, minReadMs: 1780, siblingGroup: "alg.like-terms", form: "perturbed" },
  { statement: "In the expression [5n], the letter [n] stands for a fixed number that never changes.", truth: false, strand: "Algebra", axis: "Structural sense", difficulty: 0.75, minReadMs: 2050, siblingGroup: "alg.variable", form: "standalone" },
  { statement: "[x + x + x] is the same as [x³].", truth: false, strand: "Algebra", axis: "Representation", difficulty: 0.7, minReadMs: 1600, siblingGroup: "alg.repeated", form: "standalone" },
  { statement: "If [x + 5 = 12], then [x = 7].", truth: true, strand: "Equations", axis: "Reversibility", difficulty: 0.55, minReadMs: 1600, siblingGroup: "eq.solve-one-step", form: "canonical" },
  { statement: "If [12 = x + 5], then [x = 7].", truth: true, strand: "Equations", axis: "Reversibility", difficulty: 0.75, minReadMs: 1600, siblingGroup: "eq.solve-one-step", form: "perturbed" },
  { statement: "The equals sign in [3 + 4 = 7] means 'write down the answer'.", truth: false, strand: "Equations", axis: "Structural sense", difficulty: 0.8, minReadMs: 1960, siblingGroup: "eq.equals-meaning", form: "standalone" },
  { statement: "If [2x = 10], you can find [x] by doing the opposite of multiplying — dividing both sides by [2].", truth: true, strand: "Equations", axis: "Reversibility", difficulty: 0.6, minReadMs: 2500, siblingGroup: "eq.inverse", form: "standalone" },
  { statement: "[2³] means [2 × 3].", truth: false, strand: "Exponents", axis: "Structural sense", difficulty: 0.7, minReadMs: 1150, siblingGroup: "exp.meaning", form: "canonical" },
  { statement: "[a⁴] means [a × 4], whatever number [a] stands for.", truth: false, strand: "Exponents", axis: "Generalisation", difficulty: 0.8, minReadMs: 1600, siblingGroup: "exp.meaning", form: "perturbed" },
  { statement: "[2³ × 2⁴ = 2⁷].", truth: true, strand: "Exponents", axis: "Procedural fluency", difficulty: 0.75, minReadMs: 1150, siblingGroup: "exp.laws", form: "standalone" },
  { statement: "Any number raised to the power [0] equals [0].", truth: false, strand: "Exponents", axis: "Limit-case sense", difficulty: 0.75, minReadMs: 1510, siblingGroup: "exp.zero", form: "standalone" },
  { statement: "Angles on a straight line add up to [180°].", truth: true, strand: "Lines & Angles", axis: "Property reasoning", difficulty: 0.55, minReadMs: 1510, siblingGroup: "ang.straight-line", form: "standalone" },
  { statement: "If two angles together make a straight line, each one must be [90°].", truth: false, strand: "Lines & Angles", axis: "Limit-case sense", difficulty: 0.7, minReadMs: 1870, siblingGroup: "ang.straight-line", form: "standalone" },
  { statement: "Vertically opposite angles are always equal.", truth: true, strand: "Lines & Angles", axis: "Property reasoning", difficulty: 0.65, minReadMs: 1240, siblingGroup: "ang.vertical", form: "standalone" },
  { statement: "An angle drawn with longer arms is a bigger angle.", truth: false, strand: "Lines & Angles", axis: "Structural sense", difficulty: 0.75, minReadMs: 1600, siblingGroup: "ang.measure", form: "standalone" },
  { statement: "A triangle can have two right angles.", truth: false, strand: "Triangles", axis: "Limit-case sense", difficulty: 0.7, minReadMs: 1330, siblingGroup: "tri.angle-sum", form: "standalone" },
  { statement: "The three angles of any triangle add up to [180°].", truth: true, strand: "Triangles", axis: "Generalisation", difficulty: 0.55, minReadMs: 1600, siblingGroup: "tri.angle-sum", form: "standalone" },
  { statement: "A triangle can be drawn with sides [3 cm], [4 cm] and [8 cm].", truth: false, strand: "Triangles", axis: "Property reasoning", difficulty: 0.85, minReadMs: 1960, siblingGroup: "tri.inequality", form: "standalone" },
  { statement: "If two triangles have all three angles equal, the triangles must be identical in size.", truth: false, strand: "Triangles", axis: "Structural sense", difficulty: 0.8, minReadMs: 2050, siblingGroup: "tri.congruence", form: "standalone" },
  { statement: "Doubling the side of a square [doubles] its area.", truth: false, strand: "Mensuration", axis: "Generalisation", difficulty: 0.8, minReadMs: 1510, siblingGroup: "mens.scaling", form: "canonical" },
  { statement: "Doubling the radius of a circle [doubles] its area.", truth: false, strand: "Mensuration", axis: "Generalisation", difficulty: 0.85, minReadMs: 1510, siblingGroup: "mens.scaling", form: "perturbed" },
  { statement: "Two rectangles with the same perimeter must have the same area.", truth: false, strand: "Mensuration", axis: "Property reasoning", difficulty: 0.8, minReadMs: 1690, siblingGroup: "mens.perimeter-area", form: "standalone" },
  { statement: "The area of a triangle is [½ × base × height], whichever side you call the base.", truth: true, strand: "Mensuration", axis: "Property reasoning", difficulty: 0.75, minReadMs: 2230, siblingGroup: "mens.triangle-area", form: "standalone" },
  { statement: "The mean of a set of numbers is always one of the numbers in that set.", truth: false, strand: "Data Handling", axis: "Structural sense", difficulty: 0.7, minReadMs: 2140, siblingGroup: "data.mean-meaning", form: "standalone" },
  { statement: "If every value in a data set is increased by [5], the mean increases by [5].", truth: true, strand: "Data Handling", axis: "Generalisation", difficulty: 0.8, minReadMs: 2140, siblingGroup: "data.mean-shift", form: "standalone" },
  { statement: "A single very large value changes the mean more than it changes the median.", truth: true, strand: "Data Handling", axis: "Property reasoning", difficulty: 0.85, minReadMs: 1960, siblingGroup: "data.robustness", form: "standalone" },
  { statement: "A set of data can have more than one mode.", truth: true, strand: "Data Handling", axis: "Limit-case sense", difficulty: 0.7, minReadMs: 1600, siblingGroup: "data.mode", form: "standalone" },
  { statement: "If a coin has landed heads five times in a row, the next toss is more likely to be tails.", truth: false, strand: "Data Handling", axis: "Property reasoning", difficulty: 0.75, minReadMs: 2500, siblingGroup: "data.probability", form: "standalone" },
];
