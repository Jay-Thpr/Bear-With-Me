"""API shapes for skills, research, and progress (decoupled from ORM rows)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class SkillCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=20000)


class SkillCreateWithResearch(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    goal: str = Field(min_length=1, max_length=20000)
    level: str = Field(min_length=1, max_length=64, description="e.g. Beginner")
    category: Optional[str] = Field(
        default=None,
        max_length=64,
        description="Preset from skill select, e.g. cooking, music",
    )


class SkillUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=20000)


class SkillOut(BaseModel):
    id: str
    title: str
    notes: Optional[str]
    context: Optional[dict[str, Any]] = None
    stats_sessions: int = 0
    stats_practice_seconds: int = 0
    stats_level: int = 1
    stats_progress_percent: float = 0.0
    stats_mastered: int = 0
    stats_day_streak: int = 0
    last_practice_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class SessionCompleteBody(BaseModel):
    duration_seconds: int = Field(ge=0, le=86400)
    session_notes: Optional[str] = Field(default=None, max_length=8000)


class SessionCompleteResponse(BaseModel):
    skill: SkillOut
    coach_note: str
    progress_delta: float
    level_ups: int
    mastered_delta: int


class ResearchCreate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=500)
    content: str = Field(min_length=1)
    extra: Optional[dict[str, Any]] = None


class ResearchOut(BaseModel):
    id: str
    skill_id: str
    title: Optional[str]
    content: str
    extra: Optional[dict[str, Any]]
    created_at: datetime


class ProgressCreate(BaseModel):
    kind: str = Field(min_length=1, max_length=64)
    label: Optional[str] = Field(default=None, max_length=500)
    detail: Optional[dict[str, Any]] = None
    metric_value: Optional[float] = None


class ProgressOut(BaseModel):
    id: str
    skill_id: str
    kind: str
    label: Optional[str]
    detail: Optional[dict[str, Any]]
    metric_value: Optional[float]
    created_at: datetime


class SkillWithResearchResponse(BaseModel):
    skill: SkillOut
    research: ResearchOut


class LiveCoachContextOut(BaseModel):
    """Skill + latest research + recent progress for Gemini Live system instructions."""

    skill: SkillOut
    research: Optional[ResearchOut] = None
    progress_events: list[ProgressOut] = Field(default_factory=list)
