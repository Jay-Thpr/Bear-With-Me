from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Always load backend/.env next to this package, not only when the shell cwd is `backend/`.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    frontend_origin: str = "http://localhost:5173"
    cors_origins: str = "http://localhost:5173"

    # Google OAuth (https://console.cloud.google.com/apis/credentials)
    google_client_id: str = ""
    google_client_secret: str = ""
    # If empty, uses {FRONTEND_ORIGIN}/auth/callback (set FRONTEND_ORIGIN on deploy).
    # Override only if the callback URL cannot follow that pattern.
    google_redirect_uri: str = ""
    # Optional service-account JSON for best-effort Google Docs summary exports.
    google_docs_service_account_json: str = ""
    # Optional folder where exported summary docs should live.
    google_docs_export_folder_id: str = ""

    # HS256 signing for session cookies (set a long random string in production).
    jwt_secret: str = "dev-only-change-jwt-secret"
    cookie_secure: bool = False

    # Persistent storage (empty = SQLite file under backend/data/app.db)
    database_url: str = ""

    gemini_api_key: str = ""
    # Must support Live / BidiGenerateContent (see Gemini API “Live” / native audio models).
    gemini_live_model: str = "gemini-3.1-flash-live-preview"
    # Still-image form markup (Nano Banana 2); REST generateContent, not Live WebSocket.
    gemini_image_model: str = "gemini-3.1-flash-image-preview"
    # Deep skill research (REST generateContent; use a model your key supports — see scripts/check_gemini_key.py)
    gemini_research_model: str = "gemini-3-flash-preview"

    # Background removal after image gen: local rembg (default) or remove.bg API
    # rembg | remove_bg
    background_removal_provider: str = "rembg"

    # remove.bg — only when BACKGROUND_REMOVAL_PROVIDER=remove_bg
    # https://www.remove.bg/api
    remove_bg_api_key: str = ""

    # rembg quality (pixel art / sprites): crisper edges, less “washed out” halos
    rembg_post_process_mask: bool = True
    # 1–255: snap alpha to fully opaque/transparent; 0 = leave rembg’s soft alpha
    rembg_alpha_threshold: int = 200

    @property
    def google_oauth_redirect_uri(self) -> str:
        """Redirect URI sent to Google; prefers GOOGLE_REDIRECT_URI, else FRONTEND_ORIGIN + /auth/callback."""
        explicit = self.google_redirect_uri.strip()
        if explicit:
            return explicit
        base = self.frontend_origin.strip().rstrip("/")
        return f"{base}/auth/callback"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def jwt_signing_secret(self) -> str:
        s = self.jwt_secret.strip()
        return s if s else "dev-only-change-jwt-secret"

    @property
    def sqlite_path(self) -> Path:
        return _BACKEND_ROOT / "data" / "app.db"

    @property
    def database_url_resolved(self) -> str:
        u = self.database_url.strip()
        if u:
            return u
        return f"sqlite:///{self.sqlite_path}"


settings = Settings()
