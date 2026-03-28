"""SQLite engine, sessions, and table creation."""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import event, inspect, text
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from app.config import settings

_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        url = settings.database_url_resolved
        connect_args = {}
        if url.startswith("sqlite"):
            connect_args["check_same_thread"] = False
        _engine = create_engine(url, connect_args=connect_args)
        if url.startswith("sqlite"):

            @event.listens_for(_engine, "connect")
            def _set_sqlite_pragma(dbapi_conn: object, _record: object) -> None:
                cursor = dbapi_conn.cursor()
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.close()

    return _engine


def _migrate_sqlite_skill_context(engine: Engine) -> None:
    """Add skill.context JSON column for existing SQLite DBs."""
    url = settings.database_url_resolved
    if not url.startswith("sqlite"):
        return
    with engine.connect() as conn:
        insp = inspect(conn)
        if not insp.has_table("skill"):
            return
        cols = {c["name"] for c in insp.get_columns("skill")}
        if "context" in cols:
            return
        conn.execute(text("ALTER TABLE skill ADD COLUMN context JSON"))
        conn.commit()


def _migrate_sqlite_skill_stats(engine: Engine) -> None:
    """Add journey stat columns on skill."""
    url = settings.database_url_resolved
    if not url.startswith("sqlite"):
        return
    with engine.connect() as conn:
        insp = inspect(conn)
        if not insp.has_table("skill"):
            return
        cols = {c["name"] for c in insp.get_columns("skill")}
        alters: list[str] = []
        if "stats_sessions" not in cols:
            alters.append("ALTER TABLE skill ADD COLUMN stats_sessions INTEGER DEFAULT 0")
        if "stats_practice_seconds" not in cols:
            alters.append(
                "ALTER TABLE skill ADD COLUMN stats_practice_seconds INTEGER DEFAULT 0",
            )
        if "stats_level" not in cols:
            alters.append("ALTER TABLE skill ADD COLUMN stats_level INTEGER DEFAULT 1")
        if "stats_progress_percent" not in cols:
            alters.append("ALTER TABLE skill ADD COLUMN stats_progress_percent REAL DEFAULT 0")
        if "stats_mastered" not in cols:
            alters.append("ALTER TABLE skill ADD COLUMN stats_mastered INTEGER DEFAULT 0")
        if "stats_day_streak" not in cols:
            alters.append("ALTER TABLE skill ADD COLUMN stats_day_streak INTEGER DEFAULT 0")
        if "last_practice_at" not in cols:
            alters.append("ALTER TABLE skill ADD COLUMN last_practice_at DATETIME")
        for stmt in alters:
            conn.execute(text(stmt))
        if alters:
            conn.commit()


def init_db() -> None:
    """Create database file (if SQLite) and all tables."""
    from app.db_models import Skill, SkillProgressEvent, SkillResearch  # noqa: F401

    settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    engine = get_engine()
    SQLModel.metadata.create_all(engine)
    _migrate_sqlite_skill_context(engine)
    _migrate_sqlite_skill_stats(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(get_engine()) as session:
        yield session
