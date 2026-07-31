# Concept taxonomy & the Q-matrix (plan §7)

Two layers. Every item is tagged on **both**, and that pairing *is* the
Q-matrix the Phase-3 cognitive-diagnosis model consumes.

## Layer 1 — content strands

Ten strands, each with at least four authored items:

| # | Strand | What a failure here blocks downstream |
|---|---|---|
| 1 | Integers & signed-number reasoning | Everything algebraic |
| 2 | Fractions, Decimals & Rational Numbers | Ratio, proportion, all later measure |
| 3 | Ratio, Proportion & Percentage | Similar figures, rates, statistics |
| 4 | Algebraic Expressions | Equation solving, functions |
| 5 | Simple Linear Equations | All later modelling |
| 6 | Exponents & Powers | Standard form, growth, indices |
| 7 | Lines & Angles | All of geometry |
| 8 | Triangles & their Properties | Congruence, similarity, trigonometry |
| 9 | Perimeter, Area & Mensuration | Scaling, volume, calculus intuitions |
| 10 | Data Handling | Statistics, probability |

## Layer 2 — cognitive / reification axes

These cut across every strand. They are what turn the instrument from "a quiz
on Integers" into "structural sense of signed operations vs rule-following":

| Axis | The question it asks |
|---|---|
| Structural sense | Is the object an object, or only a procedure? |
| Procedural fluency | Can the rule be executed at all? |
| Representation | Does meaning survive a change of form? |
| Property reasoning | Are invariants operating as constraints? |
| Reversibility | Can the operation be undone, not just run? |
| Generalisation | Does the instance become the any-case? |
| Limit-case sense | Are the boundaries and impossibilities felt? |

## Sibling groups

Items sharing a `sibling_group` probe the same sub-skill. A **Misconception**
(confident-wrong) triggers a probe from the same group — that is how the
adaptive engine distinguishes a *stable* misconception from a slip (plan §6).

Example: `int.sign-product` holds both the numeric and the generalised form of
the "two negatives make a negative" error.

## Twins — the reification probe

A `twin_key` links a **canonical** form to a **perturbed** form: same
structure, one reification-critical feature changed. The gap
`Δ = s_canonical − s_perturbed` is the Phase-3 signal (plan §12).

| Twin | Canonical | Perturbed | What the perturbation removes |
|---|---|---|---|
| `int.sign` | `(-4) × (-5)` is negative | `(-a) × (-b)` is negative | The numbers you can just compute |
| `frac.compare` | ¾ > ⅔ | ¾ of *n* > ⅔ of *n* for any n > 0 | The single checkable instance |
| `ratio.partwhole` | 2:3 → ⅖ are boys | 2:3 → red is ⅔ of blue | Part-to-whole familiarity |
| `alg.collect` | 3x + 2x = 5x | 3(y+1) + 2(y+1) = 5(y+1) | The letter as the only unit |
| `eq.orient` | x + 5 = 12 → x = 7 | 12 = x + 5 → x = 7 | Left-to-right reading |
| `exp.meaning` | 2³ means 2 × 3 | a⁴ means a × 4 | The arithmetic escape route |
| `mens.scale` | Doubling a square's side doubles area | Doubling a circle's radius doubles area | The memorised figure |

A student who clears the canonical form and fails its twin is the case the
whole instrument exists to find.

## Editing the bank

The bank is authored in **one** place: `backend/app/itembank.py`. After any
edit:

```bash
python backend/tools/export_bank.py     # regenerate the frontend mirror
pytest backend/tests/test_bank.py       # QC: coverage, twins, siblings, axes
```

`validate_bank()` refuses a bank with an uncovered strand, an unknown axis, a
duplicate statement, a half-authored twin, or a sibling group that straddles
two concepts. It runs at seed time, so a malformed bank never reaches a child.

**No auto-generated item enters this bank.** LLM-authored twins in particular
would inject noise into the very construct being measured (plan §6, §14).

## The edition caveat

The concept-level decomposition above is **stable across textbook editions** —
Class 7 mathematics does not change with the cover. What *is* edition-specific
is the chapter mapping, which is deliberately not asserted here. Before
authoring more items, confirm whether SBPS is on the old NCERT Class 7 text or
the newer *Ganita Prakash* (2025), and map strands to chapters then. Nothing in
the code depends on that mapping.
