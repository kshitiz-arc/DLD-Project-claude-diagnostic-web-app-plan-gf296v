"""Durability guarantees: additive migration and online backup (plan §9)."""

import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# db.py reads HYPERION_DB at import time, so a migration test has to run in a
# fresh interpreter with its own database.
MIGRATION_SCRIPT = r"""
import os, sqlite3, sys
sys.path.insert(0, r"{backend}")
sys.path.insert(0, r"{src}")
db = os.environ["HYPERION_DB"]

# An "old" install: the response table as it existed before axis/twin_id/
# log_score/probe/t_min_ms were added, holding one precious row.
con = sqlite3.connect(db)
con.execute('''CREATE TABLE response (
    id INTEGER PRIMARY KEY, session_id INTEGER, student_id INTEGER, item_id INTEGER,
    strand VARCHAR, form VARCHAR, position_in_session INTEGER, response_option VARCHAR,
    direction_correct BOOLEAN, confidence_high BOOLEAN, diagnostic_cell VARCHAR,
    brier_reward FLOAT, response_time_ms FLOAT, rt_valid BOOLEAN, server_received_at DATETIME)''')
con.execute("INSERT INTO response (id, strand, response_option, brier_reward) VALUES (1, 'Integers', 'AT', 0.99)")
con.commit(); con.close()

from app.db import init_db
init_db()

con = sqlite3.connect(db)
cols = {{r[1] for r in con.execute("PRAGMA table_info(response)")}}
row = con.execute("SELECT strand, response_option, brier_reward FROM response WHERE id = 1").fetchone()
con.close()
missing = {{"axis", "twin_id", "log_score", "probe", "t_min_ms"}} - cols
print("MISSING:" + ",".join(sorted(missing)))
print("ROW:" + repr(row))
"""


def test_additive_migration_keeps_existing_data():
    """A schema addition must never cost a teacher their collected responses."""
    tmp = tempfile.mkdtemp()
    env = dict(os.environ, HYPERION_DB=os.path.join(tmp, "old.db"))
    script = MIGRATION_SCRIPT.format(backend=str(ROOT / "backend"), src=str(ROOT / "src"))
    out = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True, env=env)
    assert out.returncode == 0, out.stderr
    lines = out.stdout.splitlines()
    assert lines[0] == "MISSING:", f"columns were not added: {lines[0]}"
    assert lines[1] == "ROW:('Integers', 'AT', 0.99)", lines[1]


def test_backup_snapshot_opens_and_prunes():
    """A backup that can't be opened is not a backup."""
    from sqlmodel import Session as DbSession

    from app.db import backup_db, engine, init_db
    from app.models import Item
    from app.seed import seed_items

    init_db()
    with DbSession(engine) as s:
        seed_items(s)

    tmp = Path(tempfile.mkdtemp())
    first = backup_db(tmp, keep=2)
    assert first is not None and first.exists()
    con = sqlite3.connect(str(first))
    try:
        n = con.execute("SELECT count(*) FROM item").fetchone()[0]
    finally:
        con.close()
    assert n == len(list(engine.connect().execute(Item.__table__.select())))
    assert n > 0  # the snapshot holds the collected data, not an empty shell

    for _ in range(3):
        backup_db(tmp, keep=2)
    assert len(list(tmp.glob("hyperion-*.db"))) <= 2
