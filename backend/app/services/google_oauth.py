from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
from sqlmodel import Session

from app.config import settings
from app.db_models import GoogleOAuthCredential
from app.services.secret_crypto import decrypt_secret, encrypt_secret

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
PHOTOS_APPENDONLY_SCOPE = "https://www.googleapis.com/auth/photoslibrary.appendonly"
PHOTOS_READ_APP_SCOPE = "https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata"
DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file"
CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events"
DOCUMENTS_SCOPE = "https://www.googleapis.com/auth/documents"


async def exchange_authorization_code(
    *,
    code: str,
    client_id: str,
    client_secret: str,
    redirect_uri: str,
) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        res.raise_for_status()
        return res.json()


async def fetch_google_userinfo(access_token: str) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        res = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        res.raise_for_status()
        return res.json()


def token_expires_at(token_payload: dict) -> datetime | None:
    expires_in = token_payload.get("expires_in")
    if isinstance(expires_in, str):
        try:
            expires_in = int(expires_in)
        except ValueError:
            expires_in = None
    if not isinstance(expires_in, int) or expires_in <= 0:
        return None
    # Refresh slightly early to avoid racing expiry during uploads.
    return datetime.now(timezone.utc) + timedelta(seconds=max(0, expires_in - 60))


def access_token_is_stale(expires_at: datetime | None) -> bool:
    if expires_at is None:
        return False
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at <= datetime.now(timezone.utc)


def refresh_access_token(
    *,
    refresh_token: str,
    client_id: str,
    client_secret: str,
) -> dict:
    with httpx.Client(timeout=30.0) as client:
        res = client.post(
            GOOGLE_TOKEN_URL,
            data={
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "refresh_token",
            },
        )
        res.raise_for_status()
        return res.json()


def get_valid_access_token(session: Session, user_sub: str) -> str | None:
    credential = session.get(GoogleOAuthCredential, user_sub)
    if credential is None:
        return None
    access_token = decrypt_secret(credential.access_token) or ""
    if access_token and not access_token_is_stale(credential.expires_at):
        return access_token
    refresh_token = decrypt_secret(credential.refresh_token)
    if not refresh_token:
        return None

    refreshed = refresh_access_token(
        refresh_token=refresh_token,
        client_id=settings.google_client_id.strip(),
        client_secret=settings.google_client_secret.strip(),
    )
    access_token = refreshed.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        return None

    credential.access_token = encrypt_secret(access_token)
    if isinstance(refreshed.get("refresh_token"), str) and refreshed["refresh_token"]:
        credential.refresh_token = encrypt_secret(refreshed["refresh_token"])
    if isinstance(refreshed.get("scope"), str):
        credential.scope = refreshed["scope"]
    if isinstance(refreshed.get("token_type"), str):
        credential.token_type = refreshed["token_type"]
    credential.expires_at = token_expires_at(refreshed)
    credential.updated_at = datetime.now(timezone.utc)
    session.add(credential)
    session.commit()
    return access_token


def parse_scope_set(scope: str | None) -> set[str]:
    if not scope:
        return set()
    return {part.strip() for part in scope.split() if part.strip()}


def credential_capabilities(credential: GoogleOAuthCredential | None) -> dict[str, object]:
    scopes = parse_scope_set(credential.scope if credential else None)
    return {
        "connected": credential is not None,
        "provider": credential.provider if credential else "google",
        "hasRefreshToken": bool(credential and credential.refresh_token),
        "grantedScopes": sorted(scopes),
        "photosAppendOnlyGranted": PHOTOS_APPENDONLY_SCOPE in scopes,
        "photosAppReadGranted": PHOTOS_READ_APP_SCOPE in scopes,
        "driveFileGranted": DRIVE_FILE_SCOPE in scopes,
        "calendarEventsGranted": CALENDAR_EVENTS_SCOPE in scopes,
        "documentsGranted": DOCUMENTS_SCOPE in scopes,
    }
