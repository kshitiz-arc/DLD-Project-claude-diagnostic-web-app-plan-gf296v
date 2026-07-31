"""Data model (plan §4) — research-grade, twin-ready from day one.

The ``Response`` table is the append-only event-store: every attempt is stored
with full context and a server-computed diagnostic payload, so no later
analysis is blocked by a missing field. ``twin_id`` + ``form`` exist now even
though the Δ estimator is a later phase.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Student(SQLModel, table=True):
    """Anonymous, PII-free identity (plan §5.i, §10)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True)
    pin_hash: Optional[str] = None
    display_handle: str = ""
    avatar_id: int = 0
    class_level: str = "Class 7"
    section: str = "B"
    subject: str = "Maths"
    # Whether the child has seen the scale-anchoring tutorial (plan §8). It is
    # a measurement control, so it belongs in the record.
    onboarded: bool = False
    created_at: datetime = Field(default_factory=_utcnow)

    # --- teacher-side identity: the one deliberate exception to §10 ---------
    # Everything else about a student is anonymous by construction. This field
    # is not: a teacher who already knows the child types it in so a report can
    # be discussed at a PTM. It is therefore fenced off —
    #   * a teacher writes it, never the child and never the admin;
    #   * it is excluded from every research export by column allow-list, and a
    #     test asserts that (test_real_name_never_reaches_research_exports);
    #   * clearing it back to "" is always available and destroys the link.
    # Do not read this field into anything analytic. It exists for a
    # conversation with a parent, and nothing else.
    real_name: str = ""
    name_set_at: Optional[datetime] = None


class PracticeLog(SQLModel, table=True):
    """A RANGE warm-up run — engagement only, never diagnostic.

    RANGE sits outside the instrument: its content is deliberately absent from
    the Q-matrix so practising cannot inflate what is about to be measured.
    Logging it here records *time on task* so effort is visible to a teacher;
    it must never feed a concept posterior, an XP total, or a score.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: int = Field(foreign_key="student.id", index=True)
    seconds: int = 0
    hits: int = 0
    misses: int = 0
    best_streak: int = 0
    at: datetime = Field(default_factory=_utcnow)


class TeacherAccount(SQLModel, table=True):
    """Admin-issued teacher credential (plan §5.i)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    teacher_id: str = Field(index=True, unique=True)
    pin_hash: str = ""
    kind: str = "class"  # "class" | "subject"
    subject: str = "Maths"
    sections: str = "[]"  # JSON array of section labels
    label: str = ""
    # Bearer token minted at issue/login. Console scope is read from the
    # account behind this token, never from a query parameter, so a class
    # teacher cannot widen their own view by editing a URL (plan §5.i, §10).
    token: str = Field(default="", index=True)
    created_at: datetime = Field(default_factory=_utcnow)


class Concept(SQLModel, table=True):
    """The skill list — this table *is* the Q-matrix vocabulary (plan §4, §7).

    Layer 1 is the content strand; layer 2 is the cross-cutting cognitive /
    reification axis. Items are tagged on both, and the pairing is what the
    Phase-3 cognitive-diagnosis model consumes as skills.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    strand: str = Field(index=True)
    label: str = ""
    cognitive_axis: str = ""
    parent_id: Optional[int] = None  # sub-skills hang off their strand
    ordinal: int = 0


class Item(SQLModel, table=True):
    """A declarative statement with ground truth (plan §4)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    strand: str = Field(index=True)
    axis: str = ""
    statement_text: str = ""
    ground_truth: bool = True
    difficulty: float = 0.7
    twin_id: Optional[int] = None
    form: str = "standalone"  # canonical | perturbed | standalone
    sibling_group: Optional[str] = None
    # Per-item reading-time floor for the RT validity gate (plan §5.4); beats a
    # single global constant because statements differ in length.
    min_read_ms: int = 800
    # What a confident-wrong answer here means — surfaced to teachers only.
    note: str = ""
    active: bool = True


class Session(SQLModel, table=True):
    """A diagnostic sitting (plan §4)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: int = Field(foreign_key="student.id", index=True)
    mode: str = "fixed"  # fixed | adaptive
    started_at: datetime = Field(default_factory=_utcnow)
    ended_at: Optional[datetime] = None
    # Why the session stopped (plan §6 stopping rules / §11 adaptivity metrics):
    # cap | converged | exhausted | "" while still open.
    stop_reason: str = ""
    probes_served: int = 0  # items served by misconception-triggered probing
    client_meta: str = ""   # opaque client string (screen, UA) — no PII
    wave: str = "base"      # collection wave label for the Phase-3 DiD design


class Response(SQLModel, table=True):
    """Append-only response event (plan §4 — the gold)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="session.id", index=True)
    student_id: int = Field(foreign_key="student.id", index=True)
    item_id: int = Field(foreign_key="item.id", index=True)
    strand: str = ""
    axis: str = ""
    form: str = "standalone"
    # Denormalised so the research export is self-contained: a Phase-3 twin-Δ
    # analysis reads this table alone, with no join back to a mutable bank.
    twin_id: Optional[int] = None
    position_in_session: int = 0
    probe: bool = False        # served by misconception-triggered probing (§6)
    response_option: str = ""  # AT | MT | ST | SF | MF | AF
    direction_correct: bool = False
    confidence_high: bool = False
    diagnostic_cell: str = ""  # SECURE | FRAGILE | GAP | MISCONCEPTION
    brier_reward: float = 0.0
    log_score: float = 0.0     # research-grade alternative proper score (§5.2)
    response_time_ms: float = 0.0
    rt_valid: bool = True
    t_min_ms: int = 0          # the floor this response was judged against
    server_received_at: datetime = Field(default_factory=_utcnow)


class ConceptState(SQLModel, table=True):
    """Derived per student x concept state (plan §4, §5.5, §11).

    A write-through projection of the append-only log: it is *rebuildable*
    from ``responses`` at any time (see ``rebuild_concept_state``), so the
    event-store stays the single source of truth and this table stays a cache
    the console and the game layer can read cheaply.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    student_id: int = Field(foreign_key="student.id", index=True)
    strand: str = Field(index=True)
    mastery_alpha: float = 1.0
    mastery_beta: float = 1.0
    mastery_mean: float = 0.5
    mastery_var: float = 1.0 / 12.0
    misconception_density: float = 0.0
    calibration_bias: float = 0.0
    calibrated_proficiency: float = 0.0   # mean signed Brier reward, s_bar
    mean_rt_ms: float = 0.0
    n_valid: int = 0
    n_invalid: int = 0
    xp: int = 0        # visible currency (plan §1.1) — never feeds diagnostics
    level: int = 1     # monotone Town-Hall level (plan §8)
    updated_at: datetime = Field(default_factory=_utcnow)
