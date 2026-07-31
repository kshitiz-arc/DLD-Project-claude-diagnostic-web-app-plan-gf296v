"""Seed the concept table, the item bank, and (optionally) a demo cohort.

The bank itself lives in ``itembank.py`` — authored once, mirrored to the
frontend by ``backend/tools/export_bank.py``. This module only writes it into
the database, assigning integer ``twin_id`` pair keys as it goes.

``seed_demo`` generates a synthetic cohort so a fresh install has something to
show in the console. It is *clearly synthetic*: fixed RNG seed, no relation to
any real child, and it never runs when the database already holds students.
Disable it with ``HYPERION_SEED_DEMO=0`` before a real sitting.
"""

from __future__ import annotations

import math
import random

from sqlmodel import Session, select

from diagnostic_scoring import Response as Opt
from diagnostic_scoring import score_response

from .adaptive import CONCEPT_CAP, SESSION_CAP
from .ids import make_student_code
from .itembank import BANK, STRANDS, twin_keys, validate_bank
from .models import Concept, Item, PracticeLog, Response, Session as Sitting, Student
from .state import apply_response


def seed_concepts(session: Session) -> None:
    """Write the strand vocabulary — the Q-matrix skill list (plan §4, §7)."""
    if session.exec(select(Concept)).first():
        return
    for ordinal, strand in enumerate(STRANDS, start=1):
        session.add(Concept(strand=strand, label=strand, ordinal=ordinal))
    session.commit()
    parents = {c.strand: c.id for c in session.exec(select(Concept)).all()}
    # Layer 2: the cognitive/reification axes actually used by the bank, hung
    # off their strand as sub-skills. The (strand, axis) pairing is the Q-matrix.
    seen = set()
    for item in BANK:
        key = (item.strand, item.axis)
        if key in seen:
            continue
        seen.add(key)
        session.add(Concept(
            strand=item.strand, label=f"{item.strand} · {item.axis}",
            cognitive_axis=item.axis, parent_id=parents.get(item.strand),
        ))
    session.commit()


def seed_items(session: Session) -> None:
    """Load the authored bank, validating it first (plan §14 item-bank QC)."""
    validate_bank()
    if session.exec(select(Item)).first():
        return
    twin_ids = {key: n for n, key in enumerate(twin_keys(), start=1)}
    for item in BANK:
        session.add(Item(
            statement_text=item.text, ground_truth=item.truth, strand=item.strand,
            axis=item.axis, difficulty=item.difficulty, sibling_group=item.sibling_group,
            form=item.form, twin_id=twin_ids.get(item.twin_key) if item.twin_key else None,
            min_read_ms=item.min_read_ms, note=item.note,
        ))
    session.commit()


# --- synthetic cohort -------------------------------------------------------
#
# The generator is a real response model, not noise dressed up as data. Every
# number the console shows is downstream of the same latent draw, so the cohort
# is internally consistent: a child weak on Fractions has a low Fractions
# posterior *and* the confident-wrong rows that produced it *and* a calibration
# bias matching how they reported — because all three are consequences of one
# set of parameters rather than three independent inventions.
#
#   theta        latent ability, ~N(section shift, 0.92) across the year group
#   concept_off  per-concept offset ~N(0, 0.55). Nobody is uniformly able, and
#                a flat fingerprint would make a ten-dimensional instrument
#                pointless
#   b            item difficulty, mapped from the bank's 0.55..0.85 onto logits
#   P(knows)     sigmoid(1.7 * (theta + off - b)) — the 2PL form, 1.7 being the
#                usual logistic-to-normal scaling constant
#   calib        confidence distortion, >0 over-reports. This is what makes
#                MISCONCEPTION emerge as a *consequence* of over-confidence
#                meeting weak knowledge, instead of being sprinkled in
#   diligence    P(clearing the reading floor); the remainder are RT-invalid
#
# The child forms a belief, distorts it by their calibration, and reports the
# nearest band on the six-point scale — the same path a real child takes. So
# the Brier rewards, the 2x2 cells and the calibration bias all agree with each
# other by construction.

_BAND_PHAT = [
    (Opt.AT, 0.95), (Opt.MT, 0.80), (Opt.ST, 0.62),
    (Opt.SF, 0.38), (Opt.MF, 0.20), (Opt.AF, 0.05),
]


def _sigmoid(x: float) -> float:
    if x < -60.0:
        return 0.0
    if x > 60.0:
        return 1.0
    return 1.0 / (1.0 + math.exp(-x))


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _report_band(q_true: float, calib: float) -> Opt:
    """Distort a belief by the child's calibration, then bin it to the scale."""
    q = 0.5 + (q_true - 0.5) * (1.0 + calib)
    q = _clamp(q, 0.02, 0.98)
    return min(_BAND_PHAT, key=lambda kv: abs(kv[1] - q))[0]


def seed_demo(session: Session, sections=("A", "B", "C"), per_section=21) -> None:
    """Generate a synthetic cohort: 3 sections x 21 = 63 students."""
    if session.exec(select(Student)).first():
        return
    items = list(session.exec(select(Item)).all())
    if not items:
        return
    by_strand: dict = {}
    for it in items:
        by_strand.setdefault(it.strand, []).append(it)

    rng = random.Random(2026)
    strands = list(STRANDS)

    for section in sections:
        # A section is not a random sample of the year group — teaching differs.
        # The gap has to clear sampling noise or the console shows an ordering
        # that is really a coin flip: at n=21 and sd 0.85 the standard error of
        # a section mean is ~0.19 logits, so a +-0.28 shift is barely 1 SE and
        # sections land in the wrong order about as often as the right one.
        # +-0.6 puts adjacent sections ~2.2 SE apart, which reads as a real
        # difference instead of noise.
        section_shift = {"A": 0.60, "B": 0.0, "C": -0.60}.get(section, 0.0)

        for i in range(per_section):
            theta0 = rng.gauss(section_shift + 0.45, 0.85)
            concept_off = {c: rng.gauss(0.0, 0.55) for c in strands}
            # Misconceptions are concept-specific: a child holds a wrong rule
            # about fractions without holding one about angles. This is what
            # gives the console's hotspot panel something real to rank.
            misc_prone = {c: rng.random() * 0.55 for c in strands}
            calib = rng.gauss(0.05, 0.42)
            diligence = _clamp(rng.gauss(0.86, 0.11), 0.45, 0.995)
            twin_gap = rng.uniform(0.10, 0.95)   # reification penalty (plan §12)
            speed = rng.uniform(0.75, 1.5)

            student = Student(
                code=make_student_code(section, i), section=section,
                avatar_id=i % 6, display_handle="", onboarded=True,
            )
            session.add(student)
            session.commit()
            session.refresh(student)

            # 1..4 sittings with genuine growth between them, so the growth
            # board and any pre/post comparison have real signal to show.
            # A demo cohort should look like a class some way into a term, not
            # one that all started this morning: a spread from "sat it once" to
            # "has been grinding for weeks" is what makes the history and the
            # growth board show anything.
            n_sittings = rng.choices([1, 2, 3, 4, 6, 8], weights=[22, 24, 20, 16, 12, 6])[0]
            for s_no in range(n_sittings):
                theta = theta0 + 0.22 * s_no
                sitting = Sitting(student_id=student.id, mode="adaptive",
                                  stop_reason="cap", wave=f"w{s_no}")
                session.add(sitting)
                session.commit()
                session.refresh(sitting)

                # Breadth-first across concepts, mirroring the real selector's
                # per-concept budget rather than sampling the bank at random.
                pool = {c: list(by_strand.get(c, [])) for c in strands}
                for c in pool:
                    rng.shuffle(pool[c])
                served = []
                for _round in range(CONCEPT_CAP):
                    for c in strands:
                        if pool[c] and len(served) < SESSION_CAP:
                            served.append(pool[c].pop())

                for pos, it in enumerate(served):
                    b = (it.difficulty - 0.70) * 4.0
                    th = theta + concept_off[it.strand]
                    if it.form == "perturbed":
                        th -= twin_gap          # a surface change costs the shaky
                    knows = _sigmoid(1.7 * (th - b))

                    # Not knowing and believing the opposite are different
                    # states, and telling them apart is the whole purpose of
                    # the 2x2 (plan §5.3). Collapsing them into one draw makes
                    # every weak child look like a misconception, which is both
                    # wrong and exactly the error the instrument exists to
                    # avoid. So: hold the concept, or fail to — and if you fail,
                    # either a wrong belief is sitting there or nothing is.
                    if rng.random() < knows:
                        conf_correct = 0.55 + 0.43 * knows          # conviction
                    elif rng.random() < misc_prone[it.strand]:
                        conf_correct = 0.5 - (0.10 + 0.38 * rng.random())   # hardened wrong
                    else:
                        conf_correct = 0.5 + rng.uniform(-0.10, 0.10)       # blank -> hedges

                    q_true = conf_correct if it.ground_truth else 1.0 - conf_correct
                    opt = _report_band(q_true, calib)

                    # Slower on hard items, faster if able; a lapse of diligence
                    # is a genuine sub-floor rush, not a coin flip on validity.
                    if rng.random() > diligence:
                        rt = rng.uniform(120.0, max(160.0, it.min_read_ms - 60.0))
                    else:
                        # The reading floor is a *floor*, not a target: a child
                        # has to read the statement, decide, and then judge how
                        # sure they are. Multiples near 1 produced a 2-minute
                        # sitting, which is not what 35 items looks like.
                        rt = it.min_read_ms * speed * rng.uniform(3.0, 7.0) * (1.0 + 0.45 * b)
                        rt = _clamp(rt, it.min_read_ms + 40.0, 45_000.0)

                    scored = score_response(opt, it.ground_truth, rt, t_min_ms=it.min_read_ms)
                    row = Response(
                        session_id=sitting.id, student_id=student.id, item_id=it.id,
                        strand=it.strand, axis=it.axis, form=it.form, twin_id=it.twin_id,
                        position_in_session=pos, response_option=opt.value,
                        direction_correct=scored.direction_correct,
                        confidence_high=scored.confidence_high,
                        diagnostic_cell=scored.diagnostic_cell.name,
                        brier_reward=scored.brier_reward, log_score=scored.log_score,
                        response_time_ms=rt, rt_valid=scored.rt_valid,
                        t_min_ms=it.min_read_ms,
                    )
                    session.add(row)
                    session.flush()   # one commit per sitting, not per response
                    apply_response(session, row, it.difficulty)
                session.commit()

            # RANGE warm-ups. Engagement only, never diagnostic (plan §7) — so
            # this is drawn from the child's appetite for practice and is
            # deliberately *not* correlated with ability.
            if rng.random() > 0.35:
                for _ in range(rng.randint(1, 22)):
                    secs = rng.randint(35, 60)
                    hits = int(secs * rng.uniform(0.25, 0.75))
                    session.add(PracticeLog(
                        student_id=student.id, seconds=secs, hits=hits,
                        misses=int(hits * rng.uniform(0.08, 0.5)),
                        best_streak=rng.randint(3, max(4, hits // 2)),
                    ))
            session.commit()
