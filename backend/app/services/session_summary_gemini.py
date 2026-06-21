"""Compact post-session summaries for persistence and future live-memory use."""

from __future__ import annotations

import json
import re

from google import genai
from google.genai import types

from app.config import settings


def _fallback_summary(
    *,
    skill_title: str,
    goal: str,
    learner_level_label: str,
    duration_seconds: int,
    session_notes: str | None,
    coach_note: str,
    progress_delta: float,
    level_ups: int,
    mastered_delta: int,
) -> str:
    mins = max(1, round(duration_seconds / 60))
    notes = (session_notes or "").strip()
    parts = [
        f"Practiced {skill_title} for about {mins} minute(s) toward the goal: {goal}.",
        f"Learner band: {learner_level_label}. Progress gained: {progress_delta:.1f}%.",
        f"Coach note: {coach_note}",
    ]
    if level_ups > 0:
        parts.append(f"Level increased by {level_ups}.")
    if mastered_delta > 0:
        parts.append(f"Mastery signal recorded for {mastered_delta} item(s).")
    if notes:
        parts.append(f"Session notes: {notes[:400]}")
    return " ".join(parts)


def _extract_text(response: types.GenerateContentResponse) -> str:
    parts: list[str] = []
    for cand in response.candidates or []:
        if not cand.content or not cand.content.parts:
            continue
        for part in cand.content.parts:
            if part.text and not part.thought:
                parts.append(part.text)
    return "\n\n".join(parts).strip()


def _parse_summary_text(text: str) -> str:
    text = text.strip()
    if not text:
        raise ValueError("empty summary")
    try:
        payload = json.loads(text)
        summary = payload.get("summary_text")
        if isinstance(summary, str) and summary.strip():
            return summary.strip()
    except json.JSONDecodeError:
        pass

    match = re.search(r'"summary_text"\s*:\s*"([\s\S]*?)"', text)
    if match:
        return match.group(1).strip()

    return text[:4000].strip()


def _build_summary_prompt(
    *,
    skill_title: str,
    goal: str,
    learner_level_label: str,
    duration_seconds: int,
    session_notes: str | None,
    coach_note: str,
    progress_delta: float,
    level_ups: int,
    mastered_delta: int,
) -> str:
    return f"""Write a compact session summary for future coaching memory.

Skill: {skill_title}
Goal: {goal}
Learner level: {learner_level_label}
Duration seconds: {duration_seconds}
Session notes: {(session_notes or "").strip() or "(none)"}
Coach note: {coach_note}
Progress delta: {progress_delta:.1f}
Level ups: {level_ups}
Mastered delta: {mastered_delta}

Return ONLY valid JSON:
{{
  "summary_text": "3-5 sentences max. Include what was worked on, what improved, what still matters next, and how the session affected progress."
}}"""


def generate_session_summary_text(
    *,
    skill_title: str,
    goal: str,
    learner_level_label: str,
    duration_seconds: int,
    session_notes: str | None,
    coach_note: str,
    progress_delta: float,
    level_ups: int,
    mastered_delta: int,
) -> str:
    kwargs = dict(
        skill_title=skill_title,
        goal=goal,
        learner_level_label=learner_level_label,
        duration_seconds=duration_seconds,
        session_notes=session_notes,
        coach_note=coach_note,
        progress_delta=progress_delta,
        level_ups=level_ups,
        mastered_delta=mastered_delta,
    )
    if not settings.gemini_api_key.strip():
        return _fallback_summary(**kwargs)

    prompt = _build_summary_prompt(**kwargs)

    try:
        client = genai.Client(api_key=settings.gemini_api_key)
        response = client.models.generate_content(
            model=settings.gemini_research_model.strip(),
            contents=[
                types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=prompt)],
                )
            ],
            config=types.GenerateContentConfig(
                temperature=0.4,
                max_output_tokens=512,
                response_mime_type="application/json",
            ),
        )
        raw = _extract_text(response)
        return _parse_summary_text(raw)
    except Exception:
        return _fallback_summary(**kwargs)
