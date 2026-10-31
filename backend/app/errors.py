"""Error envelope: every 4xx/5xx is {"detail": {"code", "message", "retry_allowed"}}."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("jivana")


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, retry_allowed: bool = False):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.retry_allowed = retry_allowed


def envelope(code: str, message: str, retry_allowed: bool) -> dict:
    return {"detail": {"code": code, "message": message, "retry_allowed": retry_allowed}}


def not_found(kind: str, ident: str) -> ApiError:
    return ApiError(404, "not_found", f"{kind} '{ident}' was not found.", False)


_STATUS_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError):
        return JSONResponse(status_code=exc.status, content=envelope(exc.code, exc.message, exc.retry_allowed))

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException):
        detail = exc.detail
        if isinstance(detail, dict) and "code" in detail:
            content = {"detail": {"code": detail["code"], "message": detail.get("message", ""),
                                  "retry_allowed": bool(detail.get("retry_allowed", False))}}
        else:
            code = _STATUS_CODES.get(exc.status_code, "server_error" if exc.status_code >= 500 else "http_error")
            message = detail if isinstance(detail, str) and detail else "Request failed."
            if exc.status_code == 404 and message == "Not Found":
                message = "The requested resource was not found."
            content = envelope(code, message, exc.status_code >= 500)
        return JSONResponse(status_code=exc.status_code, content=content, headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError):
        errors = exc.errors()
        if errors:
            first = errors[0]
            loc = ".".join(str(p) for p in first.get("loc", []) if p not in ("body", "query", "path"))
            message = f"{loc}: {first.get('msg')}" if loc else str(first.get("msg"))
        else:
            message = "Invalid request."
        return JSONResponse(status_code=422, content=envelope("validation_error", message, False))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        log.exception("Unhandled error: %s", type(exc).__name__)
        return JSONResponse(status_code=500, content=envelope("internal_error", "Something went wrong on the server.", True))
