"""Text-to-image character sprites via Gemini image model (project name: Nano Banana)."""

from __future__ import annotations

from google import genai
from google.genai import types

from app.config import settings

DEFAULT_STYLE = """
Visual requirements:
- One game-ready character, centered, full-body or waist-up.
- Pixel-art or chunky retro style that reads well at small sizes.
- Plain studio background (solid color or soft gradient) — not transparent; background will be removed in a second step.
- Single character only, no text in the image, no watermark.
- High contrast silhouette, friendly expression.
"""

EDIT_INSTRUCTION_STYLE = """
Rules for the edit:
- Preserve the character's identity, palette, and pixel-art (or illustrated) style.
- Integrate new props naturally (scale, perspective, shading) so they look part of the same image.
- Use a simple solid or softly graded studio background (not transparent).
- Output exactly one edited image. No text labels or watermarks on the image.
"""


def _parse_image_response(
    response: types.GenerateContentResponse,
    no_image_error: str,
) -> tuple[bytes, str, str]:
    cands = response.candidates
    if not cands:
        raise RuntimeError("No candidates in image model response")
    content = cands[0].content
    if not content or not content.parts:
        raise RuntimeError("Empty content from image model")

    notes_parts: list[str] = []
    image_out: bytes | None = None
    out_mime = "image/png"

    for part in content.parts:
        if part.text:
            notes_parts.append(part.text)
        if part.inline_data and part.inline_data.data:
            image_out = part.inline_data.data
            if part.inline_data.mime_type:
                out_mime = part.inline_data.mime_type

    if image_out is None:
        raise RuntimeError(no_image_error)

    return image_out, out_mime, "\n".join(notes_parts).strip()


def generate_character_image(
    *,
    prompt: str,
    extra_style: str | None = None,
) -> tuple[bytes, str, str]:
    """
    Text-to-image: returns (image_bytes, mime_type, model_text_if_any).
    """
    if not settings.gemini_api_key.strip():
        raise RuntimeError("GEMINI_API_KEY is not configured")

    user_prompt = (prompt or "").strip()
    if not user_prompt:
        raise ValueError("prompt is required")

    style = (extra_style or "").strip() or DEFAULT_STYLE
    full_text = f"{user_prompt}\n\n{style}"

    client = genai.Client(api_key=settings.gemini_api_key)
    parts: list[types.Part] = [types.Part.from_text(text=full_text)]

    response = client.models.generate_content(
        model=settings.gemini_image_model,
        contents=[types.Content(role="user", parts=parts)],
        config=types.GenerateContentConfig(
            response_modalities=[types.Modality.TEXT, types.Modality.IMAGE],
            temperature=0.85,
        ),
    )

    return _parse_image_response(
        response,
        "Model returned no image. Try a more specific prompt or check GEMINI_IMAGE_MODEL.",
    )


def edit_character_image(
    image_bytes: bytes,
    mime_type: str,
    instruction: str,
) -> tuple[bytes, str, str]:
    """
    Image-to-image edit via the same Gemini image model: returns (image_bytes, mime_type, notes).
    """
    if not settings.gemini_api_key.strip():
        raise RuntimeError("GEMINI_API_KEY is not configured")

    instr = (instruction or "").strip()
    if not instr:
        raise ValueError("instruction is required")

    full_text = (
        f"Edit the attached character image.\n\n"
        f"Instruction:\n{instr}\n\n"
        f"{EDIT_INSTRUCTION_STYLE}"
    )

    client = genai.Client(api_key=settings.gemini_api_key)
    parts: list[types.Part] = [
        types.Part.from_bytes(data=image_bytes, mime_type=mime_type or "image/png"),
        types.Part.from_text(text=full_text),
    ]

    response = client.models.generate_content(
        model=settings.gemini_image_model,
        contents=[types.Content(role="user", parts=parts)],
        config=types.GenerateContentConfig(
            response_modalities=[types.Modality.TEXT, types.Modality.IMAGE],
            temperature=0.45,
        ),
    )

    return _parse_image_response(
        response,
        "Model returned no edited image. Try a simpler instruction or check GEMINI_IMAGE_MODEL.",
    )
