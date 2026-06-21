import base64

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.config import settings
from app.services.background_removal import remove_background_png
from app.services.character_generation import generate_character_image

router = APIRouter(prefix="/api/characters", tags=["characters"])


class CharacterGenerateBody(BaseModel):
    """Generate a character with Gemini image (Nano Banana), optionally strip background (rembg or remove.bg)."""

    model_config = ConfigDict(populate_by_name=True)

    prompt: str = Field(
        ...,
        min_length=4,
        max_length=4000,
        description="What the character should look like (species, outfit, pose, vibe).",
    )
    remove_background: bool = Field(
        default=True,
        alias="removeBackground",
        description="If true, strip background (rembg locally by default; or remove.bg if BACKGROUND_REMOVAL_PROVIDER=remove_bg).",
    )


def _strip_background(raw_bytes: bytes, mime: str) -> tuple[bytes, str]:
    prov = (settings.background_removal_provider or "rembg").strip().lower()
    if prov == "remove_bg" and not settings.remove_bg_api_key.strip():
        raise HTTPException(
            status_code=503,
            detail="BACKGROUND_REMOVAL_PROVIDER=remove_bg requires REMOVE_BG_API_KEY.",
        )
    try:
        out_bytes = remove_background_png(raw_bytes, mime_type=mime)
        return out_bytes, "image/png"
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502,
            detail=f"Background removal failed: {exc}",
        ) from exc


@router.post("/generate")
def generate_character(body: CharacterGenerateBody) -> dict:
    """
    1) Gemini `GEMINI_IMAGE_MODEL` — text-to-image character.
    2) Optional: background removal — `rembg` locally by default, or remove.bg if configured.
    """
    try:
        raw_bytes, mime, notes = generate_character_image(prompt=body.prompt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Image generation failed: {exc}") from exc

    background_removed = False
    out_bytes = raw_bytes
    out_mime = mime or "image/png"

    if body.remove_background:
        out_bytes, out_mime = _strip_background(out_bytes, out_mime)
        background_removed = True

    b64 = base64.b64encode(out_bytes).decode("ascii")
    return {
        "imageBase64": b64,
        "mimeType": out_mime,
        "notes": notes,
        "backgroundRemoved": background_removed,
    }
