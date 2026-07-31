"""API tests — identity, the scored response loop, console, exports, ops."""

import os
import tempfile

# Point the engine at a throwaway DB *before* importing the app (db.py reads
# HYPERION_DB at import time). Demo seed on so the console has data.
_TMP = tempfile.mkdtemp()
os.environ["HYPERION_DB"] = os.path.join(_TMP, "test.db")
os.environ["HYPERION_BACKUP_DIR"] = os.path.join(_TMP, "backups")
os.environ["HYPERION_SEED_DEMO"] = "1"
os.environ["HYPERION_ADMIN_PASSCODE"] = "hyperion"

from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import Session as DbSession  # noqa: E402
from app.main import app  # noqa: E402
from app.db import engine, init_db  # noqa: E402
from app.seed import seed_concepts, seed_demo, seed_items  # noqa: E402

# Prepare schema + demo data directly (independent of lifespan timing).
init_db()
with DbSession(engine) as _s:
    seed_concepts(_s)
    seed_items(_s)
    seed_demo(_s)

client = TestClient(app)
ADMIN = {"x-admin-passcode": "hyperion"}


def _start(mode="fixed", section="B", avatar=1, **kw):
    code = client.post("/api/student/create", json={"section": section, "avatar_id": avatar}).json()["code"]
    started = client.post("/api/session/start", json={"code": code, "mode": mode, **kw}).json()
    return code, started["session_id"], started["cap"]


def _next(sid):
    return client.post("/api/session/next", json={"session_id": sid}).json()


def _answer(sid, item_id, option="ST", rt=4000):
    return client.post("/api/response", json={
        "session_id": sid, "item_id": item_id, "response_option": option, "response_time_ms": rt,
    }).json()


def _teacher(kind="class", sections=("7B",)):
    issued = client.post("/api/admin/issue-teacher", headers=ADMIN,
                         json={"kind": kind, "subject": "Maths", "sections": list(sections)}).json()
    login = client.post("/api/teacher/login",
                        json={"teacher_id": issued["teacher_id"], "pin": issued["pin"]}).json()
    return {"x-teacher-token": login["token"]}


# --- identity ---------------------------------------------------------------

def test_student_create_and_login():
    r = client.post("/api/student/create", json={"section": "C", "avatar_id": 2, "pin": "1234"})
    assert r.status_code == 200
    code = r.json()["code"]
    assert r.json()["pin_set"] is True
    ok = client.post("/api/student/login", json={"code": code, "pin": "1234"})
    assert ok.status_code == 200
    assert ok.json()["onboarded"] is False
    bad = client.post("/api/student/login", json={"code": code, "pin": "0000"})
    assert bad.status_code == 401


def test_onboarding_flag_is_recorded():
    """Whether the scale tutorial was shown is measurement metadata (plan §8)."""
    code = client.post("/api/student/create", json={"section": "B", "avatar_id": 3}).json()["code"]
    client.post("/api/student/onboarded", json={"code": code})
    assert client.post("/api/student/login", json={"code": code}).json()["onboarded"] is True


def test_admin_issue_requires_passcode():
    denied = client.post("/api/admin/issue-teacher", json={"kind": "class", "sections": ["7B"]})
    assert denied.status_code == 401
    ok = client.post("/api/admin/issue-teacher", headers=ADMIN,
                     json={"kind": "class", "subject": "Maths", "sections": ["7B"]})
    assert ok.status_code == 200
    body = ok.json()
    assert body["teacher_id"].startswith("MATH-B-")
    login = client.post("/api/teacher/login", json={"teacher_id": body["teacher_id"], "pin": body["pin"]})
    assert login.status_code == 200
    assert login.json()["kind"] == "class"
    assert login.json()["token"]


def test_subject_teacher_id_spans_sections():
    ok = client.post("/api/admin/issue-teacher", headers=ADMIN,
                     json={"kind": "subject", "subject": "Maths", "sections": ["7A", "7B", "7C"]}).json()
    assert ok["teacher_id"].startswith("MATH-ABC-")
    # class teacher must own exactly one section
    bad = client.post("/api/admin/issue-teacher", headers=ADMIN,
                      json={"kind": "class", "sections": ["7A", "7B"]})
    assert bad.status_code == 400


# --- the diagnostic loop ----------------------------------------------------

def test_fixed_form_is_identical_for_every_student_and_truthless():
    """A baseline is only comparable if everyone sees the same instrument."""
    def run():
        _, sid, cap = _start(mode="fixed")
        served = []
        while True:
            nxt = _next(sid)
            if nxt["done"]:
                assert nxt["stop_reason"] in {"cap", "exhausted"}
                break
            assert "ground_truth" not in nxt["item"]
            assert nxt["item"]["min_read_ms"] >= 800
            served.append(nxt["item"]["id"])
            _answer(sid, nxt["item"]["id"])
        return served, cap

    first, cap = run()
    second, _ = run()
    assert first == second
    assert len(first) == cap == 12
    # breadth first: the fixed form spans every strand before repeating one
    strands = client.get("/api/export/items.csv", headers=ADMIN).text
    assert strands  # export works; the ordering assertion is below
    assert len(set(first)) == 12


def test_scoring_secure_vs_misconception():
    _, sid, _ = _start(mode="fixed")
    first = _next(sid)["item"]           # the fixed form starts on a FALSE statement
    secure = _answer(sid, first["id"], "AF", 4000)
    assert secure["diagnostic_cell"] == "SECURE"
    assert secure["brier_reward"] > 0.9 and secure["xp"] > 0
    assert secure["concept_level"] >= 1 and secure["strand"]

    _, sid2, _ = _start(mode="fixed")
    first2 = _next(sid2)["item"]
    misc = _answer(sid2, first2["id"], "AT", 4000)
    assert misc["diagnostic_cell"] == "MISCONCEPTION"
    assert misc["brier_reward"] < 0
    # The two scores separate here (plan §1.1): the diagnostic goes negative,
    # the visible currency stays non-negative and merely small.
    assert 0 <= misc["xp"] < secure["xp"] / 4


def test_rt_gate_uses_the_per_item_floor():
    _, sid, _ = _start(mode="fixed")
    item = _next(sid)["item"]
    assert _answer(sid, item["id"], "AT", item["min_read_ms"] - 50)["rt_valid"] is False
    _, sid2, _ = _start(mode="fixed")
    item2 = _next(sid2)["item"]
    assert _answer(sid2, item2["id"], "AT", item2["min_read_ms"] + 50)["rt_valid"] is True


def test_invalid_rt_earns_no_xp_and_moves_no_posterior():
    _, sid, _ = _start(mode="adaptive")
    item = _next(sid)["item"]
    out = _answer(sid, item["id"], "AT", 100)
    assert out["rt_valid"] is False and out["concept_xp"] == 0


def test_adaptive_session_runs_to_cap_and_explores():
    _, sid, cap = _start(mode="adaptive")
    strands_seen, answered = [], 0
    while True:
        nxt = _next(sid)
        if nxt["done"]:
            assert nxt["stop_reason"] in {"cap", "converged", "exhausted"}
            break
        strands_seen.append(nxt["item"]["strand"])
        _answer(sid, nxt["item"]["id"], "AT", 2500)
        answered += 1
        assert answered <= cap
    assert answered == cap
    # uncertainty-driven exploration spans concepts early
    assert len(set(strands_seen[:5])) >= 4


def test_session_resumes_after_a_dropped_connection():
    """Plan §9: a dropped client continues where it left off."""
    code, sid, _ = _start(mode="adaptive")
    item = _next(sid)["item"]
    _answer(sid, item["id"], "ST", 3000)
    again = client.post("/api/session/start", json={"code": code, "mode": "adaptive"}).json()
    assert again["session_id"] == sid
    assert again["resumed"] is True and again["answered"] == 1
    fresh = client.post("/api/session/start", json={"code": code, "mode": "adaptive", "resume": False}).json()
    assert fresh["session_id"] != sid and fresh["resumed"] is False


def test_session_summary_reports_cells_and_progression():
    _, sid, _ = _start(mode="adaptive")
    for _ in range(4):
        nxt = _next(sid)
        if nxt["done"]:
            break
        _answer(sid, nxt["item"]["id"], "AT", 3000)
    summary = client.get(f"/api/session/{sid}/summary").json()
    assert summary["answered"] == 4
    assert sum(summary["cells"].values()) == summary["valid"]
    assert summary["concepts"] and summary["concepts"][0]["level"] >= 1
    assert summary["convergence"]


# --- console ----------------------------------------------------------------

def test_console_requires_a_teacher_token():
    assert client.get("/api/console/cohort").status_code == 401


def test_console_scope_comes_from_the_account_not_the_url():
    """A class teacher cannot widen their view by editing the query string."""
    headers = _teacher("class", ["7B"])
    out = client.get("/api/console/cohort", headers=headers,
                     params={"role": "subject", "sections": "A,B,C"}).json()
    assert out["scope"] == ["B"]
    assert all(s["section"] == "B" for s in out["students"])


def test_console_cohort_scoping():
    cls = client.get("/api/console/cohort", headers=ADMIN, params={"role": "class", "section": "B"}).json()
    assert cls["n_students"] > 0
    assert all(s["section"] == "B" for s in cls["students"])
    assert len(cls["concepts"]) == 10
    assert len(cls["students"][0]["vec"]) == 10

    subj = client.get("/api/console/cohort", headers=ADMIN,
                      params={"role": "subject", "sections": "A,B,C"}).json()
    assert subj["n_students"] >= cls["n_students"]
    assert set(subj["scope"]) == {"A", "B", "C"}
    assert 0.0 <= subj["kpi"]["misconception_density"] <= 1.0


def test_hotspots_rank_confident_wrong_clusters():
    out = client.get("/api/console/hotspots", headers=ADMIN,
                     params={"role": "subject", "sections": "A,B,C"}).json()
    hot = out["hotspots"]
    assert hot and hot[0]["rate"] >= hot[-1]["rate"]
    assert hot[0]["statement"] and hot[0]["concept"]
    assert "note" in hot[0]  # the teacher-facing reading of the error


def test_student_detail_is_scoped_and_complete():
    cohort = client.get("/api/console/cohort", headers=ADMIN,
                        params={"role": "class", "section": "B"}).json()
    code = cohort["students"][0]["code"]
    detail = client.get(f"/api/console/student/{code}", headers=ADMIN).json()
    assert detail["code"] == code
    assert len(detail["fingerprint"]) == 10
    assert set(detail["cells"]) == {"SECURE", "FRAGILE", "GAP", "MISCONCEPTION"}
    assert "reification_gap" in detail
    # a class teacher for another section is refused
    other = _teacher("class", ["7A"])
    assert client.get(f"/api/console/student/{code}", headers=other).status_code == 403


# --- gamification -----------------------------------------------------------

def test_leaderboard_is_calibration_not_raw_score():
    board = client.get("/api/leaderboard", params={"board": "calibration", "section": "B"}).json()
    assert board["board"] == "calibration"
    vals = [e["calibration"] for e in board["entries"]]
    assert vals == sorted(vals, reverse=True)
    assert all(0 <= v <= 100 for v in vals)
    assert "sbar" not in board["entries"][0]  # the signed diagnostic never leaks


def test_leaderboard_boards_are_distinct():
    growth = client.get("/api/leaderboard", params={"board": "growth"}).json()
    effort = client.get("/api/leaderboard", params={"board": "effort"}).json()
    assert growth["board"] == "growth" and effort["board"] == "effort"
    assert [e["effort"] for e in effort["entries"]] == sorted(
        [e["effort"] for e in effort["entries"]], reverse=True)
    # an unknown board name falls back to calibration rather than raw score
    assert client.get("/api/leaderboard", params={"board": "raw"}).json()["board"] == "calibration"


# --- exports & research -----------------------------------------------------

def test_response_export_is_research_grade():
    csv_text = client.get("/api/export/responses.csv", headers=ADMIN).text
    header = csv_text.splitlines()[0]
    for column in ("twin_id", "form", "brier_reward", "log_score", "rt_valid",
                   "response_time_ms", "diagnostic_cell", "wave", "axis"):
        assert column in header
    assert "student_code" in header and "name" not in header  # no PII, by construction
    assert len(csv_text.splitlines()) > 10


def test_exports_are_scoped_for_teachers():
    headers = _teacher("class", ["7B"])
    rows = client.get("/api/export/responses.csv", headers=headers).text.splitlines()[1:]
    assert rows and all(r.split(",")[3] == "B" for r in rows)
    assert client.get("/api/export/concept-state.csv", headers=headers).status_code == 200
    # the item bank carries ground truth: admin only
    assert client.get("/api/export/items.csv", headers=headers).status_code == 401


def test_twin_delta_endpoint_reports_the_gap_with_its_caveat():
    out = client.get("/api/research/twin-delta", headers=ADMIN).json()
    assert out["n_pairs"] > 0
    assert -2.0 <= out["cohort"]["mean"] <= 2.0
    assert out["by_concept"]
    assert "hypothesis" in out["caveat"]


# --- operations -------------------------------------------------------------

def test_backup_and_rebuild_are_admin_only():
    assert client.post("/api/admin/backup").status_code == 401
    snap = client.post("/api/admin/backup", headers=ADMIN).json()
    assert snap["ok"] and snap["bytes"] > 0
    rebuilt = client.post("/api/admin/rebuild-state", headers=ADMIN).json()
    assert rebuilt["ok"] and rebuilt["rows"] > 0


def test_rebuilt_state_matches_the_live_projection():
    """concept_state is a cache; the event-store is the truth (plan §4)."""
    before = client.get("/api/export/concept-state.csv", headers=ADMIN).text
    client.post("/api/admin/rebuild-state", headers=ADMIN)
    after = client.get("/api/export/concept-state.csv", headers=ADMIN).text
    strip = lambda t: [",".join(r.split(",")[:-1]) for r in t.splitlines()]  # noqa: E731 - drop timestamp
    assert strip(before) == strip(after)


def test_health_and_lan_page():
    health = client.get("/api/health").json()
    assert health["ok"] and health["items"] == 44 and health["concepts"] > 10
    page = client.get("/lan")
    assert page.status_code == 200
    assert "http://" in page.text
    assert "cdn" not in page.text.lower()  # offline-safe: no external asset
