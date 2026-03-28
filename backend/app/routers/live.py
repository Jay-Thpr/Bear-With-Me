from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session

from app.config import settings
from app.database import get_session
from app.routers.skills import _get_skill
from app.services.live_context import (
    LIVE_CONTEXT_VERSION,
    build_generic_system_instruction,
    build_live_system_instruction_response,
)
from app.services.live_ephemeral import create_live_ephemeral_token

router = APIRouter(prefix="/api/live", tags=["live"])


class LiveEphemeralRequest(BaseModel):
    skill_id: str | None = None


@router.get("/status")
def live_status() -> dict[str, str | bool]:
    """Whether Live ephemeral tokens can be issued (API key present on server)."""
    configured = bool(settings.gemini_api_key.strip())
    return {
        "status": "ready" if configured else "unconfigured",
        "ephemeralTokensAvailable": configured,
    }


@router.post("/ephemeral-token")
def issue_ephemeral_token(
    body: LiveEphemeralRequest | None = None,
    session: Session = Depends(get_session),
) -> dict[str, str | bool | list[str] | None]:
    """
    Return a short-lived access token for the browser to open a Gemini Live
    WebSocket. The long-lived API key stays on the server.
    """
    if not settings.gemini_api_key.strip():
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not set on the server (backend/.env).",
        )
    try:
        access_token = create_live_ephemeral_token()
    except Exception as exc:  # noqa: BLE001 — surface a safe message to the client
        raise HTTPException(
            status_code=502,
            detail=f"Failed to create ephemeral token: {exc}",
        ) from exc

    skill_id = body.skill_id if body else None
    if skill_id:
        skill = _get_skill(session, skill_id)
        live_ctx = build_live_system_instruction_response(session=session, skill=skill)
        system_instruction = live_ctx.system_instruction
        source_research_id = live_ctx.source_research_id
        source_progress_event_ids = live_ctx.source_progress_event_ids
        truncated = live_ctx.truncated
    else:
        system_instruction = build_generic_system_instruction()
        source_research_id = None
        source_progress_event_ids = []
        truncated = False

    return {
        "accessToken": access_token,
        "liveModel": settings.gemini_live_model,
        "systemInstruction": system_instruction,
        "liveContextVersion": LIVE_CONTEXT_VERSION,
        "sourceResearchId": source_research_id,
        "sourceProgressEventIds": source_progress_event_ids,
        "truncated": truncated,
    }
