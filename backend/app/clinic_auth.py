"""Clinic API auth: shared access key and/or Firebase ID tokens."""

from __future__ import annotations

import logging

from fastapi import Request
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from .config import Settings
from .errors import ApiError

log = logging.getLogger("jivana.auth")


def _bearer_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization") or ""
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:].strip()
    return token or None


def verify_firebase_token(token: str, project_id: str) -> bool:
    try:
        id_token.verify_firebase_token(token, google_requests.Request(), audience=project_id)
        return True
    except ValueError as exc:
        log.debug("Firebase token rejected: %s", exc)
        return False


def clinic_auth_required(settings: Settings) -> bool:
    if not settings.clinic_mode:
        return False
    return bool(settings.clinic_api_key or settings.firebase_project_id)


def authorize_clinic_request(request: Request, settings: Settings) -> None:
    """Raise ApiError(401) when clinic auth is configured and credentials are missing/invalid."""
    if not clinic_auth_required(settings):
        return
    token = _bearer_token(request)
    if not token:
        raise ApiError(401, "unauthorized", "Clinic sign-in required.", False)
    if settings.clinic_api_key and token == settings.clinic_api_key:
        return
    if settings.firebase_project_id and token.count(".") == 2:
        if verify_firebase_token(token, settings.firebase_project_id):
            return
    raise ApiError(401, "unauthorized", "Invalid clinic credentials.", False)
