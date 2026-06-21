"""Backend-owned live system-instruction assembly."""

from __future__ import annotations

import re
from dataclasses import dataclass

from sqlmodel import Session, select

from app.db_models import Skill, SkillProgressEvent, SkillResearch, SkillSessionSummary
from app.schemas.skills import LiveSystemInstructionOut

LIVE_CONTEXT_VERSION = "v1"
MAX_SYSTEM_INSTRUCTION_CHARS = 9000
MAX_RESEARCH_CHARS = 4200
MAX_SUMMARY_SECTION_CHARS = 2200
MAX_EVENTS_SECTION_CHARS = 1400
MAX_RECENT_SUMMARIES = 5
MAX_RECENT_EVENTS = 8

BASE_COACH_SYSTEM = """You are a concise, encouraging real-time skills coach. The learner is on camera and microphone. Give short, specific spoken feedback.

You have a tool request_form_correction for an annotated still (arrows/labels on the current camera frame). When you call it, you MUST fill coachingSuggestions with the exact corrections to draw—the image step will follow that text, not invent new advice. Summarize what you just said in clear, drawable terms (what to move and which direction). Optional focus narrows the body area. After the tool returns, briefly confirm what was marked up.

Annotated stills are rate-limited: at most one successful image every 30 seconds. If the tool returns a rate-limit error, acknowledge briefly and continue coaching without requesting another still until later."""


@dataclass
class LiveInstructionBundle:
    system_instruction: str
    source_research_id: str | None
    source_progress_event_ids: list[str]
    truncated: bool


def build_generic_system_instruction() -> str:
    return (
        f"{BASE_COACH_SYSTEM}\n\n"
        "No persisted app context was provided for this session. Ask one short clarifying question if needed, "
        "then coach directly from what you can observe."
    )


def _fetch_skill_context_data(
    *,
    session: Session,
    skill: Skill,
) -> tuple[SkillResearch | None, list[SkillSessionSummary], list[SkillProgressEvent]]:
    research_row = session.exec(
        select(SkillResearch)
        .where(SkillResearch.skill_id == skill.id)
        .order_by(SkillResearch.created_at.desc())
        .limit(1)
    ).first()

    summaries = session.exec(
        select(SkillSessionSummary)
        .where(SkillSessionSummary.skill_id == skill.id)
        .order_by(SkillSessionSummary.created_at.desc())
        .limit(MAX_RECENT_SUMMARIES)
    ).all()

    progress_events = session.exec(
        select(SkillProgressEvent)
        .where(SkillProgressEvent.skill_id == skill.id)
        .order_by(SkillProgressEvent.created_at.desc())
        .limit(MAX_RECENT_EVENTS)
    ).all()

    return research_row, list(summaries), list(progress_events)


def build_live_system_instruction_for_skill(
    *,
    session: Session,
    skill: Skill,
) -> LiveInstructionBundle:
    research_row, summaries, progress_events = _fetch_skill_context_data(
        session=session, skill=skill
    )

    truncated = False
    sections: list[str] = [BASE_COACH_SYSTEM]
    sections.append(_build_skill_block(skill))

    if research_row and research_row.content.strip():
        research_digest, research_truncated = _build_research_digest(research_row.content)
        truncated = truncated or research_truncated
        if research_digest:
            sections.append(research_digest)

    summary_block, summary_truncated = _build_summary_block(summaries)
    truncated = truncated or summary_truncated
    if summary_block:
        sections.append(summary_block)

    events_block, events_truncated = _build_events_block(progress_events)
    truncated = truncated or events_truncated
    if events_block:
        sections.append(events_block)

    sections.append(
        "Stay aligned with the stored skill title, declared goal, recorded stats, and recent practice history. "
        "Do not invent prior sessions, milestones, or mastery."
    )

    system_instruction = "\n\n---\n\n".join(section.strip() for section in sections if section.strip())
    if len(system_instruction) > MAX_SYSTEM_INSTRUCTION_CHARS:
        truncated = True
        system_instruction = (
            system_instruction[:MAX_SYSTEM_INSTRUCTION_CHARS]
            + "\n\n[Live context truncated to fit instruction budget.]"
        )

    return LiveInstructionBundle(
        system_instruction=system_instruction,
        source_research_id=research_row.id if research_row else None,
        source_progress_event_ids=[event.id for event in progress_events],
        truncated=truncated,
    )


def build_live_system_instruction_response(
    *,
    session: Session,
    skill: Skill,
) -> LiveSystemInstructionOut:
    bundle = build_live_system_instruction_for_skill(session=session, skill=skill)
    return LiveSystemInstructionOut(
        system_instruction=bundle.system_instruction,
        live_context_version=LIVE_CONTEXT_VERSION,
        skill_id=skill.id,
        source_research_id=bundle.source_research_id,
        source_progress_event_ids=bundle.source_progress_event_ids,
        truncated=bundle.truncated,
    )


def _build_skill_block(skill: Skill) -> str:
    ctx = skill.context if isinstance(skill.context, dict) else {}
    goal = _clean_text(str(ctx.get("goal", skill.notes or "")).strip())
    level = _clean_text(str(ctx.get("level", "")).strip())
    category = _clean_text(str(ctx.get("category", "")).strip())

    lines = [
        "## Learner profile",
        f"- Skill title: {skill.title}",
    ]
    if goal:
        lines.append(f"- Goal: {goal}")
    if level:
        lines.append(f"- Declared level: {level}")
    if category:
        lines.append(f"- Category: {category}")
    lines.extend(
        [
            f"- Recorded sessions: {int(skill.stats_sessions or 0)}",
            f"- Total practice seconds: {int(skill.stats_practice_seconds or 0)}",
            f"- Level: {int(skill.stats_level or 1)}",
            f"- Progress toward next level: {float(skill.stats_progress_percent or 0.0):.1f}%",
            f"- Mastered count: {int(skill.stats_mastered or 0)}",
            f"- Day streak: {int(skill.stats_day_streak or 0)}",
        ]
    )
    return "\n".join(lines)


def _build_research_digest(content: str) -> tuple[str, bool]:
    sections = _split_markdown_sections(content)
    preferred_patterns = [
        "milestone",
        "practice design",
        "common mistakes",
        "safety",
        "core concepts",
        "skill decomposition",
        "resources",
    ]
    picked: list[str] = []
    seen_titles: set[str] = set()

    for pattern in preferred_patterns:
        for title, body in sections:
            normalized = title.lower()
            if pattern in normalized and normalized not in seen_titles:
                picked.append(f"### {title}\n{body}".strip())
                seen_titles.add(normalized)

    if not picked and content.strip():
        picked.append(content.strip())

    digest = "\n\n".join(picked).strip()
    truncated = len(digest) > MAX_RESEARCH_CHARS
    if truncated:
        digest = digest[:MAX_RESEARCH_CHARS] + "\n\n[Research digest truncated.]"

    return (f"## Research digest\n{digest}".strip() if digest else "", truncated)


def _build_summary_block(summaries: list[SkillSessionSummary]) -> tuple[str, bool]:
    if not summaries:
        return "", False

    lines = ["## Recent session summaries"]
    for summary in summaries:
        lines.append(
            f"- Session {summary.session_number}: {_clean_text(summary.summary_text, 400)}"
        )

    block = "\n".join(lines)
    truncated = len(block) > MAX_SUMMARY_SECTION_CHARS
    if truncated:
        block = block[:MAX_SUMMARY_SECTION_CHARS] + "\n[Session summaries truncated.]"
    return block, truncated


def _build_events_block(events: list[SkillProgressEvent]) -> tuple[str, bool]:
    important = [
        event
        for event in events
        if event.kind in {"milestone", "level_up", "session"} or (event.label or "").strip()
    ]
    if not important:
        return "", False

    lines = ["## Recent progress signals"]
    for event in important:
        detail = ""
        if isinstance(event.detail, dict) and event.detail:
            coach_note = event.detail.get("coach_note")
            if isinstance(coach_note, str) and coach_note.strip():
                detail = coach_note.strip()
            else:
                detail = _clean_text(str(event.detail), 180)
        label = (event.label or event.kind).strip()
        lines.append(f"- [{event.kind}] {label}: {detail}" if detail else f"- [{event.kind}] {label}")

    block = "\n".join(lines)
    truncated = len(block) > MAX_EVENTS_SECTION_CHARS
    if truncated:
        block = block[:MAX_EVENTS_SECTION_CHARS] + "\n[Progress signals truncated.]"
    return block, truncated


def _split_markdown_sections(content: str) -> list[tuple[str, str]]:
    lines = content.splitlines()
    sections: list[tuple[str, list[str]]] = []
    current_title = "Overview"
    current_lines: list[str] = []

    for line in lines:
        if re.match(r"^\s*#{2,3}\s+", line):
            if current_lines:
                sections.append((current_title, current_lines))
            current_title = re.sub(r"^\s*#{2,3}\s+", "", line).strip()
            current_lines = []
        else:
            current_lines.append(line)

    if current_lines:
        sections.append((current_title, current_lines))

    return [(title, "\n".join(lines).strip()) for title, lines in sections if "\n".join(lines).strip()]


def _clean_text(text: str, max_chars: int | None = None) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if max_chars is not None and len(text) > max_chars:
        return text[:max_chars].rstrip() + "…"
    return text
