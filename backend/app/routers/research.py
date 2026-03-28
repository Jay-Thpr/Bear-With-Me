from fastapi import APIRouter

from app.config import settings

router = APIRouter(prefix="/api/research", tags=["research"])


@router.get("/status")
def research_status() -> dict[str, str]:
    """Persistence backend for skill research (see /api/skills/.../research)."""
    return {
        "status": "ready",
        "storage": "sqlite" if settings.database_url_resolved.startswith("sqlite") else "custom",
    }
