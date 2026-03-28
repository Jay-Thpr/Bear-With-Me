"""Ask Gemini for session progress contribution (delta) after a practice session."""

from __future__ import annotations

import json
import re

from google import genai
from google.genai import types

from app.config import settings


def _parse_json_object(text: str) -> dict:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            return json.loads(m.group(0))
        raise


def estimate_session_progress_delta(
    *,
    skill_title: str,
    goal: str,
    learner_level_label: str,
    duration_seconds: int,
    session_notes: str | None,
    current_progress_percent: float,
    sessions_before: int,
) -> dict:
    """
    Returns a dict with:
      progress_delta: float (0–40 typical) added to the skill bar
      mastered_delta: int (0 or 1)
      coach_note: str
    """
    if not settings.gemini_api_key.strip():
        # Dev fallback: scale a bit by duration
        base = min(25.0, max(3.0, duration_seconds / 120.0))
        return {
            "progress_delta": round(base, 1),
            "mastered_delta": 0,
            "coach_note": "Practice logged (configure GEMINI_API_KEY for coach estimates).",
        }

    client = genai.Client(api_key=settings.gemini_api_key)
    model = settings.gemini_research_model.strip()

    notes = (session_notes or "").strip() or "(no extra notes)"
    prompt = f"""You evaluate a single practice session for a learner.

Skill: {skill_title}
Stated goal: {goal}
Learner band (from onboarding): {learner_level_label}
Session length: {duration_seconds} seconds
Sessions completed before this one: {sessions_before}
Current progress toward next level (0-100): {current_progress_percent:.1f}

Learner / coach notes from this session:
{notes}

Reply with ONLY valid JSON (no markdown fences):
{{
  "progress_delta": <number 0-35 — how much to ADD to their progress bar for this session>,
  "mastered_delta": <0 or 1 — 1 only if they clearly mastered a concrete sub-skill this session>,
  "coach_note": "<one short encouraging sentence>"
}}

Be fair: short sessions get smaller deltas; strong evidence of mastery allows larger deltas."""

    response = client.models.generate_content(
        model=model,
        contents=[
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=prompt)],
            )
        ],
        config=types.GenerateContentConfig(temperature=0.4, max_output_tokens=512),
    )
    text = ""
    for cand in response.candidates or []:
        if not cand.content or not cand.content.parts:
            continue
        for part in cand.content.parts:
            if part.text and not part.thought:
                text += part.text
    if not text.strip():
        raise RuntimeError("Gemini returned no text for session progress")

    data = _parse_json_object(text)
    delta = float(data.get("progress_delta", 8))
    delta = max(0.0, min(40.0, delta))
    md = int(data.get("mastered_delta", 0))
    md = 1 if md >= 1 else 0
    note = str(data.get("coach_note", "Nice work—keep the rhythm."))[:500]
    return {
        "progress_delta": delta,
        "mastered_delta": md,
        "coach_note": note,
    }
