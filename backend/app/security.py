from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

ALGORITHM = "HS256"
SESSION_DAYS = 7


def create_session_token(
    *,
    subject: str,
    email: str | None,
    name: str | None,
    picture: str | None,
    secret: str,
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=SESSION_DAYS)
    payload = {
        "sub": subject,
        "email": email,
        "name": name,
        "picture": picture,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def decode_session_token(token: str, secret: str) -> dict | None:
    try:
        return jwt.decode(token, secret, algorithms=[ALGORITHM])
    except JWTError:
        return None
