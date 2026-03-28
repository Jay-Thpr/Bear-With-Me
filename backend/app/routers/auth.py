"""Auth disabled for public hackathon demo (no Google OAuth or session cookies)."""

from fastapi import APIRouter

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me")
def auth_me() -> dict:
    return {"authenticated": False}


@router.get("/status")
def auth_status() -> dict[str, str | bool]:
    return {"status": "disabled", "googleOAuthConfigured": False}
