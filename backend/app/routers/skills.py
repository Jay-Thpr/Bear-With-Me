from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.database import get_session
from app.db_models import Skill, SkillProgressEvent, SkillResearch
from app.deps import require_user
from app.schemas.skills import (
    LiveCoachContextOut,
    ProgressCreate,
    ProgressOut,
    ResearchCreate,
    ResearchOut,
    SessionCompleteBody,
    SessionCompleteResponse,
    SkillCreate,
    SkillCreateWithResearch,
    SkillOut,
    SkillUpdate,
    SkillWithResearchResponse,
)
from app.services.session_progress_gemini import estimate_session_progress_delta
from app.services.skill_research_gemini import generate_skill_research_dossier

router = APIRouter(prefix="/api/skills", tags=["skills"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _get_skill_owned(
    session: Session,
    skill_id: str,
    user_sub: str,
) -> Skill:
    skill = session.get(Skill, skill_id)
    if skill is None or skill.user_sub != user_sub:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill


def _initial_stats_level(ctx: dict | None) -> int:
    if not ctx:
        return 1
    lev = ctx.get("level")
    if not isinstance(lev, str):
        return 1
    s = lev.lower()
    if "advanced" in s:
        return 3
    if "intermediate" in s:
        return 2
    return 1


def _skill_out(s: Skill) -> SkillOut:
    return SkillOut(
        id=s.id,
        title=s.title,
        notes=s.notes,
        context=s.context,
        stats_sessions=int(s.stats_sessions or 0),
        stats_practice_seconds=int(s.stats_practice_seconds or 0),
        stats_level=int(s.stats_level or 1),
        stats_progress_percent=float(s.stats_progress_percent or 0.0),
        stats_mastered=int(s.stats_mastered or 0),
        stats_day_streak=int(s.stats_day_streak or 0),
        last_practice_at=s.last_practice_at,
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


@router.get("", response_model=dict)
@router.get("/", response_model=dict, include_in_schema=False)
def list_skills(
    user: dict = Depends(require_user),
    session: Session = Depends(get_session),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict:
    user_sub = str(user["id"])
    stmt = (
        select(Skill)
        .where(Skill.user_sub == user_sub)
        .order_by(Skill.updated_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = session.exec(stmt).all()
    return {"skills": [_skill_out(s) for s in rows]}


@router.post("", response_model=SkillOut)
@router.post("/", response_model=SkillOut, include_in_schema=False)
def create_skill(
    body: SkillCreate,
    user: dict = Depends(require_user),
    session: Session = Depends(get_session),
) -> SkillOut:
    user_sub = str(user["id"])
    now = _utcnow()
    skill = Skill(
        user_sub=user_sub,
        title=body.title.strip(),
        notes=body.notes.strip() if body.notes else None,
        created_at=now,
        updated_at=now,
    )
    session.add(skill)
    session.commit()
    session.refresh(skill)
    return _skill_out(skill)


@router.post("/create-with-research", response_model=SkillWithResearchResponse)
def create_skill_with_research(
    body: SkillCreateWithResearch,
    user: dict = Depends(require_user),
    session: Session = Depends(get_session),
) -> SkillWithResearchResponse:
    """
    Run Gemini research (thinking-enabled when the model supports it), then persist
    the skill, research row, and a milestone progress event.
    """
    user_sub = str(user["id"])
    try:
        dossier, meta = generate_skill_research_dossier(
            title=body.title,
            goal=body.goal,
            level=body.level,
            category=body.category,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Research generation failed: {exc}",
        ) from exc

    now = _utcnow()
    cat_raw = body.category.strip() if body.category else None
    ctx = {
        "goal": body.goal.strip(),
        "level": body.level.strip(),
        # Lowercase so preset rings (cooking, music, …) match after reload/API round-trips.
        "category": (cat_raw.lower() if cat_raw else None),
    }
    skill = Skill(
        user_sub=user_sub,
        title=body.title.strip(),
        notes=f"Goal: {body.goal.strip()[:2000]}",
        context=ctx,
        stats_level=_initial_stats_level(ctx),
        created_at=now,
        updated_at=now,
    )
    session.add(skill)
    session.flush()

    research_row = SkillResearch(
        skill_id=skill.id,
        user_sub=user_sub,
        title=f"Research dossier: {body.title.strip()}",
        content=dossier,
        extra=meta,
    )
    session.add(research_row)

    ev = SkillProgressEvent(
        skill_id=skill.id,
        user_sub=user_sub,
        kind="milestone",
        label="Research dossier generated",
        detail={"source": "gemini", "model": meta.get("model")},
    )
    session.add(ev)
    session.commit()
    session.refresh(skill)
    session.refresh(research_row)

    return SkillWithResearchResponse(
        skill=_skill_out(skill),
        research=ResearchOut(
            id=research_row.id,
            skill_id=research_row.skill_id,
            title=research_row.title,
            content=research_row.content,
            extra=research_row.extra,
            created_at=research_row.created_at,
        ),
    )


@router.post("/{skill_id}/complete-session", response_model=SessionCompleteResponse)
def complete_session(
    skill_id: str,
    body: SessionCompleteBody,
    user: dict = Depends(require_user),
    session: Session = Depends(get_session),
) -> SessionCompleteResponse:
    """
    Record a finished practice: add session count + duration, ask Gemini for progress
    delta toward the next level, update streak, persist milestone progress.
    """
    user_sub = str(user["id"])
    skill = _get_skill_owned(session, skill_id, user_sub)
    ctx = skill.context if isinstance(skill.context, dict) else {}
    goal = str(ctx.get("goal", skill.notes or skill.title))[:2000]
    level_label = str(ctx.get("level", "Beginner"))[:64]

    coach = estimate_session_progress_delta(
        skill_title=skill.title,
        goal=goal,
        learner_level_label=level_label,
        duration_seconds=body.duration_seconds,
        session_notes=body.session_notes,
        current_progress_percent=float(skill.stats_progress_percent or 0.0),
        sessions_before=int(skill.stats_sessions or 0),
    )
    delta = float(coach["progress_delta"])
    mastered_delta = int(coach["mastered_delta"])

    skill.stats_sessions = int(skill.stats_sessions or 0) + 1
    skill.stats_practice_seconds = int(skill.stats_practice_seconds or 0) + int(
        body.duration_seconds,
    )

    p = float(skill.stats_progress_percent or 0.0) + delta
    level_ups = 0
    while p >= 100.0:
        p -= 100.0
        level_ups += 1
    skill.stats_level = int(skill.stats_level or 1) + level_ups
    skill.stats_progress_percent = round(p, 2)
    skill.stats_mastered = int(skill.stats_mastered or 0) + mastered_delta

    now = _utcnow()
    today = now.date()
    last = skill.last_practice_at
    if last is None:
        streak = 1
    else:
        ld = last.date() if isinstance(last, datetime) else last
        if ld == today:
            streak = int(skill.stats_day_streak or 0) or 1
        elif ld == today - timedelta(days=1):
            streak = int(skill.stats_day_streak or 0) + 1
        else:
            streak = 1
    skill.stats_day_streak = streak
    skill.last_practice_at = now
    skill.updated_at = now

    ev = SkillProgressEvent(
        skill_id=skill.id,
        user_sub=user_sub,
        kind="session",
        label=f"Session {skill.stats_sessions}",
        detail={
            "duration_seconds": body.duration_seconds,
            "progress_delta": delta,
            "coach_note": coach["coach_note"],
            "level_ups": level_ups,
            "mastered_delta": mastered_delta,
        },
        metric_value=float(skill.stats_progress_percent),
    )
    session.add(skill)
    session.add(ev)
    session.commit()
    session.refresh(skill)

    return SessionCompleteResponse(
        skill=_skill_out(skill),
        coach_note=coach["coach_note"],
        progress_delta=delta,
        level_ups=level_ups,
        mastered_delta=mastered_delta,
    )


_RESEARCH_LIVE_CONTEXT_MAX_CHARS = 12_000
_PROGRESS_EVENTS_FOR_LIVE = 25


@router.get("/{skill_id}/live-coach-context", response_model=LiveCoachContextOut)
def live_coach_context(
    skill_id: str,
    user: dict = Depends(require_user),
    session: Session = Depends(get_session),
) -> LiveCoachContextOut:
    """
    Bundle SQLite-backed skill, latest research dossier, and recent progress events
    for the browser to build Gemini Live system instructions.
    """
    user_sub = str(user["id"])
    skill = _get_skill_owned(session, skill_id, user_sub)

    r_stmt = (
        select(SkillResearch)
        .where(SkillResearch.skill_id == skill_id)
        .order_by(SkillResearch.created_at.desc())
        .limit(1)
    )
    r = session.exec(r_stmt).first()
    research_out: Optional[ResearchOut] = None
    if r is not None:
        content = r.content or ""
        if len(content) > _RESEARCH_LIVE_CONTEXT_MAX_CHARS:
            content = (
                content[:_RESEARCH_LIVE_CONTEXT_MAX_CHARS]
                + "\n\n[Research dossier truncated for live session context.]"
            )
        research_out = ResearchOut(
            id=r.id,
            skill_id=r.skill_id,
            title=r.title,
            content=content,
            extra=r.extra,
            created_at=r.created_at,
        )

    p_stmt = (
        select(SkillProgressEvent)
        .where(SkillProgressEvent.skill_id == skill_id)
        .order_by(SkillProgressEvent.created_at.desc())
        .limit(_PROGRESS_EVENTS_FOR_LIVE)
    )
    prog_rows = session.exec(p_stmt).all()
    events = [
        ProgressOut(
            id=e.id,
            skill_id=e.skill_id,
            kind=e.kind,
            label=e.label,
            detail=e.detail,
            metric_value=e.metric_value,
            created_at=e.created_at,
        )
        for e in prog_rows
    ]

    return LiveCoachContextOut(
        skill=_skill_out(skill),
        research=research_out,
        progress_events=events,
    )


@router.get("/{skill_id}", response_model=SkillOut)
def get_skill(
    skill_id: str,
    user: dict = Depends(require_user),
    session: Session = Depends(get_session),
) -> SkillOut:
    user_sub = str(user["id"])
    s = _get_skill_owned(session, skill_id, user_sub)
    return _skill_out(s)


@router.patch("/{skill_id}", response_model=SkillOut)
def update_skill(
    skill_id: str,
    body: SkillUpdate,
    user: dict = Depends(require_user),
    session: Session = Depends(get_session),
) -> SkillOut:
    user_sub = str(user["id"])
    s = _get_skill_owned(session, skill_id, user_sub)
    if body.title is not None:
        s.title = body.title.strip()
    if body.notes is not None:
        s.notes = body.notes.strip() if body.notes else None
    s.updated_at = _utcnow()
    session.add(s)
    session.commit()
    session.refresh(s)
    return _skill_out(s)


@router.delete("/{skill_id}")
def delete_skill(
    skill_id: str,
    user: dict = Depends(require_user),
    session: Session = Depends(get_session),
) -> dict[str, bool]:
    user_sub = str(user["id"])
    s = _get_skill_owned(session, skill_id, user_sub)
    for row in session.exec(
        select(SkillResearch).where(SkillResearch.skill_id == skill_id),
    ).all():
        session.delete(row)
    for row in session.exec(
        select(SkillProgressEvent).where(SkillProgressEvent.skill_id == skill_id),
    ).all():
        session.delete(row)
    session.delete(s)
    session.commit()
    return {"ok": True}


# --- Research ---


@router.get("/{skill_id}/research", response_model=dict)
def list_research(
    skill_id: str,
    user: dict = Depends(require_user),
    session: Session = Depends(get_session),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> dict:
    user_sub = str(user["id"])
    _get_skill_owned(session, skill_id, user_sub)
    stmt = (
        select(SkillResearch)
        .where(SkillResearch.skill_id == skill_id)
        .order_by(SkillResearch.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = session.exec(stmt).all()
    return {
        "items": [
            ResearchOut(
                id=r.id,
                skill_id=r.skill_id,
                title=r.title,
                content=r.content,
                extra=r.extra,
                created_at=r.created_at,
            )
            for r in rows
        ]
    }


@router.get("/{skill_id}/research/latest", response_model=ResearchOut)
def latest_research(
    skill_id: str,
    user: dict = Depends(require_user),
    session: Session = Depends(get_session),
) -> ResearchOut:
    user_sub = str(user["id"])
    _get_skill_owned(session, skill_id, user_sub)
    stmt = (
        select(SkillResearch)
        .where(SkillResearch.skill_id == skill_id)
        .order_by(SkillResearch.created_at.desc())
        .limit(1)
    )
    r = session.exec(stmt).first()
    if r is None:
        raise HTTPException(
            status_code=404,
            detail="No research entries yet for this skill.",
        )
    return ResearchOut(
        id=r.id,
        skill_id=r.skill_id,
        title=r.title,
        content=r.content,
        extra=r.extra,
        created_at=r.created_at,
    )


@router.post("/{skill_id}/research", response_model=ResearchOut)
def add_research(
    skill_id: str,
    body: ResearchCreate,
    user: dict = Depends(require_user),
    session: Session = Depends(get_session),
) -> ResearchOut:
    user_sub = str(user["id"])
    s = _get_skill_owned(session, skill_id, user_sub)
    row = SkillResearch(
        skill_id=s.id,
        user_sub=user_sub,
        title=body.title.strip() if body.title else None,
        content=body.content,
        extra=body.extra,
    )
    s.updated_at = _utcnow()
    session.add(row)
    session.add(s)
    session.commit()
    session.refresh(row)
    return ResearchOut(
        id=row.id,
        skill_id=row.skill_id,
        title=row.title,
        content=row.content,
        extra=row.extra,
        created_at=row.created_at,
    )


# --- Progress ---


@router.get("/{skill_id}/progress", response_model=dict)
def list_progress(
    skill_id: str,
    user: dict = Depends(require_user),
    session: Session = Depends(get_session),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict:
    user_sub = str(user["id"])
    _get_skill_owned(session, skill_id, user_sub)
    stmt = (
        select(SkillProgressEvent)
        .where(SkillProgressEvent.skill_id == skill_id)
        .order_by(SkillProgressEvent.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = session.exec(stmt).all()
    return {
        "events": [
            ProgressOut(
                id=e.id,
                skill_id=e.skill_id,
                kind=e.kind,
                label=e.label,
                detail=e.detail,
                metric_value=e.metric_value,
                created_at=e.created_at,
            )
            for e in rows
        ]
    }


@router.post("/{skill_id}/progress", response_model=ProgressOut)
def add_progress(
    skill_id: str,
    body: ProgressCreate,
    user: dict = Depends(require_user),
    session: Session = Depends(get_session),
) -> ProgressOut:
    user_sub = str(user["id"])
    s = _get_skill_owned(session, skill_id, user_sub)
    ev = SkillProgressEvent(
        skill_id=s.id,
        user_sub=user_sub,
        kind=body.kind.strip(),
        label=body.label.strip() if body.label else None,
        detail=body.detail,
        metric_value=body.metric_value,
    )
    s.updated_at = _utcnow()
    session.add(ev)
    session.add(s)
    session.commit()
    session.refresh(ev)
    return ProgressOut(
        id=ev.id,
        skill_id=ev.skill_id,
        kind=ev.kind,
        label=ev.label,
        detail=ev.detail,
        metric_value=ev.metric_value,
        created_at=ev.created_at,
    )
