from fastapi import APIRouter, HTTPException

from app.config import settings
from app.services.live_ephemeral import create_live_ephemeral_token

router = APIRouter(prefix="/api/live", tags=["live"])


@router.get("/status")
def live_status() -> dict[str, str | bool]:
    """Whether Live ephemeral tokens can be issued (API key present on server)."""
    configured = bool(settings.gemini_api_key.strip())
    return {
        "status": "ready" if configured else "unconfigured",
        "ephemeralTokensAvailable": configured,
    }


@router.post("/ephemeral-token")
def issue_ephemeral_token() -> dict[str, str]:
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
    return {
        "accessToken": access_token,
        "liveModel": settings.gemini_live_model,
    }
