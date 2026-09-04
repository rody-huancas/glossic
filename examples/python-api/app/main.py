from fastapi import FastAPI

from app.api.routes import health, users
from app.core.config import get_settings
from app.middleware.request_id import RequestIdMiddleware


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(title=settings.app_name, debug=settings.debug)
    app.add_middleware(RequestIdMiddleware)
    app.include_router(health.router)
    app.include_router(users.router, prefix="/api")

    return app


app = create_app()
