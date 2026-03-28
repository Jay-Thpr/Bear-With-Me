import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

from app.config import settings
from app.deps import SESSION_COOKIE, get_optional_user
from app.security import create_session_token
from app.services.google_oauth import exchange_authorization_code, fetch_google_userinfo

router = APIRouter(prefix="/api/auth", tags=["auth"])

OAUTH_STATE_COOKIE = "oauth_state"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
SCOPES = "openid email profile"


class CodeExchangeBody(BaseModel):
    code: str = Field(min_length=1)
    state: str = Field(min_length=1)


def _google_not_configured() -> bool:
    return not (
        settings.google_client_id.strip()
        and settings.google_client_secret.strip()
        and settings.google_oauth_redirect_uri.strip()
    )


@router.get("/status")
def auth_status() -> dict[str, str | bool]:
    return {
        "status": "ready" if not _google_not_configured() else "unconfigured",
        "googleOAuthConfigured": not _google_not_configured(),
    }


@router.get("/me")
def auth_me(user: dict | None = Depends(get_optional_user)) -> dict:
    if user is None:
        return {"authenticated": False}
    return {"authenticated": True, "user": user}


@router.get("/google")
def google_login() -> RedirectResponse:
    if _google_not_configured():
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured (set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and FRONTEND_ORIGIN or GOOGLE_REDIRECT_URI).",
        )
    state = secrets.token_urlsafe(32)
    redirect_uri = settings.google_oauth_redirect_uri
    params = {
        "client_id": settings.google_client_id.strip(),
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    response = RedirectResponse(url=url, status_code=302)
    response.set_cookie(
        key=OAUTH_STATE_COOKIE,
        value=state,
        max_age=600,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )
    return response


@router.post("/google/exchange")
async def google_exchange(
    body: CodeExchangeBody,
    oauth_state: str | None = Cookie(default=None, alias=OAUTH_STATE_COOKIE),
) -> JSONResponse:
    """Exchange the authorization code for a session cookie (call from /auth/callback)."""
    if _google_not_configured():
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured.",
        )
    if not oauth_state or oauth_state != body.state:
        raise HTTPException(status_code=400, detail="Invalid or missing OAuth state.")

    redirect_uri = settings.google_oauth_redirect_uri
    try:
        token_payload = await exchange_authorization_code(
            code=body.code,
            client_id=settings.google_client_id.strip(),
            client_secret=settings.google_client_secret.strip(),
            redirect_uri=redirect_uri,
        )
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text
        raise HTTPException(
            status_code=400,
            detail=f"Google token exchange failed: {detail}",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Google token exchange failed: {exc}",
        ) from exc

    access_token = token_payload.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise HTTPException(
            status_code=502,
            detail="Google did not return an access token.",
        )

    try:
        profile = await fetch_google_userinfo(access_token)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to load Google profile: {exc}",
        ) from exc

    google_id = profile.get("id")
    if not isinstance(google_id, str) or not google_id:
        raise HTTPException(status_code=502, detail="Google profile missing id.")

    email = profile.get("email") if isinstance(profile.get("email"), str) else None
    name = profile.get("name") if isinstance(profile.get("name"), str) else None
    picture = profile.get("picture") if isinstance(profile.get("picture"), str) else None

    jwt_token = create_session_token(
        subject=google_id,
        email=email,
        name=name,
        picture=picture,
        secret=settings.jwt_signing_secret,
    )

    out = JSONResponse({"ok": True})
    out.set_cookie(
        key=SESSION_COOKIE,
        value=jwt_token,
        max_age=7 * 24 * 60 * 60,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )
    out.delete_cookie(OAUTH_STATE_COOKIE, path="/")
    return out


@router.post("/logout")
def logout() -> JSONResponse:
    out = JSONResponse({"ok": True})
    out.delete_cookie(SESSION_COOKIE, path="/")
    return out
