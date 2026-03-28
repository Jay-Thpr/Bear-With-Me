"""Generate a structured LessonPlan (checkpoints) for a skill using Gemini."""

from __future__ import annotations

import json
import logging

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

_SCHEMA_DESCRIPTION = """
Return ONLY a valid JSON object with this exact shape (no markdown fences, no preamble):

{
  "coaching_mode": "<hands-on | observational | repetition | conceptual>",
  "sensory_cues": ["<e.g. sight, touch, sound>"],
  "safety_flags": ["<e.g. sharp knife>"],
  "checkpoints": [
    {
      "id": 1,
      "goal": "<what the learner must understand or demonstrate>",
      "confirm_strategy": "<how the coach verifies this checkpoint is met>"
    }
  ],
  "common_mistakes": ["<typical pitfall at this level>"],
  "tone": "<e.g. patient and hands-on>"
}

Rules:
- 3–6 checkpoints ordered from prerequisite to advanced.
- coaching_mode must be exactly one of: hands-on, observational, repetition, conceptual.
- sensory_cues, safety_flags, common_mistakes may be empty lists [].
- Do NOT include extra keys. Emit raw JSON only.
"""


def _extract_key_sections(dossier: str, max_chars: int = 8000) -> str:
    """
    Extract sections 3-6 (skill decomposition, milestones, practice, mistakes)
    from a markdown research dossier.

    These sections contain actionable coaching information, unlike the overview
    which is too high-level for checkpoint design.

    Falls back to quarter-in character slice if section detection fails.
    """
    if not dossier or len(dossier) < 1000:
        return dossier

    lines = dossier.split('\n')
    extracted_lines = []
    total_chars = 0
    capturing = False

    # Track which sections we've seen
    seen_sections = set()

    for line in lines:
        stripped = line.strip()

        # Detect section headers (### or ##)
        if stripped.startswith('###') or stripped.startswith('##'):
            section_lower = stripped.lower()

            # Start capturing at skill decomposition or milestones
            if any(keyword in section_lower for keyword in ['decomposition', 'milestone', 'skill breakdown', 'sub-skill']):
                capturing = True
                seen_sections.add('decomposition')
            elif any(keyword in section_lower for keyword in ['practice', 'drill', 'exercise', 'training']):
                capturing = True
                seen_sections.add('practice')
            elif any(keyword in section_lower for keyword in ['mistake', 'pitfall', 'error', 'common issue']):
                capturing = True
                seen_sections.add('mistakes')
            # Stop before resources/references/safety sections
            elif any(keyword in section_lower for keyword in ['resource', 'reference', 'further reading', 'safety', 'ethic']):
                if seen_sections:  # Only stop if we've captured something
                    break

        if capturing:
            extracted_lines.append(line)
            total_chars += len(line) + 1
            if total_chars >= max_chars:
                break

    result = '\n'.join(extracted_lines).strip()

    # Fallback: if extraction failed or too short, use quarter-in slice
    if not result or len(result) < 500:
        quarter = max(0, len(dossier) // 4)
        return dossier[quarter: quarter + max_chars]

    return result


def _lesson_plan_prompt(
    *,
    title: str,
    goal: str,
    level: str,
    category: str | None,
    dossier: str,
) -> str:
    cat = (category or "").strip() or "general"
    # Extract key sections (decomposition, milestones, practice, mistakes) rather than
    # arbitrary character slices. This preserves section boundaries and captures the most
    # actionable coaching information.
    dossier_excerpt = _extract_key_sections(dossier, max_chars=8000) if dossier else ""
    return f"""You are an expert instructional designer. Create a structured coaching lesson plan for a live coaching session.

## Skill context
- Skill: {title.strip()}
- Learner goal: {goal.strip()}
- Starting level: {level.strip()}
- Category: {cat}

## Research dossier excerpt (use to inform checkpoints and common mistakes)
{dossier_excerpt}

## Your task
{_SCHEMA_DESCRIPTION}"""


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------


def generate_lesson_plan(
    *,
    title: str,
    goal: str,
    level: str,
    category: str | None = None,
    dossier: str = "",
) -> dict:
    """
    Generate a LessonPlan dict for a skill.

    Returns a plain dict matching the LessonPlan shape.
    Raises RuntimeError on configuration or generation failures.
    """
    if not settings.gemini_api_key.strip():
        raise RuntimeError("GEMINI_API_KEY is not configured")

    client = genai.Client(api_key=settings.gemini_api_key)
    model = settings.gemini_research_model.strip()
    prompt = _lesson_plan_prompt(
        title=title, goal=goal, level=level, category=category, dossier=dossier
    )

    user_content = types.Content(
        role="user",
        parts=[types.Part.from_text(text=prompt)],
    )

    # Request JSON output if supported
    json_config = types.GenerateContentConfig(
        temperature=0.3,
        max_output_tokens=2048,
        response_mime_type="application/json",
    )
    plain_config = types.GenerateContentConfig(
        temperature=0.3,
        max_output_tokens=2048,
    )

    raw_text: str = ""
    for cfg in (json_config, plain_config):
        try:
            resp = client.models.generate_content(
                model=model,
                contents=[user_content],
                config=cfg,
            )
            for cand in resp.candidates or []:
                content = cand.content
                if not content or not content.parts:
                    continue
                for part in content.parts:
                    if part.text and not getattr(part, "thought", False):
                        raw_text += part.text
            if raw_text.strip():
                break
        except Exception:  # noqa: BLE001
            if cfg is plain_config:
                raise
            continue

    if not raw_text.strip():
        raise RuntimeError("Gemini returned no text for lesson plan generation")

    return _parse_lesson_plan(raw_text)


# ---------------------------------------------------------------------------
# Parsing & validation
# ---------------------------------------------------------------------------

_REQUIRED_KEYS = {"coaching_mode", "checkpoints"}
_VALID_MODES = {"hands-on", "observational", "repetition", "conceptual"}


def _parse_lesson_plan(raw: str) -> dict:
    """Extract and validate the JSON lesson plan from raw model output."""
    text = raw.strip()

    # Strip markdown fences if the model disobeyed
    if text.startswith("```"):
        lines = text.splitlines()
        text = "\n".join(
            line for line in lines if not line.strip().startswith("```")
        ).strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        # Last resort: find first { ... } block
        start = text.find("{")
        end = text.rfind("}") + 1
        if start != -1 and end > start:
            try:
                data = json.loads(text[start:end])
            except json.JSONDecodeError:
                raise RuntimeError(
                    f"Could not parse lesson plan JSON: {exc}"
                ) from exc
        else:
            raise RuntimeError(f"Could not parse lesson plan JSON: {exc}") from exc

    if not isinstance(data, dict):
        raise RuntimeError("Lesson plan response is not a JSON object")

    for key in _REQUIRED_KEYS:
        if key not in data:
            raise RuntimeError(f"Lesson plan missing required key: {key!r}")

    # Normalise coaching_mode
    mode = str(data.get("coaching_mode", "")).lower().strip()
    if mode not in _VALID_MODES:
        logger.warning("Unexpected coaching_mode %r — defaulting to 'hands-on'", mode)
        mode = "hands-on"
    data["coaching_mode"] = mode

    # Ensure list fields exist
    for list_key in ("sensory_cues", "safety_flags", "common_mistakes"):
        if not isinstance(data.get(list_key), list):
            data[list_key] = []

    # Ensure checkpoints is a list with required keys
    checkpoints = data.get("checkpoints", [])
    if not isinstance(checkpoints, list) or not checkpoints:
        raise RuntimeError("Lesson plan must have at least one checkpoint")
    for i, cp in enumerate(checkpoints):
        if not isinstance(cp, dict):
            raise RuntimeError(f"Checkpoint {i} is not an object")
        if "goal" not in cp or "confirm_strategy" not in cp:
            raise RuntimeError(f"Checkpoint {i} missing 'goal' or 'confirm_strategy'")
        if "id" not in cp:
            cp["id"] = i + 1

    if "tone" not in data or not isinstance(data["tone"], str):
        data["tone"] = "encouraging, patient"

    return data
