from fastapi import Cookie, Depends, HTTPException

from app.config import settings
from app.security import decode_session_token

SESSION_COOKIE = "sk_session"


def user_from_payload(payload: dict) -> dict[str, str | None]:
    sub = str(payload.get("sub", ""))
    name = payload.get("name")
    email = payload.get("email")
    picture = payload.get("picture")
    display = (
        name
        if isinstance(name, str) and name.strip()
        else (email if isinstance(email, str) else None)
    )
    return {
        "id": sub,
        "email": email if isinstance(email, str) else None,
        "display_name": display or "Signed in",
        "picture": picture if isinstance(picture, str) else None,
    }


def get_optional_user(
    sk_session: str | None = Cookie(default=None, alias=SESSION_COOKIE),
) -> dict | None:
    if not sk_session:
        return None
    payload = decode_session_token(sk_session, settings.jwt_signing_secret)
    if payload is None:
        return None
    return user_from_payload(payload)


def require_user(
    user: dict | None = Depends(get_optional_user),
) -> dict:
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user
