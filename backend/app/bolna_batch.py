"""Bolna batch calling API (POST /batches with CSV, then schedule)."""

from __future__ import annotations

import csv
import io
import logging
from datetime import timedelta
from typing import Any

import httpx

from .bolna import BolnaError
from .config import Settings
from . import timeutil

log = logging.getLogger("jivana.bolna_batch")


def _bolna_schedule_timestamp(scheduled_at: str) -> str:
    """Bolna requires ISO with numeric offset (+05:30), at least ~2 minutes in the future."""
    dt = timeutil.parse(scheduled_at) or timeutil.now()
    floor = timeutil.now() + timedelta(minutes=3)
    if dt < floor:
        dt = floor
    return timeutil.iso(dt)


class BolnaBatchClient:
    def __init__(self, settings: Settings):
        self.settings = settings

    def _auth_headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.settings.bolna_api_key}"}

    def _base(self) -> str:
        return self.settings.bolna_base_url.rstrip("/")

    def _recipients_to_csv(self, recipients: list[dict[str, str]]) -> bytes:
        if not recipients:
            raise BolnaError("Batch has no recipients.")
        extra_keys: set[str] = set()
        for row in recipients:
            extra_keys.update(k for k in row if k != "contact_number")
        fieldnames = ["contact_number", *sorted(extra_keys)]
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in recipients:
            writer.writerow({k: (row.get(k) or "") for k in fieldnames})
        return buf.getvalue().encode("utf-8")

    async def _request_json(
        self, method: str, path: str, *, json_body: dict | None = None
    ) -> dict:
        if not self.settings.bolna_api_key:
            raise BolnaError("Bolna API key is not configured.")
        url = f"{self._base()}{path}"
        headers = {**self._auth_headers(), "Content-Type": "application/json"}
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                res = await client.request(method, url, json=json_body, headers=headers)
        except httpx.HTTPError as exc:
            raise BolnaError(f"Could not reach Bolna ({type(exc).__name__}).") from exc
        return self._parse_response(method, path, res)

    async def _request_multipart(
        self, method: str, path: str, *, data: dict[str, str], files: dict[str, tuple]
    ) -> dict:
        if not self.settings.bolna_api_key:
            raise BolnaError("Bolna API key is not configured.")
        url = f"{self._base()}{path}"
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                res = await client.request(
                    method, url, data=data, files=files, headers=self._auth_headers()
                )
        except httpx.HTTPError as exc:
            raise BolnaError(f"Could not reach Bolna ({type(exc).__name__}).") from exc
        return self._parse_response(method, path, res)

    def _parse_response(self, method: str, path: str, res: httpx.Response) -> dict:
        if res.status_code >= 400:
            detail = ""
            try:
                data = res.json()
                detail = str(data.get("message") or data.get("detail") or data.get("error") or "")[:200]
            except ValueError:
                pass
            log.warning("Bolna %s %s returned HTTP %s", method, path, res.status_code)
            raise BolnaError(
                f"Bolna rejected the batch request (HTTP {res.status_code}){': ' + detail if detail else ''}."
            )
        try:
            data = res.json()
        except ValueError as exc:
            raise BolnaError("Bolna returned an unreadable batch response.") from exc
        return data if isinstance(data, dict) else {"data": data}

    async def create_batch(
        self,
        recipients: list[dict[str, str]],
        *,
        webhook_url: str | None = None,
    ) -> dict[str, Any]:
        if not self.settings.bolna_agent_id:
            raise BolnaError("Bolna agent id is not configured.")
        csv_bytes = self._recipients_to_csv(recipients)
        form: dict[str, str] = {"agent_id": self.settings.bolna_agent_id}
        if self.settings.bolna_from_number:
            form["from_phone_numbers"] = self.settings.bolna_from_number
        if webhook_url:
            form["webhook_url"] = webhook_url
        files = {"file": ("recipients.csv", csv_bytes, "text/csv")}
        data = await self._request_multipart("POST", "/batches", data=form, files=files)
        batch_id = data.get("batch_id") or data.get("id")
        if not batch_id:
            raise BolnaError("Bolna did not return a batch id.")
        return {"batch_id": str(batch_id), "raw": data}

    async def schedule_batch(self, batch_id: str, scheduled_at: str) -> dict[str, Any]:
        when = _bolna_schedule_timestamp(scheduled_at)
        return await self._request_multipart(
            "POST",
            f"/batches/{batch_id}/schedule",
            data={"scheduled_at": when, "bypass_call_guardrails": "true"},
            files={},
        )

    async def stop_batch(self, batch_id: str) -> dict[str, Any]:
        return await self._request_multipart("POST", f"/batches/{batch_id}/stop", data={}, files={})

    async def get_batch(self, batch_id: str) -> dict[str, Any]:
        if not self.settings.bolna_api_key:
            raise BolnaError("Bolna API key is not configured.")
        url = f"{self._base()}/batches/{batch_id}"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.get(url, headers=self._auth_headers())
        except httpx.HTTPError as exc:
            raise BolnaError(f"Could not reach Bolna ({type(exc).__name__}).") from exc
        return self._parse_response("GET", f"/batches/{batch_id}", res)

    async def list_batch_executions(self, batch_id: str, page: int = 1, page_size: int = 50) -> dict[str, Any]:
        path = f"/batches/{batch_id}/executions?page_number={page}&page_size={page_size}"
        if not self.settings.bolna_api_key:
            raise BolnaError("Bolna API key is not configured.")
        url = f"{self._base()}{path}"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.get(url, headers=self._auth_headers())
        except httpx.HTTPError as exc:
            raise BolnaError(f"Could not reach Bolna ({type(exc).__name__}).") from exc
        data = self._parse_response("GET", path, res)
        if isinstance(data, list):
            return {"items": data}
        return data
