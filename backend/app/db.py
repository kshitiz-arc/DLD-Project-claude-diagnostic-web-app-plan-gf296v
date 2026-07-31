"""Database engine — SQLite in WAL mode (plan §3, §9).

WAL + a busy timeout + short transactions comfortably handle ~30 concurrent
students on a single host. The ORM abstracts the store, so a later move to
Postgres is a config change, not a rewrite.
"""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import event, inspect, text
from sqlmodel import Session, SQLModel, create_engine

DB_PATH = os.environ.get("HYPERION_DB", "hyperion.db")
BACKUP_DIR = Path(os.environ.get("HYPERION_BACKUP_DIR", "backups"))
BACKUP_KEEP = int(os.environ.get("HYPERION_BACKUP_KEEP", "24"))
_url = f"sqlite:///{DB_PATH}"

engine = create_engine(_url, echo=False, connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_conn, _record):  # pragma: no cover - trivial
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL;")
    cur.execute("PRAGMA busy_timeout=5000;")
    cur.execute("PRAGMA foreign_keys=ON;")
    cur.close()


def _sql_type(column) -> str:
    try:
        return column.type.compile(dialect=engine.dialect)
    except Exception:  # pragma: no cover - exotic types fall back to a blob
        return "BLOB"


def _add_missing_columns() -> None:
    """Additively migrate an existing ``.db`` to the current model.

    A teacher-operated pilot cannot be asked to delete collected data because
    a column was added, and this project has no migration framework. Additive
    ``ALTER TABLE ... ADD COLUMN`` covers every schema change made so far;
    anything destructive (dropping or retyping a column) is deliberately *not*
    automated — it needs a human and a backup.
    """
    inspector = inspect(engine)
    existing = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            if table.name not in existing:
                continue
            have = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in have:
                    continue
                ddl = f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {_sql_type(column)}'
                if column.default is not None and getattr(column.default, "is_scalar", False):
                    ddl += f" DEFAULT {column.default.arg!r}"
                conn.execute(text(ddl))


def init_db() -> None:
    # Importing the models is what registers them on SQLModel.metadata; without
    # it both create_all and the migration below would silently do nothing.
    from . import models  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _add_missing_columns()


def get_session():
    with Session(engine) as session:
        yield session


# --- backups (plan §9: single-laptop failure must never lose a cohort) ------

def backup_db(directory: Optional[Path] = None, keep: int = BACKUP_KEEP) -> Optional[Path]:
    """Take a consistent online snapshot of the live database.

    Uses SQLite's own backup API rather than a file copy: under WAL a plain
    copy can capture a torn state, and the point of a backup is that it opens.
    Returns the snapshot path, or ``None`` for an in-memory database.
    """
    if DB_PATH in (":memory:", "") or DB_PATH.startswith("file::memory:"):
        return None
    target_dir = Path(directory) if directory else BACKUP_DIR
    target_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = target_dir / f"hyperion-{stamp}.db"
    src = sqlite3.connect(DB_PATH)
    try:
        dst = sqlite3.connect(str(dest))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    _prune_backups(target_dir, keep)
    return dest


def _prune_backups(directory: Path, keep: int) -> None:
    """Keep the newest ``keep`` snapshots so a long pilot can't fill the disk."""
    snaps = sorted(directory.glob("hyperion-*.db"), key=lambda p: p.name, reverse=True)
    for stale in snaps[max(1, keep):]:
        try:
            stale.unlink()
        except OSError:  # pragma: no cover - a locked file is not worth failing over
            pass
