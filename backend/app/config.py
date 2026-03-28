from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    frontend_origin: str = "http://localhost:5173"
    cors_origins: str = "http://localhost:5173"

    gemini_api_key: str = ""
    # Must support Live / BidiGenerateContent (see Gemini API “Live” / native audio models).
    gemini_live_model: str = "gemini-3.1-flash-live-preview"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
