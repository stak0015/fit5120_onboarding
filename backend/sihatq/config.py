from dataclasses import dataclass
from functools import lru_cache
import os
from pathlib import Path

from dotenv import load_dotenv


# Local development settings live beside pyproject.toml. Environment variables
# supplied by Vercel, Docker, or the shell keep priority.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _normalise_database_url(value: str) -> str:
    if value.startswith("postgres://"):
        return value.replace("postgres://", "postgresql+psycopg://", 1)
    if value.startswith("postgresql://"):
        return value.replace("postgresql://", "postgresql+psycopg://", 1)
    return value


@dataclass(frozen=True)
class Settings:
    database_url: str
    cors_origins: tuple[str, ...]
    cors_origin_regex: str | None
    environment: str
    groq_api_key: str | None
    groq_model: str
    groq_safety_model: str
    action_suggestions_enabled: bool
    groq_timeout_seconds: float


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@lru_cache
def get_settings() -> Settings:
    origins = tuple(
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173",
        ).split(",")
        if origin.strip()
    )
    return Settings(
        database_url=_normalise_database_url(
            os.getenv(
                "DATABASE_URL",
                "postgresql+psycopg://wiseage:wiseage@localhost:5432/wiseage",
            )
        ),
        cors_origins=origins,
        cors_origin_regex=os.getenv("CORS_ORIGIN_REGEX") or None,
        environment=os.getenv("APP_ENV", "development"),
        groq_api_key=os.getenv("GROQ_API_KEY") or None,
        groq_model=os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
        groq_safety_model=os.getenv(
            "GROQ_SAFETY_MODEL", "openai/gpt-oss-safeguard-20b"
        ),
        action_suggestions_enabled=_env_bool("ACTION_SUGGESTIONS_ENABLED", True),
        groq_timeout_seconds=float(os.getenv("GROQ_TIMEOUT_SECONDS", "15")),
    )
