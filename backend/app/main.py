"""FastAPI application — the single-host LAN server (plan §3, §9)."""

from __future__ import annotations

import asyncio
import csv
import io
import json
import os
import secrets
from collections import Counter, defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session as DbSession
from sqlmodel import select

from diagnostic_scoring import Response as Opt
from diagnostic_scoring import (
    cohort_gap, from_response_rows, gap_by_concept, level_for_xp, score_response, xp_item,
)

from . import ids, lan
from .adaptive import CONCEPT_CAP, SESSION_CAP, concept_convergence, select_next
from .db import backup_db, engine, get_session, init_db
from .itembank import STRANDS
from .models import Concept, ConceptState, Item, Response, Session, Student, TeacherAccount
from .schemas import (
    IssueTeacher, ItemOut, ResponseIn, ResponseOut, SessionNext, SessionStart,
    StudentCreate, StudentLogin, TeacherLogin,
)
from .security import hash_pin, verify_pin
from .seed import seed_concepts, seed_demo, seed_items
from .state import apply_response, fingerprint, rebuild_concept_state

CONCEPTS = list(STRANDS)
ADMIN_PASSCODE = os.environ.get("HYPERION_ADMIN_PASSCODE", "hyperion")
# Console/export endpoints normally require a teacher token. Set to "1" only
# for a demo on a machine holding no real cohort data.
OPEN_CONSOLE = os.environ.get("HYPERION_OPEN_CONSOLE", "0") == "1"
CELLS = ("SECURE", "FRAGILE", "GAP", "MISCONCEPTION")


# Periodic snapshot interval in minutes; 0 disables (plan §9 — the cohort must
# survive a laptop failure). [assumption — tunable]
BACKUP_EVERY_MIN = int(os.environ.get("HYPERION_BACKUP_MINUTES", "15"))


async def _backup_loop() -> None:
    while True:
        await asyncio.sleep(BACKUP_EVERY_MIN * 60)
        try:
            await asyncio.to_thread(backup_db)
        except Exception:  # pragma: no cover - a failed snapshot must never
            pass           # take the sitting down with it


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    with DbSession(engine) as s:
        seed_concepts(s)
        seed_items(s)
        if os.environ.get("HYPERION_SEED_DEMO", "1") == "1":
            seed_demo(s)
    task = asyncio.create_task(_backup_loop()) if BACKUP_EVERY_MIN > 0 else None
    try:
        yield
    finally:
        if task is not None:
            task.cancel()


app = FastAPI(title="HYPERION Diagnostic API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


# --- identity ---------------------------------------------------------------

@app.post("/api/student/create")
def student_create(body: StudentCreate, db: DbSession = Depends(get_session)):
    for _ in range(6):  # retry on the small chance of a code collision
        code = ids.make_student_code(body.section, body.avatar_id)
        if not db.exec(select(Student).where(Student.code == code)).first():
            break
    else:
        raise HTTPException(500, "could not allocate a unique code")
    student = Student(
        code=code, section=body.section, class_level=body.class_level, subject=body.subject,
        avatar_id=body.avatar_id, display_handle=code,
        pin_hash=hash_pin(body.pin) if body.pin else None,
    )
    db.add(student); db.commit(); db.refresh(student)
    return {"code": code, "pin_set": bool(body.pin)}


def _find_student(db: DbSession, code: str) -> Optional[Student]:
    student = db.exec(select(Student).where(Student.code == code.upper())).first()
    if student is None:  # codes are stored as generated; try the raw form too
        student = db.exec(select(Student).where(Student.code == code)).first()
    return student


@app.post("/api/student/login")
def student_login(body: StudentLogin, db: DbSession = Depends(get_session)):
    student = _find_student(db, body.code)
    if not student:
        raise HTTPException(404, "unknown student code")
    if student.pin_hash and not verify_pin(body.pin or "", student.pin_hash):
        raise HTTPException(401, "wrong PIN")
    return {"code": student.code, "section": student.section, "subject": student.subject,
            "avatar_id": student.avatar_id, "onboarded": student.onboarded}


@app.post("/api/student/onboarded")
def student_onboarded(body: StudentLogin, db: DbSession = Depends(get_session)):
    """Record that the child has seen the scale tutorial (plan §8).

    The '(somewhat)' bins are interpreted inconsistently by 12-year-olds; the
    onboarding anchor is a measurement control, so whether it was shown is part
    of the record, not a UI detail.
    """
    student = _find_student(db, body.code)
    if not student:
        raise HTTPException(404, "unknown student code")
    student.onboarded = True
    db.add(student); db.commit()
    return {"code": student.code, "onboarded": True}


def _require_admin(x_admin_passcode: Optional[str] = Header(default=None)) -> None:
    if x_admin_passcode != ADMIN_PASSCODE:
        raise HTTPException(401, "admin passcode required")


@app.post("/api/admin/issue-teacher", dependencies=[Depends(_require_admin)])
def issue_teacher(body: IssueTeacher, db: DbSession = Depends(get_session)):
    try:
        tid = ids.issue_teacher_id(body.kind, body.subject, body.sections)
    except ValueError as e:
        raise HTTPException(400, str(e))
    pin = ids.make_pin()
    acct = TeacherAccount(
        teacher_id=tid, pin_hash=hash_pin(pin), kind=body.kind, subject=body.subject,
        sections=json.dumps(body.sections), label=ids.teacher_label(body.kind, body.subject, body.sections),
        token=secrets.token_urlsafe(24),
    )
    db.add(acct); db.commit()
    return {"teacher_id": tid, "pin": pin, "kind": body.kind, "label": acct.label, "sections": body.sections}


@app.post("/api/teacher/login")
def teacher_login(body: TeacherLogin, db: DbSession = Depends(get_session)):
    acct = db.exec(select(TeacherAccount).where(TeacherAccount.teacher_id == body.teacher_id.upper())).first()
    if not acct or not verify_pin(body.pin, acct.pin_hash):
        raise HTTPException(401, "invalid teacher id or PIN")
    if not acct.token:  # accounts issued before tokens existed
        acct.token = secrets.token_urlsafe(24)
        db.add(acct); db.commit()
    return {"teacher_id": acct.teacher_id, "kind": acct.kind, "subject": acct.subject,
            "sections": json.loads(acct.sections), "label": acct.label, "token": acct.token}


def _norm_sections(sections: List[str]) -> List[str]:
    """'7B' and 'B' name the same section; the store uses the bare letter."""
    return [s.strip().lstrip("7") for s in sections if s.strip()]


def teacher_from_token(
    db: DbSession = Depends(get_session),
    x_teacher_token: Optional[str] = Header(default=None),
    x_admin_passcode: Optional[str] = Header(default=None),
) -> Optional[TeacherAccount]:
    """Resolve the caller's teacher account, or ``None`` for admin/open mode.

    Scope is taken from the *account*, never from a query parameter, so a
    class teacher cannot widen their own view by editing a URL (plan §5.i).
    """
    if x_teacher_token:
        acct = db.exec(select(TeacherAccount).where(TeacherAccount.token == x_teacher_token)).first()
        if not acct:
            raise HTTPException(401, "invalid teacher token")
        return acct
    if x_admin_passcode == ADMIN_PASSCODE or OPEN_CONSOLE:
        return None
    raise HTTPException(401, "teacher token required")


def _scope_for(acct: Optional[TeacherAccount], role: str, section: str, sections: Optional[str]) -> List[str]:
    if acct is not None:
        allowed = _norm_sections(json.loads(acct.sections))
        return sorted(set(allowed)) if allowed else []
    if role == "class":
        return _norm_sections([section])
    return sorted(set(_norm_sections((sections or "A,B,C").split(","))))


# --- diagnostic loop --------------------------------------------------------

def _active_items(db: DbSession) -> List[Item]:
    return list(db.exec(select(Item).where(Item.active == True)).all())  # noqa: E712


def fixed_form(items: List[Item], cap: int) -> List[Item]:
    """A balanced fixed form: the same items, in the same order, for everyone.

    Phase 1 is deliberately non-adaptive so the baseline is clean (plan §13),
    and a baseline is only comparable if every child sees the same instrument.
    Round-robin across strands gives breadth first; canonical/standalone forms
    come before perturbed ones so a fixed form is readable without twins.
    """
    by_strand: Dict[str, List[Item]] = defaultdict(list)
    for item in sorted(items, key=lambda i: (i.form == "perturbed", i.id or 0)):
        by_strand[item.strand].append(item)
    order = [s for s in CONCEPTS if s in by_strand] + [s for s in by_strand if s not in CONCEPTS]
    form: List[Item] = []
    depth = 0
    while len(form) < cap and any(len(by_strand[s]) > depth for s in order):
        for strand in order:
            if len(form) >= cap:
                break
            if len(by_strand[strand]) > depth:
                form.append(by_strand[strand][depth])
        depth += 1
    return form[:cap]


def _cap_for(mode: str, n_active: int) -> int:
    return min(SESSION_CAP, n_active)


def _item_out(i: Item) -> ItemOut:
    return ItemOut(id=i.id, strand=i.strand, axis=i.axis, statement_text=i.statement_text,
                   difficulty=i.difficulty, min_read_ms=i.min_read_ms)


@app.post("/api/session/start")
def session_start(body: SessionStart, db: DbSession = Depends(get_session)):
    student = _find_student(db, body.code)
    if not student:
        raise HTTPException(404, "unknown student code")
    mode = "adaptive" if body.mode == "adaptive" else "fixed"
    n_active = len(_active_items(db))
    cap = _cap_for(mode, n_active)

    # Resume-on-reconnect (plan §9): a dropped Wi-Fi client continues where it
    # left off rather than restarting — a restart would both lose the child's
    # place and pollute the log with a duplicate partial sitting.
    if body.resume:
        open_sitting = db.exec(
            select(Session).where(Session.student_id == student.id)
            .where(Session.ended_at == None).where(Session.mode == mode)  # noqa: E711
            .order_by(Session.id.desc())
        ).first()
        if open_sitting is not None:
            answered = len(db.exec(select(Response).where(Response.session_id == open_sitting.id)).all())
            return {"session_id": open_sitting.id, "mode": mode, "cap": cap,
                    "answered": answered, "resumed": True}

    sitting = Session(student_id=student.id, mode=mode, client_meta=body.client_meta[:200],
                      wave=body.wave)
    db.add(sitting); db.commit(); db.refresh(sitting)
    return {"session_id": sitting.id, "mode": mode, "cap": cap, "answered": 0, "resumed": False}


def _finish(db: DbSession, sitting: Session, reason: str) -> None:
    if sitting.ended_at is None:
        sitting.ended_at = datetime.now(timezone.utc)
        sitting.stop_reason = reason
        db.add(sitting); db.commit()


@app.post("/api/session/next")
def session_next(body: SessionNext, db: DbSession = Depends(get_session)):
    sitting = db.get(Session, body.session_id)
    if not sitting:
        raise HTTPException(404, "unknown session")
    active = _active_items(db)
    responses = list(db.exec(
        select(Response).where(Response.session_id == sitting.id).order_by(Response.position_in_session)
    ).all())
    cap = _cap_for(sitting.mode, len(active))

    probing = False
    if sitting.mode == "adaptive":
        item, probing, stop_reason = select_next(active, responses, session_cap=cap,
                                                 concept_cap=CONCEPT_CAP)
    else:
        answered = {r.item_id for r in responses}
        remaining = [i for i in fixed_form(active, cap) if i.id not in answered]
        item = remaining[0] if remaining and len(responses) < cap else None
        stop_reason = "" if item else ("cap" if len(responses) >= cap else "exhausted")

    if item is None:
        _finish(db, sitting, stop_reason or "exhausted")
        return {"done": True, "answered": len(responses), "cap": cap,
                "stop_reason": sitting.stop_reason, "session_id": sitting.id}
    return {"done": False, "item": _item_out(item), "answered": len(responses), "cap": cap,
            "probing": probing}


@app.post("/api/response", response_model=ResponseOut)
def submit_response(body: ResponseIn, db: DbSession = Depends(get_session)):
    sitting = db.get(Session, body.session_id)
    item = db.get(Item, body.item_id)
    if not sitting or not item:
        raise HTTPException(404, "unknown session or item")
    try:
        opt = Opt(body.response_option)
    except ValueError:
        raise HTTPException(400, "response_option must be one of AT/ST/SF/AF")

    # The RT floor is per item (plan §5.4): a long statement needs longer to
    # read before an answer can be called engaged.
    scored = score_response(opt, item.ground_truth, body.response_time_ms, t_min_ms=item.min_read_ms)
    prior = list(db.exec(
        select(Response).where(Response.session_id == sitting.id).order_by(Response.position_in_session)
    ).all())
    was_probe = bool(prior) and prior[-1].diagnostic_cell == "MISCONCEPTION" and prior[-1].strand == item.strand

    row = Response(
        session_id=sitting.id, student_id=sitting.student_id, item_id=item.id, strand=item.strand,
        axis=item.axis, form=item.form, twin_id=item.twin_id, position_in_session=len(prior),
        probe=was_probe, response_option=opt.value,
        direction_correct=scored.direction_correct, confidence_high=scored.confidence_high,
        diagnostic_cell=scored.diagnostic_cell.name, brier_reward=scored.brier_reward,
        log_score=scored.log_score, response_time_ms=body.response_time_ms,
        rt_valid=scored.rt_valid, t_min_ms=item.min_read_ms,
    )
    db.add(row)
    if was_probe:
        sitting.probes_served += 1
        db.add(sitting)
    db.commit(); db.refresh(row)

    before = db.exec(
        select(ConceptState).where(ConceptState.student_id == row.student_id)
        .where(ConceptState.strand == row.strand)
    ).first()
    level_before = before.level if before else 1
    state = apply_response(db, row, item.difficulty)
    db.commit(); db.refresh(state)

    return ResponseOut(
        diagnostic_cell=scored.diagnostic_cell.name, direction_correct=scored.direction_correct,
        confidence_high=scored.confidence_high, rt_valid=scored.rt_valid,
        xp=xp_item(scored.brier_reward, item.difficulty), brier_reward=scored.brier_reward,
        strand=item.strand, concept_xp=state.xp, concept_level=state.level,
        level_up=state.level > level_before,
    )


@app.get("/api/session/{session_id}/summary")
def session_summary(session_id: int, db: DbSession = Depends(get_session)):
    """End-of-session payload for the student: cells, progression, adaptivity."""
    sitting = db.get(Session, session_id)
    if not sitting:
        raise HTTPException(404, "unknown session")
    rows = list(db.exec(select(Response).where(Response.session_id == session_id)).all())
    valid = [r for r in rows if r.rt_valid]
    cells = Counter(r.diagnostic_cell for r in valid)
    states = list(db.exec(select(ConceptState).where(ConceptState.student_id == sitting.student_id)).all())
    student = db.get(Student, sitting.student_id)
    return {
        "session_id": session_id,
        "mode": sitting.mode,
        "stop_reason": sitting.stop_reason,
        "answered": len(rows),
        "valid": len(valid),
        "probes_served": sitting.probes_served,
        "cells": {c: cells.get(c, 0) for c in CELLS},
        "concepts": [
            {"strand": s.strand, "xp": s.xp, "level": s.level,
             "mastery": round(s.mastery_mean, 3), "variance": round(s.mastery_var, 4)}
            for s in sorted(states, key=lambda s: CONCEPTS.index(s.strand) if s.strand in CONCEPTS else 99)
        ],
        "convergence": [
            {"strand": s, "mastery": round(m, 3), "variance": round(v, 4)}
            for s, m, v in concept_convergence(rows)
        ],
        "code": student.code if student else "",
    }


# --- gamification: growth / calibration boards (plan §8) ---------------------

@app.get("/api/leaderboard")
def leaderboard(
    section: Optional[str] = None,
    board: str = "calibration",
    limit: int = 10,
    db: DbSession = Depends(get_session),
):
    """Growth / calibration / effort boards — never a raw-score board.

    A raw-score board rewards guessing and rushing, which corrupts exactly the
    two signals the instrument depends on (plan §8). These three reward the
    behaviours that produce clean data:

      * ``calibration`` — how well confidence matched correctness (|bias|);
      * ``growth``      — improvement in mastery over the sitting;
      * ``effort``      — valid, engaged responses (invalid RT earns nothing).
    """
    students = list(db.exec(select(Student)).all())
    if section:
        wanted = set(_norm_sections([section]))
        students = [s for s in students if s.section in wanted]

    rows = []
    for st in students:
        states = list(db.exec(select(ConceptState).where(ConceptState.student_id == st.id)).all())
        n_valid = sum(s.n_valid for s in states)
        if not n_valid:
            continue
        bias = sum(s.calibration_bias * s.n_valid for s in states) / n_valid
        mastery = sum(s.mastery_mean * s.n_valid for s in states) / n_valid
        rows.append({
            "code": st.code, "avatar_id": st.avatar_id, "section": st.section,
            # 100 == perfectly calibrated. Distance from zero bias in either
            # direction costs the same: under-confidence is not a virtue here.
            "calibration": round(max(0.0, 100.0 - abs(bias) * 100.0), 1),
            "growth": round(mastery * 100.0, 1),
            "effort": n_valid,
            "xp": sum(s.xp for s in states),
            "level": level_for_xp(sum(s.xp for s in states)),
        })

    key = board if board in ("calibration", "growth", "effort") else "calibration"
    rows.sort(key=lambda r: (-r[key], r["code"]))
    return {"board": key, "section": section, "entries": rows[:max(1, limit)]}


# --- teacher console (role-scoped) ------------------------------------------

@app.get("/api/console/cohort")
def console_cohort(
    role: str = "class",
    section: str = "B",
    sections: Optional[str] = None,
    acct: Optional[TeacherAccount] = Depends(teacher_from_token),
    db: DbSession = Depends(get_session),
):
    """Role-scoped class-wise aggregate (plan §5.ii, §11).

    With a teacher token the scope is the account's own sections; the query
    parameters are only honoured for admin/open access.
    """
    wanted = set(_scope_for(acct, role, section, sections))
    students = [s for s in db.exec(select(Student)).all() if s.section in wanted]
    n_items = max(1, len(_active_items(db)))
    out_students = []
    concept_dir: Dict[str, List[int]] = defaultdict(lambda: [0, 0, 0])  # correct, total, misconception
    total_valid = total_misc = 0
    sbar_sum = 0.0

    for st in students:
        rows = list(db.exec(select(Response).where(Response.student_id == st.id)).all())
        valid = [r for r in rows if r.rt_valid]
        cells = {c: 0 for c in CELLS}
        s_sum = conf_sum = corr_sum = 0.0
        for r in valid:
            cells[r.diagnostic_cell] = cells.get(r.diagnostic_cell, 0) + 1
            concept_dir[r.strand][0] += 1 if r.direction_correct else 0
            concept_dir[r.strand][1] += 1
            concept_dir[r.strand][2] += 1 if r.diagnostic_cell == "MISCONCEPTION" else 0
            s_sum += r.brier_reward
            corr_sum += 1 if r.direction_correct else 0
            conf_sum += 1 if r.confidence_high else 0
        n = max(1, len(valid))
        states = list(db.exec(select(ConceptState).where(ConceptState.student_id == st.id)).all())
        sbar = s_sum / n
        total_valid += len(valid); total_misc += cells["MISCONCEPTION"]; sbar_sum += sbar
        out_students.append({
            "code": st.code, "section": st.section, "avatar_id": st.avatar_id, "attempted": len(rows),
            "cells": cells, "vec": fingerprint(states, CONCEPTS), "sbar": round(sbar, 3),
            "invalid": round(1 - len(valid) / max(1, len(rows)), 3),
            "completion": round(min(1.0, len(rows) / n_items), 3),
            "calibration_bias": round((conf_sum - corr_sum) / n, 3),
            "level": level_for_xp(sum(s.xp for s in states)),
        })

    heat = [
        {"concept": c,
         "mastery": round(concept_dir[c][0] / concept_dir[c][1], 3) if concept_dir[c][1] else 0.0,
         "misconception_density": round(concept_dir[c][2] / concept_dir[c][1], 3) if concept_dir[c][1] else 0.0,
         "n": concept_dir[c][1]}
        for c in CONCEPTS
    ]
    n_students = max(1, len(students))
    return {
        "role": "subject" if (acct and acct.kind == "subject") or role == "subject" else "class",
        "scope": sorted(wanted),
        "n_students": len(students),
        "kpi": {
            "calibrated_proficiency": round(sbar_sum / n_students, 3),
            "misconception_density": round(total_misc / max(1, total_valid), 3),
        },
        "students": out_students,
        "concepts": heat,
    }


def _scoped_students(db: DbSession, acct: Optional[TeacherAccount],
                     role: str, section: str, sections: Optional[str]) -> List[Student]:
    wanted = set(_scope_for(acct, role, section, sections))
    return [s for s in db.exec(select(Student)).all() if s.section in wanted]


@app.get("/api/console/hotspots")
def console_hotspots(
    role: str = "class",
    section: str = "B",
    sections: Optional[str] = None,
    limit: int = 6,
    acct: Optional[TeacherAccount] = Depends(teacher_from_token),
    db: DbSession = Depends(get_session),
):
    """Confident-wrong clusters, ranked — the priority signal (plan §5.3, §11)."""
    student_ids = {s.id for s in _scoped_students(db, acct, role, section, sections)}
    items = {i.id: i for i in db.exec(select(Item)).all()}
    seen: Dict[int, int] = Counter()
    misc: Dict[int, int] = Counter()
    for r in db.exec(select(Response)).all():
        if r.student_id not in student_ids or not r.rt_valid:
            continue
        seen[r.item_id] += 1
        if r.diagnostic_cell == "MISCONCEPTION":
            misc[r.item_id] += 1

    out = []
    for item_id, n_misc in misc.items():
        item = items.get(item_id)
        if item is None or not n_misc:
            continue
        out.append({
            "item_id": item_id, "statement": item.statement_text, "concept": item.strand,
            "axis": item.axis, "n_misconception": n_misc, "n_seen": seen[item_id],
            "rate": round(n_misc / max(1, seen[item_id]), 3),
            "note": item.note,
        })
    out.sort(key=lambda h: (-h["rate"], -h["n_misconception"]))
    return {"scope": sorted({s.section for s in _scoped_students(db, acct, role, section, sections)}),
            "n_students": len(student_ids), "hotspots": out[:max(1, limit)]}


@app.get("/api/console/student/{code}")
def console_student(
    code: str,
    acct: Optional[TeacherAccount] = Depends(teacher_from_token),
    db: DbSession = Depends(get_session),
):
    """Full per-student diagnostic record (plan §11)."""
    student = _find_student(db, code)
    if not student:
        raise HTTPException(404, "unknown student code")
    if acct is not None and student.section not in set(_norm_sections(json.loads(acct.sections))):
        raise HTTPException(403, "outside your scope")

    rows = list(db.exec(select(Response).where(Response.student_id == student.id)
                        .order_by(Response.id)).all())
    valid = [r for r in rows if r.rt_valid]
    items = {i.id: i for i in db.exec(select(Item)).all()}
    states = list(db.exec(select(ConceptState).where(ConceptState.student_id == student.id)).all())
    by_strand = {s.strand: s for s in states}
    n = max(1, len(valid))

    misconceptions = [
        {"item_id": r.item_id, "statement": items[r.item_id].statement_text if r.item_id in items else "",
         "concept": r.strand, "axis": r.axis, "response": r.response_option,
         "note": items[r.item_id].note if r.item_id in items else "",
         "response_time_ms": round(r.response_time_ms)}
        for r in valid if r.diagnostic_cell == "MISCONCEPTION"
    ]
    twin = cohort_gap(from_response_rows([
        {"student": student.code, "twin_id": r.twin_id, "form": r.form,
         "brier_reward": r.brier_reward, "concept": r.strand} for r in valid
    ]), label=student.code)

    return {
        "code": student.code, "section": student.section, "avatar_id": student.avatar_id,
        "subject": student.subject, "attempted": len(rows), "valid": len(valid),
        "invalid_share": round(1 - len(valid) / max(1, len(rows)), 3),
        "cells": {c: sum(1 for r in valid if r.diagnostic_cell == c) for c in CELLS},
        "sbar": round(sum(r.brier_reward for r in valid) / n, 3),
        "calibration_bias": round(
            sum((1 if r.confidence_high else 0) - (1 if r.direction_correct else 0) for r in valid) / n, 3),
        "mean_rt_ms": round(sum(r.response_time_ms for r in valid) / n),
        "fingerprint": [
            {"concept": c,
             "mastery": round(by_strand[c].mastery_mean, 3) if c in by_strand else 0.5,
             "variance": round(by_strand[c].mastery_var, 4) if c in by_strand else round(1 / 12, 4),
             "misconception_density": round(by_strand[c].misconception_density, 3) if c in by_strand else 0.0,
             "n": by_strand[c].n_valid if c in by_strand else 0,
             "level": by_strand[c].level if c in by_strand else 1,
             "seen": c in by_strand}
            for c in CONCEPTS
        ],
        "misconceptions": misconceptions,
        # Phase-3 signal, present as soon as the child has answered both forms
        # of any twin; empty until then rather than guessed at.
        "reification_gap": {"n": twin.n, "mean": round(twin.mean, 3),
                            "ci95": [round(twin.ci95[0], 3), round(twin.ci95[1], 3)]},
    }


# --- research exports (plan §5.ii, §11) -------------------------------------

def _csv_response(rows: List[dict], columns: List[str], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"content-disposition": f'attachment; filename="{filename}"'},
    )


RESPONSE_COLUMNS = [
    "response_id", "session_id", "student_code", "section", "class_level", "subject",
    "wave", "mode", "item_id", "strand", "axis", "form", "twin_id", "sibling_group",
    "difficulty", "position_in_session", "probe", "response_option", "direction_correct",
    "confidence_high", "diagnostic_cell", "brier_reward", "log_score",
    "response_time_ms", "t_min_ms", "rt_valid", "server_received_at",
]


@app.get("/api/export/responses.csv")
def export_responses(
    acct: Optional[TeacherAccount] = Depends(teacher_from_token),
    db: DbSession = Depends(get_session),
):
    """The append-only event-store as a flat research dataset.

    Anonymous student codes only — the export carries no PII because the
    system never collects any (plan §10). Teachers get their own sections;
    admin gets everything.
    """
    students = {s.id: s for s in db.exec(select(Student)).all()}
    items = {i.id: i for i in db.exec(select(Item)).all()}
    sittings = {s.id: s for s in db.exec(select(Session)).all()}
    allowed = None
    if acct is not None:
        allowed = set(_norm_sections(json.loads(acct.sections)))

    out = []
    for r in db.exec(select(Response).order_by(Response.id)).all():
        st = students.get(r.student_id)
        if st is None or (allowed is not None and st.section not in allowed):
            continue
        item = items.get(r.item_id)
        sitting = sittings.get(r.session_id)
        out.append({
            "response_id": r.id, "session_id": r.session_id, "student_code": st.code,
            "section": st.section, "class_level": st.class_level, "subject": st.subject,
            "wave": sitting.wave if sitting else "", "mode": sitting.mode if sitting else "",
            "item_id": r.item_id, "strand": r.strand, "axis": r.axis, "form": r.form,
            "twin_id": r.twin_id if r.twin_id is not None else "",
            "sibling_group": item.sibling_group if item else "",
            "difficulty": item.difficulty if item else "",
            "position_in_session": r.position_in_session, "probe": int(r.probe),
            "response_option": r.response_option, "direction_correct": int(r.direction_correct),
            "confidence_high": int(r.confidence_high), "diagnostic_cell": r.diagnostic_cell,
            "brier_reward": round(r.brier_reward, 6), "log_score": round(r.log_score, 6),
            "response_time_ms": round(r.response_time_ms, 1), "t_min_ms": r.t_min_ms,
            "rt_valid": int(r.rt_valid), "server_received_at": r.server_received_at.isoformat(),
        })
    return _csv_response(out, RESPONSE_COLUMNS, "hyperion-responses.csv")


STATE_COLUMNS = [
    "student_code", "section", "strand", "mastery_mean", "mastery_var", "mastery_alpha",
    "mastery_beta", "calibrated_proficiency", "calibration_bias", "misconception_density",
    "mean_rt_ms", "n_valid", "n_invalid", "xp", "level", "updated_at",
]


@app.get("/api/export/concept-state.csv")
def export_concept_state(
    acct: Optional[TeacherAccount] = Depends(teacher_from_token),
    db: DbSession = Depends(get_session),
):
    """The derived per student x concept table (plan §4, §11)."""
    students = {s.id: s for s in db.exec(select(Student)).all()}
    allowed = set(_norm_sections(json.loads(acct.sections))) if acct is not None else None
    out = []
    for s in db.exec(select(ConceptState).order_by(ConceptState.student_id)).all():
        st = students.get(s.student_id)
        if st is None or (allowed is not None and st.section not in allowed):
            continue
        out.append({
            "student_code": st.code, "section": st.section, "strand": s.strand,
            "mastery_mean": round(s.mastery_mean, 4), "mastery_var": round(s.mastery_var, 5),
            "mastery_alpha": s.mastery_alpha, "mastery_beta": s.mastery_beta,
            "calibrated_proficiency": round(s.calibrated_proficiency, 4),
            "calibration_bias": round(s.calibration_bias, 4),
            "misconception_density": round(s.misconception_density, 4),
            "mean_rt_ms": round(s.mean_rt_ms, 1), "n_valid": s.n_valid, "n_invalid": s.n_invalid,
            "xp": s.xp, "level": s.level, "updated_at": s.updated_at.isoformat(),
        })
    return _csv_response(out, STATE_COLUMNS, "hyperion-concept-state.csv")


ITEM_COLUMNS = ["item_id", "strand", "axis", "statement_text", "ground_truth", "difficulty",
                "form", "twin_id", "sibling_group", "min_read_ms", "active", "note"]


@app.get("/api/export/items.csv", dependencies=[Depends(_require_admin)])
def export_items(db: DbSession = Depends(get_session)):
    """The item bank with ground truth — admin only, never served to a client."""
    out = [{
        "item_id": i.id, "strand": i.strand, "axis": i.axis, "statement_text": i.statement_text,
        "ground_truth": int(i.ground_truth), "difficulty": i.difficulty, "form": i.form,
        "twin_id": i.twin_id if i.twin_id is not None else "", "sibling_group": i.sibling_group or "",
        "min_read_ms": i.min_read_ms, "active": int(i.active), "note": i.note,
    } for i in db.exec(select(Item).order_by(Item.id)).all()]
    return _csv_response(out, ITEM_COLUMNS, "hyperion-items.csv")


@app.get("/api/research/twin-delta", dependencies=[Depends(_require_admin)])
def research_twin_delta(db: DbSession = Depends(get_session)):
    """Reification gap Delta = s_canonical - s_perturbed (plan §12).

    Reported with its sample size and interval, and with an explicit note that
    the gap's status as a reification discriminator is a *hypothesis under
    test*, not an established result.
    """
    students = {s.id: s.code for s in db.exec(select(Student)).all()}
    rows = [{
        "student": students.get(r.student_id, str(r.student_id)), "twin_id": r.twin_id,
        "form": r.form, "brier_reward": r.brier_reward, "concept": r.strand,
    } for r in db.exec(select(Response)).all() if r.rt_valid]
    deltas = from_response_rows(rows)
    overall = cohort_gap(deltas)
    return {
        "n_pairs": overall.n,
        "cohort": {"mean": round(overall.mean, 4), "sd": round(overall.sd, 4),
                   "ci95": [round(overall.ci95[0], 4), round(overall.ci95[1], 4)],
                   "p_two_sided": round(overall.p_two_sided, 5),
                   "significant_at_05": overall.significant_at_05},
        "by_concept": [
            {"concept": c, "n": e.n, "mean": round(e.mean, 4),
             "ci95": [round(e.ci95[0], 4), round(e.ci95[1], 4)]}
            for c, e in gap_by_concept(deltas).items()
        ],
        "caveat": "Delta as a reification discriminator is a hypothesis to validate "
                  "on this data, not an assumed result (plan §12).",
    }


# --- operations (plan §9) ----------------------------------------------------

@app.post("/api/admin/backup", dependencies=[Depends(_require_admin)])
def admin_backup():
    """Take an immediate consistent snapshot of the database."""
    path = backup_db()
    if path is None:
        return {"ok": False, "detail": "in-memory database — nothing to back up"}
    return {"ok": True, "path": str(path), "bytes": path.stat().st_size}


@app.post("/api/admin/rebuild-state", dependencies=[Depends(_require_admin)])
def admin_rebuild_state(db: DbSession = Depends(get_session)):
    """Recompute concept_state from the event-store (after a restore/retune)."""
    return {"ok": True, "rows": rebuild_concept_state(db)}


@app.get("/api/health")
def health(db: DbSession = Depends(get_session)):
    return {
        "ok": True,
        "version": app.version,
        "items": len(_active_items(db)),
        "students": len(db.exec(select(Student)).all()),
        "responses": len(db.exec(select(Response)).all()),
        "concepts": len(db.exec(select(Concept)).all()),
    }


@app.get("/lan", response_class=HTMLResponse, include_in_schema=False)
def lan_page(port: Optional[int] = Query(default=None)):
    """Projector page: the address to type, plus a QR code (plan §9).

    Entirely self-contained — inline CSS, inline SVG, no external request of
    any kind, because the lab may have no internet at all.
    """
    p = port or lan.default_port()
    urls = lan.server_urls(p) or [f"http://localhost:{p}"]
    qr = lan.qr_svg(urls[0]) or (
        '<p class="nq">QR rendering needs <code>segno</code> '
        '(<code>pip install segno</code>) — the address below is what matters.</p>'
    )
    alts = "".join(f"<li>{u}</li>" for u in urls[1:])
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>HYPERION · join address</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
 :root {{ color-scheme: dark; --cyan:#22E7FF; --violet:#A855F7; --muted:#90A6C6; }}
 * {{ box-sizing:border-box; }}
 body {{ margin:0; min-height:100vh; display:grid; place-items:center; background:#03060f;
        color:#E8F3FF; font:16px/1.5 system-ui,Segoe UI,sans-serif;
        background-image:
          radial-gradient(900px 560px at 82% -14%, rgba(168,85,247,.30), transparent 62%),
          radial-gradient(760px 520px at 8% 104%, rgba(34,231,255,.22), transparent 60%),
          linear-gradient(rgba(120,200,255,.08) 1px, transparent 1px),
          linear-gradient(90deg, rgba(120,200,255,.08) 1px, transparent 1px);
        background-size: 100% 100%, 100% 100%, 44px 44px, 44px 44px; }}
 .card {{ text-align:center; padding:40px clamp(20px,5vw,56px); }}
 h1 {{ font-size:15px; letter-spacing:.3em; text-transform:uppercase; color:var(--muted);
       font-weight:600; margin:0 0 30px; }}
 .url {{ font:700 clamp(28px,6vw,64px)/1.1 ui-monospace,Cascadia Mono,Consolas,monospace;
        margin:0 0 30px; word-break:break-all; color:var(--cyan);
        text-shadow:0 0 42px rgba(34,231,255,.55); }}
 .qr {{ background:#fff; padding:16px; border-radius:12px; display:inline-block;
        box-shadow:0 0 60px -10px rgba(34,231,255,.6); }}
 .qr svg {{ display:block; width:min(46vw,320px); height:auto; }}
 ul {{ list-style:none; padding:0; margin:26px 0 0; color:var(--muted);
       font-family:ui-monospace,monospace; font-size:14px; }}
 .hint {{ margin-top:24px; color:var(--muted); font-size:13px; }}
 .nq {{ color:var(--muted); font-size:13px; }}
</style></head>
<body><div class="card">
 <h1>Type this on every lab PC</h1>
 <p class="url">{urls[0]}</p>
 <div class="qr">{qr}</div>
 {f"<ul><li>other addresses on this machine:</li>{alts}</ul>" if alts else ""}
 <p class="hint">Same Wi-Fi hotspot or same LAN switch. No internet needed.</p>
</div></body></html>"""


# --- serve the built frontend (single process on the LAN) -------------------
# Assets under /assets; every other non-API path falls back to index.html so
# the client-side router handles deep links (/session, /console).
_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _DIST.is_dir():
    from fastapi.responses import FileResponse

    app.mount("/assets", StaticFiles(directory=str(_DIST / "assets")), name="assets")
    _INDEX = _DIST / "index.html"

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):  # noqa: ARG001 - path captured for routing only
        return FileResponse(str(_INDEX))
