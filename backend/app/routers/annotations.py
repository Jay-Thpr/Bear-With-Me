import base64
import math

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from app.form_correction_rate_limit import (
    FORM_CORRECTION_MIN_INTERVAL_SEC,
    form_correction_record_success,
    form_correction_release_in_flight,
    form_correction_try_acquire,
)
from app.services.form_annotation import annotate_form_photo, decode_base64_image

router = APIRouter(prefix="/api/annotations", tags=["annotations"])


class FormCorrectionBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    image_base64: str = Field(alias="imageBase64")
    mime_type: str = Field(default="image/jpeg", alias="mimeType")
    coaching_hint: str | None = Field(default=None, alias="coachingHint")
    focus: str | None = None


def _acquire_rate_limit_or_raise(rate_key: str) -> None:
    ok, wait, reason = form_correction_try_acquire(rate_key)
    if ok:
        return
    if reason == "in_flight":
        raise HTTPException(
            status_code=409,
            detail="Another annotation request is already in progress.",
        )
    retry_after = max(1, int(math.ceil(wait)))
    raise HTTPException(
        status_code=429,
        detail=(
            f"Annotated form is limited to once every "
            f"{int(FORM_CORRECTION_MIN_INTERVAL_SEC)} seconds. "
            f"Retry in {retry_after}s."
        ),
        headers={"Retry-After": str(retry_after)},
    )


def _decode_and_validate_image(raw: str, rate_key: str) -> bytes:
    if len(raw) > 14_000_000:
        form_correction_release_in_flight(rate_key)
        raise HTTPException(status_code=413, detail="Image payload too large")
    try:
        image_bytes = decode_base64_image(raw)
    except ValueError as exc:
        form_correction_release_in_flight(rate_key)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if len(image_bytes) > 10_000_000:
        form_correction_release_in_flight(rate_key)
        raise HTTPException(status_code=413, detail="Decoded image too large")
    return image_bytes


@router.post("/form-correction")
def form_correction(request: Request, body: FormCorrectionBody) -> dict[str, str]:
    """
    Send a camera still (JPEG base64); returns an annotated image from the image model
    (Nano Banana 2) with arrows/labels. Used by the UI and optionally after Live tool calls.
    """
    client = request.client
    rate_key = f"ip:{client.host}" if client else "ip:unknown"
    _acquire_rate_limit_or_raise(rate_key)

    image_bytes = _decode_and_validate_image(body.image_base64.strip(), rate_key)

    try:
        out_bytes, out_mime, notes = annotate_form_photo(
            image_bytes,
            body.mime_type,
            focus=body.focus,
            coaching_hint=body.coaching_hint,
        )
    except RuntimeError as exc:
        form_correction_release_in_flight(rate_key)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        form_correction_release_in_flight(rate_key)
        raise HTTPException(
            status_code=502,
            detail=f"Image model error: {exc}",
        ) from exc

    b64 = base64.b64encode(out_bytes).decode("ascii")
    form_correction_record_success(rate_key)
    return {
        "imageBase64": b64,
        "mimeType": out_mime or "image/png",
        "notes": notes,
    }
