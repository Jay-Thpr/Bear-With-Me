"""Gemini-powered skill research dossier (thinking-enabled when supported)."""

from __future__ import annotations

from google import genai
from google.genai import types

from app.config import settings


def _text_from_response(response: types.GenerateContentResponse) -> str:
    chunks: list[str] = []
    for cand in response.candidates or []:
        content = cand.content
        if not content or not content.parts:
            continue
        for part in content.parts:
            if not part.text:
                continue
            # Prefer final answer text; skip internal thought traces for storage
            if part.thought is True:
                continue
            chunks.append(part.text)
    out = "\n\n".join(chunks).strip()
    if out:
        return out
    # Fallback: any text (including thoughts) if nothing else
    for cand in response.candidates or []:
        content = cand.content
        if not content or not content.parts:
            continue
        for part in content.parts:
            if part.text:
                chunks.append(part.text)
    return "\n\n".join(chunks).strip()


def _research_prompt(
    *,
    title: str,
    goal: str,
    level: str,
    category: str | None,
) -> str:
    cat = (category or "").strip() or "general / mixed"
    return f"""You are an expert learning scientist and domain coach. Produce a deep, structured research dossier for someone learning this skill.

## Inputs
- **Skill**: {title.strip()}
- **Learner goal (next sessions)**: {goal.strip()}
- **Starting level**: {level.strip()}
- **Focus area / category**: {cat}

## Instructions
Use extended reasoning to build a wide, practical knowledge base for this learner. Output **Markdown only** (no preamble outside the document).

Include these sections (use ### headings):
1. **Overview** — what this skill is, why it matters for this goal.
2. **Core concepts & vocabulary** — key terms and mental models.
3. **Skill decomposition** — sub-skills in a sensible order, with dependencies.
4. **Milestones** — 4–8 concrete milestones from beginner toward the stated goal, aligned with the starting level.
5. **Practice design** — drills, feedback loops, how to self-assess, suggested session structure.
6. **Common mistakes & fixes** — typical pitfalls for this level.
7. **Resources & references** — types of resources to seek (books, communities, tools); name well-known frameworks when relevant; avoid unverifiable links.
8. **Safety / ethics** (if relevant to the domain) — brief notes.

Be specific to the skill and goal, not generic filler. Aim for dense, actionable content suitable for coaching and spaced repetition."""


def generate_skill_research_dossier(
    *,
    title: str,
    goal: str,
    level: str,
    category: str | None = None,
) -> tuple[str, dict]:
    """
    Returns (markdown_dossier, metadata dict for SkillResearch.extra).
    """
    if not settings.gemini_api_key.strip():
        raise RuntimeError("GEMINI_API_KEY is not configured")

    client = genai.Client(api_key=settings.gemini_api_key)
    model = settings.gemini_research_model.strip()
    prompt = _research_prompt(title=title, goal=goal, level=level, category=category)

    user_content = types.Content(
        role="user",
        parts=[types.Part.from_text(text=prompt)],
    )

    thinking = types.ThinkingConfig(
        thinking_level=types.ThinkingLevel.HIGH,
        include_thoughts=False,
    )
    config = types.GenerateContentConfig(
        temperature=0.7,
        max_output_tokens=8192,
        thinking_config=thinking,
    )

    def _call(cfg: types.GenerateContentConfig | None) -> types.GenerateContentResponse:
        return client.models.generate_content(
            model=model,
            contents=[user_content],
            config=cfg,
        )

    try:
        response = _call(config)
    except Exception:
        # Fallback: model may not support thinking_config
        response = _call(
            types.GenerateContentConfig(
                temperature=0.7,
                max_output_tokens=8192,
            ),
        )

    text = _text_from_response(response)
    if not text:
        raise RuntimeError("Gemini returned no text for skill research")

    meta: dict = {
        "model": model,
        "thinking": True,
    }
    return text, meta
