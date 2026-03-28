"""Mint short-lived Gemini Live tokens (server-side API key only)."""

from __future__ import annotations

import warnings
from datetime import datetime, timedelta, timezone

from google import genai

from app.config import settings


def create_live_ephemeral_token() -> str:
    """Return token string suitable for the Live API `access_token` query param."""
    client = genai.Client(
        api_key=settings.gemini_api_key,
        http_options={"api_version": "v1alpha"},
    )
    now = datetime.now(tz=timezone.utc)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        token = client.auth_tokens.create(
            config={
                "uses": 1,
                "expire_time": now + timedelta(minutes=30),
                "new_session_expire_time": now + timedelta(minutes=3),
            },
        )
    if not token.name:
        raise RuntimeError("Gemini did not return an ephemeral token")
    return token.name
