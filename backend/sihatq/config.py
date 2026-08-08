from dataclasses import dataclass
from functools import lru_cache
import os


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
    )

