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

import random

from sqlmodel import Session, select

from diagnostic_scoring import Response as Opt
from diagnostic_scoring import score_response

from .ids import make_student_code
from .itembank import BANK, STRANDS, twin_keys, validate_bank
from .models import Concept, Item, Response, Session as Sitting, Student
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


def seed_demo(session: Session, sections=("A", "B", "C"), per_section=8) -> None:
    """Generate a synthetic cohort so the console has data on a fresh install."""
    if session.exec(select(Student)).first():
        return
    items = session.exec(select(Item)).all()
    rng = random.Random(2026)
    for section in sections:
        for i in range(per_section):
            ability = min(0.95, max(0.2, 0.35 + rng.random() * 0.6))
            over = (rng.random() - 0.4) * 0.5  # tendency to over-report confidence
            code = make_student_code(section, i) + f"{rng.randint(0, 9)}"
            student = Student(code=code, section=section, avatar_id=i, display_handle=code)
            session.add(student)
            session.commit()
            session.refresh(student)
            sitting = Sitting(student_id=student.id, mode="fixed", stop_reason="exhausted")
            session.add(sitting)
            session.commit()
            session.refresh(sitting)
            served = [it for it in items if rng.random() < 0.75] or items[:12]
            for pos, it in enumerate(served):
                # A perturbed twin is harder for a procedurally-fluent student:
                # this is what a reification gap looks like in synthetic data.
                p_correct = ability * (0.72 if it.form == "perturbed" else 1.0)
                correct = rng.random() < p_correct
                confident = rng.random() < (0.4 + ability * 0.4 + max(0.0, over))
                if correct:
                    opt = (Opt.AT if it.ground_truth else Opt.AF) if confident else (Opt.ST if it.ground_truth else Opt.SF)
                else:
                    opt = (Opt.AF if it.ground_truth else Opt.AT) if confident else (Opt.SF if it.ground_truth else Opt.ST)
                rt = rng.randint(400, 9000)
                scored = score_response(opt, it.ground_truth, rt, t_min_ms=it.min_read_ms)
                row = Response(
                    session_id=sitting.id, student_id=student.id, item_id=it.id, strand=it.strand,
                    axis=it.axis, form=it.form, twin_id=it.twin_id, position_in_session=pos,
                    response_option=opt.value, direction_correct=scored.direction_correct,
                    confidence_high=scored.confidence_high, diagnostic_cell=scored.diagnostic_cell.name,
                    brier_reward=scored.brier_reward, log_score=scored.log_score,
                    response_time_ms=rt, rt_valid=scored.rt_valid, t_min_ms=it.min_read_ms,
                )
                session.add(row)
                session.commit()
                apply_response(session, row, it.difficulty)
            session.commit()
