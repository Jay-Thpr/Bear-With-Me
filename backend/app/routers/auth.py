import secrets
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.config import settings
from app.database import get_session
from app.db_models import GoogleOAuthCredential
from app.deps import SESSION_COOKIE, get_optional_user
from app.security import create_session_token
from app.services.google_oauth import (
    credential_capabilities,
    exchange_authorization_code,
    fetch_google_userinfo,
    token_expires_at,
)
from app.services.secret_crypto import encrypt_secret

router = APIRouter(prefix="/api/auth", tags=["auth"])

OAUTH_STATE_COOKIE = "oauth_state"
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
SCOPES = " ".join(
    [
        "openid",
        "email",
        "profile",
        # Photos — annotation stills upload
        "https://www.googleapis.com/auth/photoslibrary.appendonly",
        "https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata",
        # Drive (app-scoped) — session summary exports, resource attachments
        "https://www.googleapis.com/auth/drive.file",
        # Calendar — session reminders and scheduled practice slots
        "https://www.googleapis.com/auth/calendar.events",
        # Docs — user-owned summary documents (replaces service account export)
        "https://www.googleapis.com/auth/documents",
    ],
)


class CodeExchangeBody(BaseModel):
    code: str = Field(min_length=1)
    state: str = Field(min_length=1)


def _google_not_configured() -> bool:
    return not (
        settings.google_client_id.strip()
        and settings.google_client_secret.strip()
        and settings.google_redirect_uri.strip()
    )


@router.get("/status")
def auth_status(
    user: dict | None = Depends(get_optional_user),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    google_credential = None
    if user is not None:
        google_credential = session.get(GoogleOAuthCredential, str(user["id"]))
    return {
        "status": "ready" if not _google_not_configured() else "unconfigured",
        "googleOAuthConfigured": not _google_not_configured(),
        "googleIntegration": credential_capabilities(google_credential),
    }


@router.get("/me")
def auth_me(
    user: dict | None = Depends(get_optional_user),
    session: Session = Depends(get_session),
) -> dict[str, object]:
    if user is None:
        return {"authenticated": False}
    google_credential = session.get(GoogleOAuthCredential, str(user["id"]))
    return {
        "authenticated": True,
        "user": user,
        "googleIntegration": credential_capabilities(google_credential),
    }


@router.get("/google")
def google_login() -> RedirectResponse:
    if _google_not_configured():
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured (set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI).",
        )
    state = secrets.token_urlsafe(32)
    redirect_uri = settings.google_redirect_uri.strip()
    params = {
        "client_id": settings.google_client_id.strip(),
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
        "access_type": "offline",
        "prompt": "consent select_account",
        "include_granted_scopes": "true",
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
    session: Session = Depends(get_session),
) -> JSONResponse:
    """Exchange the authorization code for a session cookie (call from /auth/callback)."""
    if _google_not_configured():
        raise HTTPException(
            status_code=503,
            detail="Google OAuth is not configured.",
        )
    if not oauth_state or oauth_state != body.state:
        raise HTTPException(status_code=400, detail="Invalid or missing OAuth state.")

    redirect_uri = settings.google_redirect_uri.strip()
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

    refresh_token = (
        token_payload.get("refresh_token")
        if isinstance(token_payload.get("refresh_token"), str)
        else None
    )
    existing_cred = session.get(GoogleOAuthCredential, google_id)
    credential = existing_cred or GoogleOAuthCredential(
        user_sub=google_id,
        created_at=datetime.now(timezone.utc),
    )
    credential.provider = "google"
    credential.access_token = encrypt_secret(access_token)
    if refresh_token:
        credential.refresh_token = encrypt_secret(refresh_token)
    credential.token_type = (
        token_payload.get("token_type")
        if isinstance(token_payload.get("token_type"), str)
        else credential.token_type
    )
    credential.scope = (
        token_payload.get("scope")
        if isinstance(token_payload.get("scope"), str)
        else credential.scope
    )
    credential.expires_at = token_expires_at(token_payload)
    credential.updated_at = datetime.now(timezone.utc)
    session.add(credential)
    session.commit()

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
    out.delete_cookie(OAUTH_STATE_COOKIE, path="/")
    return out


@router.post("/google/disconnect")
def disconnect_google_integration(
    user: dict = Depends(get_optional_user),
    session: Session = Depends(get_session),
) -> JSONResponse:
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    credential = session.get(GoogleOAuthCredential, str(user["id"]))
    if credential is not None:
        session.delete(credential)
        session.commit()
    out = JSONResponse({"ok": True})
    return out
