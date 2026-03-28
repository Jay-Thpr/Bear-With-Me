from __future__ import annotations

import json
from datetime import datetime, timezone
from sqlmodel import select

from app.deps import SESSION_COOKIE
from app.db_models import LessonPlan, Skill, SkillProgressEvent, SkillResearch, SkillSessionSummary
from app.security import create_session_token


def _session_cookie_for(sub: str) -> str:
    return create_session_token(
        subject=sub,
        email=f"{sub}@example.com",
        name="Learner",
        picture=None,
        secret="dev-only-change-jwt-secret",
    )


def test_complete_session_persists_summary_and_session_event(
    client,
    db_session,
    monkeypatch,
) -> None:
    from app.routers import skills as skills_router

    user_sub = "skills-user-1"
    skill = Skill(
        user_sub=user_sub,
        title="Guitar Practice",
        notes="Practice chord changes",
        context={"goal": "Practice chord changes", "level": "Beginner"},
        stats_sessions=0,
        stats_practice_seconds=0,
        stats_level=1,
        stats_progress_percent=0.0,
        stats_mastered=0,
        stats_day_streak=0,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(skill)
    db_session.commit()
    client.cookies.set(SESSION_COOKIE, _session_cookie_for(user_sub))

    monkeypatch.setattr(
        skills_router,
        "estimate_session_progress_delta",
        lambda **_kwargs: {
            "progress_delta": 12.5,
            "mastered_delta": 1,
            "coach_note": "Good control.",
        },
    )
    monkeypatch.setattr(
        skills_router,
        "generate_session_summary_text",
        lambda **_kwargs: "Session summary text.",
    )

    def fail_docs_export(**_kwargs):
        raise RuntimeError("docs unavailable")

    monkeypatch.setattr(skills_router, "export_session_summary_to_docs", fail_docs_export)

    res = client.post(
        f"/api/skills/{skill.id}/complete-session",
        json={"duration_seconds": 300, "session_notes": "Focus on transitions."},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["progress_delta"] == 12.5
    assert body["level_ups"] == 0
    assert body["mastered_delta"] == 1
    assert body["docs_export_url"] is None
    assert body["session_summary"]["summary_text"] == "Session summary text."
    assert body["session_summary"]["extra"]["docs_export"]["status"] == "error"

    db_session.expire_all()
    updated_skill = db_session.get(Skill, skill.id)
    assert updated_skill is not None
    assert updated_skill.stats_sessions == 1
    assert updated_skill.stats_practice_seconds == 300
    assert updated_skill.stats_progress_percent == 12.5
    assert updated_skill.stats_mastered == 1

    session_event = db_session.exec(
        select(SkillProgressEvent).where(
            SkillProgressEvent.skill_id == skill.id,
            SkillProgressEvent.kind == "session",
        )
    ).first()
    assert session_event is not None
    summary_row = db_session.exec(
        select(SkillSessionSummary).where(SkillSessionSummary.skill_id == skill.id)
    ).first()
    assert summary_row is not None
    assert summary_row.coach_note == "Good control."
    assert summary_row.extra["docs_export"]["status"] == "error"


def test_create_skill_with_research_stream_sends_heartbeat_events(
    client,
    db_session,
    monkeypatch,
) -> None:
    """Test that SSE stream sends heartbeat events during research and saves to LessonPlan table."""
    from app.routers import skills as skills_router

    user_sub = "stream-user-1"
    client.cookies.set(SESSION_COOKIE, _session_cookie_for(user_sub))

    # Mock the research generation to take some time (simulate async behavior)
    import asyncio

    async def mock_research(*args, **kwargs):
        await asyncio.sleep(0.1)  # Small delay to allow heartbeat
        return ("# Research Dossier\n\n## Skill decomposition\nBasic scales\n\n## Milestones\n1. Learn C major", {"model": "test-model", "thinking": False})

    def mock_lesson_plan(*args, **kwargs):
        return {
            "coaching_mode": "hands-on",
            "sensory_cues": ["sight", "touch"],
            "safety_flags": [],
            "checkpoints": [
                {"id": 1, "goal": "Hold pick correctly", "confirm_strategy": "Visual check"}
            ],
            "common_mistakes": ["Holding pick too tightly"],
            "tone": "patient and encouraging"
        }

    monkeypatch.setattr(skills_router, "generate_skill_research_dossier", lambda **k: mock_research(**k).__await__().__next__() if hasattr(mock_research(**k), '__await__') else asyncio.run(mock_research(**k)))
    # Actually, let's use a simpler sync mock
    monkeypatch.setattr(
        skills_router,
        "generate_skill_research_dossier",
        lambda **k: ("# Research Dossier\n\n## Skill decomposition\nBasic scales\n\n## Milestones\n1. Learn C major", {"model": "test-model", "thinking": False})
    )
    monkeypatch.setattr(skills_router, "generate_lesson_plan", mock_lesson_plan)

    # Stream the SSE endpoint
    with client.stream(
        "POST",
        "/api/skills/create-with-research-stream",
        json={
            "title": "Guitar",
            "goal": "Play simple songs",
            "level": "Beginner",
            "category": "music"
        },
    ) as response:
        assert response.status_code == 200
        events = []
        for line in response.iter_lines():
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))

        # Verify we got expected event types
        status_events = [e for e in events if e.get("type") == "status"]
        done_events = [e for e in events if e.get("type") == "done"]

        assert len(status_events) >= 3, "Should have at least research, lesson_plan, saving status events"
        assert len(done_events) == 1, "Should have exactly one done event"

        # Verify phases were reported
        phases = {e["phase"] for e in status_events if "phase" in e}
        assert "research" in phases
        assert "lesson_plan" in phases
        assert "saving" in phases

        # Verify done event has skill and research data
        done_event = done_events[0]
        assert "skill" in done_event
        assert "research" in done_event
        assert done_event["skill"]["title"] == "Guitar"

    # Verify database persistence
    db_session.expire_all()
    skill = db_session.exec(select(Skill).where(Skill.user_sub == user_sub)).first()
    assert skill is not None
    assert skill.title == "Guitar"

    # Verify research was saved
    research = db_session.exec(select(SkillResearch).where(SkillResearch.skill_id == skill.id)).first()
    assert research is not None
    assert "Skill decomposition" in research.content

    # Verify lesson plan was saved to LessonPlan table
    lesson_plan = db_session.exec(select(LessonPlan).where(LessonPlan.skill_id == skill.id)).first()
    assert lesson_plan is not None
    assert lesson_plan.coaching_mode == "hands-on"
    assert lesson_plan.tone == "patient and encouraging"
    assert len(lesson_plan.checkpoints) == 1
    assert lesson_plan.checkpoints[0]["goal"] == "Hold pick correctly"
