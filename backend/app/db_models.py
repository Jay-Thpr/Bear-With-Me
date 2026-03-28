"""Persistent tables: skills, research artifacts, and progress timeline."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Skill(SQLModel, table=True):
    __tablename__ = "skill"

    id: str = Field(default_factory=_uuid, primary_key=True)
    user_sub: str = Field(index=True, max_length=128)
    title: str = Field(max_length=500)
    notes: Optional[str] = Field(default=None, max_length=20000)
    # Goal, level, category preset, etc. (from onboarding)
    context: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    # Journey stats (updated on session complete)
    stats_sessions: int = Field(default=0)
    stats_practice_seconds: int = Field(default=0)
    stats_level: int = Field(default=1, description="Numeric learner level for dashboard")
    stats_progress_percent: float = Field(
        default=0.0,
        description="0–100 progress toward stats_level + 1",
    )
    stats_mastered: int = Field(default=0, description="Sub-skills / milestones mastered")
    stats_day_streak: int = Field(default=0)
    last_practice_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class SkillResearch(SQLModel, table=True):
    """Versioned research write-ups for a skill (newest-first when listing by created_at)."""

    __tablename__ = "skill_research"

    id: str = Field(default_factory=_uuid, primary_key=True)
    skill_id: str = Field(foreign_key="skill.id", index=True, max_length=36)
    user_sub: str = Field(index=True, max_length=128)
    title: Optional[str] = Field(default=None, max_length=500)
    content: str = Field(default="")
    extra: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=_utcnow)


class SkillProgressEvent(SQLModel, table=True):
    """Append-only timeline: sessions, milestones, levels, notes, etc."""

    __tablename__ = "skill_progress_event"

    id: str = Field(default_factory=_uuid, primary_key=True)
    skill_id: str = Field(foreign_key="skill.id", index=True, max_length=36)
    user_sub: str = Field(index=True, max_length=128)
    kind: str = Field(max_length=64, description="e.g. session, level_up, note, milestone")
    label: Optional[str] = Field(default=None, max_length=500)
    detail: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    metric_value: Optional[float] = Field(default=None)
    created_at: datetime = Field(default_factory=_utcnow)
