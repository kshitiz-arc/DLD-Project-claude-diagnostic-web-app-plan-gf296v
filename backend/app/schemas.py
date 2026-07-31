"""Request / response shapes for the API."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


# --- identity ---------------------------------------------------------------

class StudentCreate(BaseModel):
    section: str = "B"
    class_level: str = "Class 7"
    subject: str = "Maths"
    avatar_id: int = 0
    pin: Optional[str] = None


class StudentLogin(BaseModel):
    code: str
    pin: Optional[str] = None


class IssueTeacher(BaseModel):
    kind: str  # class | subject
    subject: str = "Maths"
    sections: List[str]


class TeacherLogin(BaseModel):
    teacher_id: str
    pin: str


# --- session / items --------------------------------------------------------

class ItemOut(BaseModel):
    """Delivered WITHOUT ground truth — scoring is server-side only."""

    id: int
    strand: str
    axis: str
    statement_text: str
    difficulty: float
    # The RT validity floor this item will be judged against (plan §5.4). Sent
    # so the client can show the same gate it is being measured by — the rule
    # is visible, which is what makes it fair rather than a trap.
    min_read_ms: int


class SessionStart(BaseModel):
    code: str
    mode: str = "adaptive"  # adaptive (plan §6) | fixed
    client_meta: str = ""   # opaque, no PII
    wave: str = "base"      # collection wave label (plan §12 DiD)
    resume: bool = True     # continue an unfinished sitting (plan §9)


class SessionNext(BaseModel):
    session_id: int


class ResponseIn(BaseModel):
    session_id: int
    item_id: int
    response_option: str  # AT | MT | ST | SF | MF | AF
    response_time_ms: float


class ResponseOut(BaseModel):
    diagnostic_cell: str
    direction_correct: bool
    confidence_high: bool
    rt_valid: bool
    xp: int
    # signed score is returned so the client "lens" can show it; the *game*
    # layer ignores it (two-score separation, plan §1.1).
    brier_reward: float
    # Town-Hall progression for the concept this item belongs to (plan §8).
    strand: str
    concept_xp: int
    concept_level: int
    level_up: bool
