"""Jivana Connect API. Run: uv run uvicorn app.main:app --reload --port 8000"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings
from .errors import install_error_handlers
from .routes import router
from .service import Service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("jivana")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    service = Service(settings)
    service.startup()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        mode = "live (Bolna)" if settings.live_voice else "simulated"
        log.info("Jivana Connect API ready — voice mode: %s, storage: %s", mode, service.store.mongo_status)
        if settings.live_voice and not settings.public_base_url:
            log.info("PUBLIC_BASE_URL not set — webhook may not reach localhost; polling Bolna executions as fallback")
        yield
        service.cancel_background()

    app = FastAPI(title="Jivana Connect API", version="0.1.0", lifespan=lifespan)
    app.state.service = service
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)
    app.include_router(router)
    return app


app = create_app()
