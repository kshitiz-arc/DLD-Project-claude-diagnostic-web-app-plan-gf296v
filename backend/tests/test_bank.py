"""Item-bank QC and the fixed-form builder (plan §7, §13, §14)."""

import subprocess
import sys
from pathlib import Path

import pytest

from app.itembank import BANK, STRANDS, BankItem, reading_floor_ms, twin_keys, validate_bank
from app.main import fixed_form
from app.models import Item

ROOT = Path(__file__).resolve().parents[2]


def test_the_shipped_bank_passes_its_own_qc():
    validate_bank()


def test_every_strand_has_items():
    covered = {i.strand for i in BANK}
    assert covered == set(STRANDS)
    for strand in STRANDS:
        assert sum(1 for i in BANK if i.strand == strand) >= 4


def test_twins_come_in_complete_pairs_within_one_strand():
    keys = twin_keys()
    assert keys, "the Phase-3 Delta needs twins authored now (plan §12)"
    for key in keys:
        pair = [i for i in BANK if i.twin_key == key]
        assert sorted(i.form for i in pair) == ["canonical", "perturbed"]
        assert len({i.strand for i in pair}) == 1


def test_sibling_groups_stay_inside_one_concept():
    for group in {i.sibling_group for i in BANK}:
        members = [i for i in BANK if i.sibling_group == group]
        assert len({i.strand for i in members}) == 1


def test_misconception_items_carry_a_teacher_note():
    """A confident-wrong hit is the product; the teacher must know what it means."""
    assert sum(1 for i in BANK if i.note) >= len(BANK) * 0.9


def test_reading_floor_scales_with_statement_length():
    short = reading_floor_ms("Two plus two is four.")
    long = reading_floor_ms(" ".join(["word"] * 40))
    assert 800 <= short < long <= 3500


@pytest.mark.parametrize("bad, match", [
    (BankItem("x", True, "Nowhere", "Structural sense", 0.5, "g"), "unknown strands"),
    (BankItem("x", True, "Integers", "Vibes", 0.5, "g"), "unknown axes"),
    (BankItem("x", True, "Integers", "Structural sense", 3.0, "g"), "difficulty"),
    (BankItem("x", True, "Integers", "Structural sense", 0.5, "g", "canonical", None), "twin form/key"),
])
def test_validate_rejects_malformed_items(bad, match):
    with pytest.raises(ValueError, match=match):
        validate_bank(list(BANK) + [bad])


def test_unpaired_twin_is_rejected():
    orphan = BankItem("y", True, "Integers", "Structural sense", 0.5, "g", "canonical", "solo")
    with pytest.raises(ValueError, match="canonical"):
        validate_bank(list(BANK) + [orphan])


def test_frontend_mirror_is_in_sync():
    """The bank is authored once; the TS mirror is generated (no hand-edits)."""
    result = subprocess.run(
        [sys.executable, str(ROOT / "backend" / "tools" / "export_bank.py"), "--check"],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


# --- fixed form -------------------------------------------------------------

def _items():
    return [Item(id=n, strand=i.strand, axis=i.axis, statement_text=i.text,
                 ground_truth=i.truth, difficulty=i.difficulty, form=i.form,
                 sibling_group=i.sibling_group, min_read_ms=i.min_read_ms)
            for n, i in enumerate(BANK, start=1)]


def test_fixed_form_is_breadth_first_and_deterministic():
    form = fixed_form(_items(), 12)
    assert len(form) == 12
    assert len({i.strand for i in form}) == 10  # every strand before any repeats
    assert [i.id for i in form] == [i.id for i in fixed_form(_items(), 12)]


def test_fixed_form_prefers_non_perturbed_items_first():
    form = fixed_form(_items(), 10)
    assert all(i.form != "perturbed" for i in form)


# --- student call-signs -----------------------------------------------------

def test_callsign_is_not_derived_from_the_avatar():
    """The name must not be a function of the avatar picker.

    It used to be ANIMALS[avatar_id % len(ANIMALS)]. The picker defaults to 0,
    almost nobody changes it, so almost every child came out a KESTREL — the
    other sixteen names were effectively never issued, and a room full of
    near-identical codes is how a child ends up signed in as someone else.
    """
    from collections import Counter

    from app.ids import ANIMALS, make_student_code

    # Same avatar every time; the names must still spread.
    names = Counter(make_student_code("B", 0).split("·")[0] for _ in range(600))
    assert len(names) > len(ANIMALS) * 0.7, f"call-signs barely spread: {names}"
    assert names.most_common(1)[0][1] < 200, f"one name dominates: {names.most_common(3)}"


def test_callsign_shape_is_stable():
    """ANIMAL-digit-SECTION-two digits, so a child can read it back aloud."""
    import re

    for av in (0, 1, 5, 99):
        code = make_student_code("B", av)
        assert re.fullmatch(r"[A-Z]+·[1-9]B\d{2}", code), code


from app.ids import make_student_code  # noqa: E402  (used by the test above)
