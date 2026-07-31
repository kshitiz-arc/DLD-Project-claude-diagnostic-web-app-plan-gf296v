"""ID / code generation (mirror of frontend/src/auth/ids.ts, plan §5.i)."""

from __future__ import annotations

import secrets

ANIMALS = [
    "KESTREL", "FALCON", "OTTER", "LYNX", "MOTH", "HERON", "VIPER", "CRANE",
    "WREN", "ORYX", "IBIS", "MERLIN", "FINCH", "ROOK", "JAY", "KITE", "LARK",
]
_ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous O/0, I/1
_SUBJECT_PREFIX = {"Maths": "MATH", "Science": "SCI"}


def _token(n: int) -> str:
    return "".join(secrets.choice(_ALPHA) for _ in range(n))


def make_pin() -> str:
    return f"{secrets.randbelow(9000) + 1000}"


def make_student_code(section: str, avatar_id: int = 0) -> str:
    """Mint an anonymous call-sign.

    The animal is drawn at random and is *not* a function of ``avatar_id``.
    It used to be ``ANIMALS[avatar_id % len(ANIMALS)]``, which looked harmless
    but meant the call-sign was decided by the avatar picker — and that picker
    defaults to 0. In practice almost nobody changes it, so almost every child
    in a sitting came out a KESTREL: sixteen of the seventeen names were never
    issued, and a class full of near-identical codes is exactly how a child
    ends up typing someone else's.

    ``avatar_id`` is kept in the signature because callers pass it positionally
    and it stays meaningful as the child's chosen tile colour; it simply has no
    say in their name.
    """
    animal = secrets.choice(ANIMALS)
    # a 2-digit tail keeps codes memorable while making collisions negligible
    return f"{animal}·{secrets.randbelow(9) + 1}{section}{secrets.randbelow(90) + 10}"


def issue_teacher_id(kind: str, subject: str, sections: list[str]) -> str:
    if not sections:
        raise ValueError("at least one section required")
    if kind == "class" and len(sections) != 1:
        raise ValueError("a class teacher owns exactly one section")
    prefix = _SUBJECT_PREFIX.get(subject, "SUBJ")
    sec_part = "".join(s.lstrip("7") for s in sections)
    return f"{prefix}-{sec_part}-{_token(4)}"


def teacher_label(kind: str, subject: str, sections: list[str]) -> str:
    if kind == "class":
        return f"Class {sections[0]} · all students"
    return f"{subject} · {' '.join(sections)}"
