from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "python-api"
    debug: bool = False
    database_url: str = "sqlite+aiosqlite:///./app.db"


@lru_cache
def get_settings() -> Settings:
    """Cached so every request reads the same environment snapshot."""
    return Settings()
