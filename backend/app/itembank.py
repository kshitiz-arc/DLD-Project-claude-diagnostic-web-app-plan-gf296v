"""The authored item bank — the single source of truth (plan §7, Phase 0).

Ten content strands x cross-cutting cognitive axes. Every item is a
declarative statement with a boolean ground truth; several are written *to
catch a known misconception*, because a confident-wrong response is the
instrument's highest-value output (plan §1.2).

Three structural fields carry the adaptivity and the research design:

* ``sibling_group`` — items probing the same sub-skill. A Misconception hit
  pulls the next item from the same group (plan §6 probe-deeper).
* ``twin`` — ``canonical`` / ``perturbed`` pairs sharing a ``twin_key``. Both
  forms test the same structure; the perturbed one changes the
  reification-critical feature (unfamiliar unit, reversed orientation,
  generalised quantity). ``Delta = s_canonical - s_perturbed`` is the
  reification gap (plan §12). Authored now, scored when Phase 3 switches on.
* ``min_read_ms`` — a per-item reading-time floor for the RT validity gate
  (plan §5.4), derived from statement length rather than one global constant.

Mathematical content here is Class 7 pre-requisite material and is stable
across textbook editions; only the *chapter mapping* is edition-specific (see
`docs/concept-taxonomy.md`). Every statement is human-authored: no
auto-generated item enters a diagnostic bank (plan §6, §14).

``[tag]`` brackets mark a fragment the UI renders in monospace.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional

# Reading-time floor: a base for orientation plus per-word reading, clamped so
# no item is trivially gameable and none is absurdly slow. [assumption — tunable]
READ_BASE_MS = 700
READ_PER_WORD_MS = 90
READ_MIN_MS = 800
READ_MAX_MS = 3500

STRANDS = [
    "Integers", "Fractions", "Ratio & %", "Algebra", "Equations",
    "Exponents", "Lines & Angles", "Triangles", "Mensuration", "Data Handling",
]

AXES = [
    "Structural sense",      # object vs process
    "Procedural fluency",    # rule execution
    "Representation",        # moving between forms
    "Property reasoning",    # invariants and properties
    "Reversibility",         # undoing an operation
    "Generalisation",        # from instance to any-case
    "Limit-case sense",      # boundaries and impossibilities
]


@dataclass(frozen=True)
class BankItem:
    """One authored diagnostic statement with its full tag set."""

    text: str
    truth: bool
    strand: str
    axis: str
    difficulty: float
    sibling_group: str
    form: str = "standalone"        # standalone | canonical | perturbed
    twin_key: Optional[str] = None  # links a canonical/perturbed pair
    note: str = ""                  # what a confident-wrong answer here means

    @property
    def min_read_ms(self) -> int:
        return reading_floor_ms(self.text)


def reading_floor_ms(text: str) -> int:
    """Per-item RT validity floor from statement length (plan §5.4)."""
    words = len(re.sub(r"\[|\]", "", text).split())
    return max(READ_MIN_MS, min(READ_MAX_MS, READ_BASE_MS + READ_PER_WORD_MS * words))


def _i(text, truth, strand, axis, difficulty, sibling, form="standalone", twin=None, note=""):
    return BankItem(text, truth, strand, axis, difficulty, sibling, form, twin, note)


BANK: List[BankItem] = [
    # --- 1. Integers & signed-number reasoning -----------------------------
    _i("The product of two negative integers, like [(-4) × (-5)], is a negative number.",
       False, "Integers", "Structural sense", 0.70, "int.sign-product", "canonical", "int.sign",
       note="Over-generalises 'negative means less' from addition to multiplication."),
    _i("If [a] and [b] are positive whole numbers, then [(-a) × (-b)] is a negative number.",
       False, "Integers", "Generalisation", 0.80, "int.sign-product", "perturbed", "int.sign",
       note="Same structure with the numbers removed — procedural recall can't rescue it."),
    _i("On the number line, [-7] lies to the left of [-3].",
       True, "Integers", "Representation", 0.60, "int.order",
       note="Confident-false = ordering negatives by magnitude."),
    _i("[-7] is greater than [-3], because [7] is greater than [3].",
       False, "Integers", "Property reasoning", 0.65, "int.order",
       note="The magnitude-ordering misconception, stated outright."),
    _i("Subtracting a negative number, as in [8 - (-3)], gives an answer smaller than [8].",
       False, "Integers", "Structural sense", 0.75, "int.subtraction",
       note="'Subtraction always makes smaller' survives into signed numbers."),

    # --- 2. Fractions, decimals & rational numbers -------------------------
    _i("[½ + ⅓ = ⅖].",
       False, "Fractions", "Procedural fluency", 0.70, "frac.addition",
       note="Adds numerators and denominators — the classic fraction-addition error."),
    _i("[¾] is greater than [⅔].",
       True, "Fractions", "Representation", 0.75, "frac.compare", "canonical", "frac.compare",
       note="Confident-false = comparing by denominator size alone."),
    _i("For any whole number [n] bigger than [0], three quarters of [n] is more than two thirds of [n].",
       True, "Fractions", "Generalisation", 0.85, "frac.compare", "perturbed", "frac.compare",
       note="The same comparison as an object-level property, not a numeric check."),
    _i("[0.7] is smaller than [0.65], because [65] is bigger than [7].",
       False, "Fractions", "Representation", 0.70, "frac.decimal",
       note="'Longer decimal is larger' — reads decimals as whole numbers."),
    _i("Dividing a number by [½] gives a result larger than the number itself.",
       True, "Fractions", "Structural sense", 0.85, "frac.division",
       note="'Division always makes smaller' — a hardened, high-value misconception."),

    # --- 3. Ratio, proportion & percentage ---------------------------------
    _i("If boys : girls in a class is [2 : 3], then [⅖] of the class are boys.",
       True, "Ratio & %", "Structural sense", 0.80, "ratio.part-whole", "canonical", "ratio.partwhole",
       note="Confident-false = reading a ratio term as a fraction of the whole (⅔)."),
    _i("If red beads : blue beads is [2 : 3], then the red beads are [⅔] of the blue beads.",
       True, "Ratio & %", "Representation", 0.85, "ratio.part-whole", "perturbed", "ratio.partwhole",
       note="Part-to-part rather than part-to-whole; the same structure, different surface."),
    _i("Increasing a price by [10%] and then decreasing it by [10%] returns it to the original price.",
       False, "Ratio & %", "Property reasoning", 0.80, "ratio.percent-change",
       note="Percentages treated as absolute amounts rather than operators on a changing base."),
    _i("[25%] of [80] is the same as [80%] of [25].",
       True, "Ratio & %", "Structural sense", 0.75, "ratio.percent-of",
       note="Confident-false misses the commutativity behind 'percent of'."),

    # --- 4. Algebraic expressions ------------------------------------------
    _i("[2x] and [2] are like terms.",
       False, "Algebra", "Structural sense", 0.70, "alg.like-terms",
       note="A letter read as a label rather than a quantity."),
    _i("[3x + 2x] simplifies to [5x].",
       True, "Algebra", "Procedural fluency", 0.55, "alg.like-terms", "canonical", "alg.collect",
       note="Baseline procedure; almost everyone should clear this."),
    _i("[3(y + 1) + 2(y + 1)] simplifies to [5(y + 1)].",
       True, "Algebra", "Structural sense", 0.85, "alg.like-terms", "perturbed", "alg.collect",
       note="Requires treating [(y+1)] as a single object — the reification test."),
    _i("In the expression [5n], the letter [n] stands for a fixed number that never changes.",
       False, "Algebra", "Structural sense", 0.75, "alg.variable",
       note="Variable-as-constant: blocks all later function work."),
    _i("[x + x + x] is the same as [x³].",
       False, "Algebra", "Representation", 0.70, "alg.repeated",
       note="Confuses repeated addition with repeated multiplication."),

    # --- 5. Simple linear equations ----------------------------------------
    _i("If [x + 5 = 12], then [x = 7].",
       True, "Equations", "Reversibility", 0.55, "eq.solve-one-step", "canonical", "eq.orient",
       note="Standard orientation; a wrong answer here is a genuine gap."),
    _i("If [12 = x + 5], then [x = 7].",
       True, "Equations", "Reversibility", 0.75, "eq.solve-one-step", "perturbed", "eq.orient",
       note="Reversed orientation — procedural solvers read '=' left-to-right and stall."),
    _i("The equals sign in [3 + 4 = 7] means 'write down the answer'.",
       False, "Equations", "Structural sense", 0.80, "eq.equals-meaning",
       note="Operational rather than relational '=' — the root of most equation errors."),
    _i("If [2x = 10], you can find [x] by doing the opposite of multiplying — dividing both sides by [2].",
       True, "Equations", "Reversibility", 0.60, "eq.inverse",
       note="Checks whether inverse operations are understood or just recited."),

    # --- 6. Exponents & powers ---------------------------------------------
    _i("[2³] means [2 × 3].",
       False, "Exponents", "Structural sense", 0.70, "exp.meaning", "canonical", "exp.meaning",
       note="Exponent read as a multiplier — the dominant Class 7 exponent error."),
    _i("[a⁴] means [a × 4], whatever number [a] stands for.",
       False, "Exponents", "Generalisation", 0.80, "exp.meaning", "perturbed", "exp.meaning",
       note="Same misconception with the numbers stripped out."),
    _i("[2³ × 2⁴ = 2⁷].",
       True, "Exponents", "Procedural fluency", 0.75, "exp.laws",
       note="Confident-false = multiplying the indices instead of adding."),
    _i("Any number raised to the power [0] equals [0].",
       False, "Exponents", "Limit-case sense", 0.75, "exp.zero",
       note="A boundary case where a memorised rule usually breaks."),

    # --- 7. Lines & angles --------------------------------------------------
    _i("Angles on a straight line add up to [180°].",
       True, "Lines & Angles", "Property reasoning", 0.55, "ang.straight-line",
       note="Baseline fact; failure here is a real prerequisite gap."),
    _i("If two angles together make a straight line, each one must be [90°].",
       False, "Lines & Angles", "Limit-case sense", 0.70, "ang.straight-line",
       note="Reads a special case (two right angles) as the only case."),
    _i("Vertically opposite angles are always equal.",
       True, "Lines & Angles", "Property reasoning", 0.65, "ang.vertical",
       note="A property that survives every configuration — or is memorised as a picture."),
    _i("An angle drawn with longer arms is a bigger angle.",
       False, "Lines & Angles", "Structural sense", 0.75, "ang.measure",
       note="Angle-as-region rather than angle-as-turn; a deep representational error."),

    # --- 8. Triangles & their properties ------------------------------------
    _i("A triangle can have two right angles.",
       False, "Triangles", "Limit-case sense", 0.70, "tri.angle-sum",
       note="Confident-true means the 180° sum is not operating as a constraint."),
    _i("The three angles of any triangle add up to [180°].",
       True, "Triangles", "Generalisation", 0.55, "tri.angle-sum",
       note="Baseline; pairs with the limit-case item above."),
    _i("A triangle can be drawn with sides [3 cm], [4 cm] and [8 cm].",
       False, "Triangles", "Property reasoning", 0.85, "tri.inequality",
       note="Triangle inequality — usually absent rather than wrong."),
    _i("If two triangles have all three angles equal, the triangles must be identical in size.",
       False, "Triangles", "Structural sense", 0.80, "tri.congruence",
       note="Similar/congruent conflation; blocks all later scaling work."),

    # --- 9. Perimeter, area & mensuration -----------------------------------
    _i("Doubling the side of a square [doubles] its area.",
       False, "Mensuration", "Generalisation", 0.80, "mens.scaling", "canonical", "mens.scale",
       note="Linear scaling applied to area — one of the most persistent errors."),
    _i("Doubling the radius of a circle [doubles] its area.",
       False, "Mensuration", "Generalisation", 0.85, "mens.scaling", "perturbed", "mens.scale",
       note="Identical structure, different figure: exposes rule-following."),
    _i("Two rectangles with the same perimeter must have the same area.",
       False, "Mensuration", "Property reasoning", 0.80, "mens.perimeter-area",
       note="Perimeter and area treated as one quantity."),
    _i("The area of a triangle is [½ × base × height], whichever side you call the base.",
       True, "Mensuration", "Property reasoning", 0.75, "mens.triangle-area",
       note="Confident-false = the formula is tied to one drawn orientation."),

    # --- 10. Data handling ---------------------------------------------------
    _i("The mean of a set of numbers is always one of the numbers in that set.",
       False, "Data Handling", "Structural sense", 0.70, "data.mean-meaning",
       note="Mean as a member rather than a summary — blocks all later statistics."),
    _i("If every value in a data set is increased by [5], the mean increases by [5].",
       True, "Data Handling", "Generalisation", 0.80, "data.mean-shift",
       note="Tests whether the mean is understood as a balance point."),
    _i("A single very large value changes the mean more than it changes the median.",
       True, "Data Handling", "Property reasoning", 0.85, "data.robustness",
       note="Sensitivity to outliers — the reason both measures exist."),
    _i("A set of data can have more than one mode.",
       True, "Data Handling", "Limit-case sense", 0.70, "data.mode",
       note="Confident-false = 'the' mode read as a unique answer."),
    _i("If a coin has landed heads five times in a row, the next toss is more likely to be tails.",
       False, "Data Handling", "Property reasoning", 0.75, "data.probability",
       note="The gambler's fallacy — independence of trials."),
]


def twin_keys(bank: Optional[List[BankItem]] = None) -> List[str]:
    """Distinct twin pair keys, in bank order (assigned integer ids at seed)."""
    keys: List[str] = []
    for item in BANK if bank is None else bank:
        if item.twin_key and item.twin_key not in keys:
            keys.append(item.twin_key)
    return keys


def validate_bank(bank: List[BankItem] = BANK) -> None:
    """Fail loudly on a malformed bank — QC before anything reaches a child.

    Item-bank quality is the 'garbage in' risk (plan §14); these are the
    invariants the rest of the system relies on.
    """
    strands = {i.strand for i in bank}
    missing = set(STRANDS) - strands
    if missing:
        raise ValueError(f"strands with no items: {sorted(missing)}")
    unknown = strands - set(STRANDS)
    if unknown:
        raise ValueError(f"items tagged with unknown strands: {sorted(unknown)}")
    bad_axis = {i.axis for i in bank} - set(AXES)
    if bad_axis:
        raise ValueError(f"items tagged with unknown axes: {sorted(bad_axis)}")

    seen = set()
    for i in bank:
        if i.text in seen:
            raise ValueError(f"duplicate statement: {i.text!r}")
        seen.add(i.text)
        if not 0.0 < i.difficulty <= 1.0:
            raise ValueError(f"difficulty out of range for {i.text!r}")
        if (i.form == "standalone") != (i.twin_key is None):
            raise ValueError(f"twin form/key mismatch for {i.text!r}")

    for key in twin_keys(bank):
        forms = sorted(i.form for i in bank if i.twin_key == key)
        if forms != ["canonical", "perturbed"]:
            raise ValueError(f"twin {key!r} is not exactly one canonical + one perturbed: {forms}")
        concepts = {i.strand for i in bank if i.twin_key == key}
        if len(concepts) != 1:
            raise ValueError(f"twin {key!r} spans multiple strands: {sorted(concepts)}")

    for group in {i.sibling_group for i in bank}:
        members = [i for i in bank if i.sibling_group == group]
        if len({i.strand for i in members}) != 1:
            raise ValueError(f"sibling group {group!r} spans multiple strands")
