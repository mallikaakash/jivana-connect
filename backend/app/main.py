"""Jivana Connect API. Run: uv run uvicorn app.main:app --reload --port 8000"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .clinic_auth import authorize_clinic_request, clinic_auth_required
from .config import Settings
from .errors import ApiError, install_error_handlers
from .routes import router
from .service import Service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("jivana")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    service = Service(settings)
    service.startup()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        mode = "live (Bolna)" if settings.live_voice else "simulated"
        log.info("Jivana Connect API ready — voice mode: %s, storage: %s", mode, service.store.mongo_status)
        if settings.live_voice and not settings.public_base_url:
            log.info("PUBLIC_BASE_URL not set — webhook may not reach localhost; polling Bolna executions as fallback")
        service.start_clinic_scheduler()
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

    def _cors_headers_for_request(request: Request, settings: Settings) -> dict[str, str]:
        origin = request.headers.get("origin")
        if origin and origin in settings.cors_origins:
            return {"Access-Control-Allow-Origin": origin, "Vary": "Origin"}
        return {}

    @app.middleware("http")
    async def clinic_auth_gate(request: Request, call_next):
        s: Settings = request.app.state.settings
        path = request.url.path
        if request.method == "OPTIONS":
            return await call_next(request)
        if not clinic_auth_required(s):
            return await call_next(request)
        if path in ("/api/health", "/docs", "/openapi.json", "/redoc") or path.startswith("/api/webhooks/"):
            return await call_next(request)
        if path == "/api/meta":
            return await call_next(request)
        if path == "/api/clinic/cron/daily-confirmation-batch":
            return await call_next(request)
        try:
            authorize_clinic_request(request, s)
        except ApiError as exc:
            return JSONResponse(
                status_code=exc.status,
                content={"detail": {"code": exc.code, "message": exc.message, "retry_allowed": exc.retry_allowed}},
                headers=_cors_headers_for_request(request, s),
            )
        return await call_next(request)

    app.include_router(router)
    return app


app = create_app()
