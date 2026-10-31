"""Environment-driven configuration. Loaded from backend/.env (python-dotenv) plus the process env."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
DEFAULT_SEED_PATH = REPO_DIR / "shared" / "seed.json"


def _env(name: str) -> str | None:
    value = os.environ.get(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


@dataclass
class Settings:
    jivana_mode: str = "demo"  # demo | clinic
    clinic_name: str = "Clinic"
    clinic_lead_name: str | None = None
    clinic_api_key: str | None = None
    clinic_publish_reviewer_key: bool = False
    clinic_demo_seed_enabled: bool = False
    clinic_allow_workspace_reset: bool = False
    clinic_daily_confirmation_batch_enabled: bool = False
    clinic_confirmation_batch_time: str = "10:00"
    clinic_cron_secret: str | None = None
    bolna_api_key: str | None = None
    bolna_agent_id: str | None = None
    bolna_from_number: str | None = None
    bolna_base_url: str = "https://api.bolna.ai"
    demo_call_recipient: str | None = None
    public_base_url: str | None = None
    bolna_webhook_secret: str | None = None
    mongo_url: str | None = None
    mongo_db: str = "jivana"
    cors_origins: list[str] = field(default_factory=lambda: ["http://localhost:5173"])
    simulated_call_seconds: float = 8.0
    poll_interval_seconds: float = 5.0
    poll_max_seconds: float = 600.0
    stuck_call_minutes: float = 25.0
    auto_dial_enabled: bool = False
    auto_dial_interval_seconds: float = 120.0
    clinic_dial_override_e164: str | None = None
    firebase_project_id: str | None = None
    bolna_call_retry_enabled: bool = False
    seed_path: Path = DEFAULT_SEED_PATH

    @property
    def clinic_mode(self) -> bool:
        return self.jivana_mode.strip().lower() == "clinic"

    @property
    def live_voice(self) -> bool:
        if self.clinic_mode:
            return bool(self.bolna_api_key and self.bolna_agent_id)
        return bool(self.bolna_api_key and self.bolna_agent_id and self.demo_call_recipient)

    @property
    def allow_simulated_voice(self) -> bool:
        return not self.clinic_mode

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv(BACKEND_DIR / ".env", override=False)
        cors = _env("CORS_ORIGINS") or "http://localhost:5173"
        sim = _env("SIMULATED_CALL_SECONDS")
        mode = (_env("JIVANA_MODE") or "demo").strip().lower()
        if mode not in ("demo", "clinic"):
            mode = "demo"
        return cls(
            jivana_mode=mode,
            clinic_name=_env("CLINIC_NAME") or "Clinic",
            clinic_lead_name=_env("CLINIC_LEAD_NAME"),
            clinic_api_key=_env("CLINIC_API_KEY"),
            clinic_publish_reviewer_key=(_env("CLINIC_PUBLISH_REVIEWER_KEY") or "").lower()
            in ("1", "true", "yes"),
            clinic_demo_seed_enabled=(_env("CLINIC_DEMO_SEED_ENABLED") or "").lower() in ("1", "true", "yes"),
            clinic_allow_workspace_reset=(_env("CLINIC_ALLOW_WORKSPACE_RESET") or "").lower() in ("1", "true", "yes"),
            bolna_api_key=_env("BOLNA_API_KEY"),
            bolna_agent_id=_env("BOLNA_AGENT_ID"),
            bolna_from_number=_env("BOLNA_FROM_NUMBER"),
            bolna_base_url=(_env("BOLNA_BASE_URL") or "https://api.bolna.ai").rstrip("/"),
            demo_call_recipient=_env("DEMO_CALL_RECIPIENT"),
            public_base_url=(_env("PUBLIC_BASE_URL") or "").rstrip("/") or None,
            bolna_webhook_secret=_env("BOLNA_WEBHOOK_SECRET"),
            mongo_url=_env("MONGO_URL"),
            mongo_db=_env("MONGO_DB") or "jivana",
            cors_origins=[o.strip() for o in cors.split(",") if o.strip()],
            simulated_call_seconds=float(sim) if sim is not None else 8.0,
            stuck_call_minutes=float(_env("STUCK_CALL_MINUTES") or 25),
            auto_dial_enabled=(
                False
                if mode == "clinic" and (_env("AUTO_DIAL_ENABLED") is None)
                and (_env("CLINIC_DAILY_CONFIRMATION_BATCH") or "true").strip().lower() in ("1", "true", "yes")
                else (
                    mode == "clinic"
                    if _env("AUTO_DIAL_ENABLED") is None
                    else _env("AUTO_DIAL_ENABLED").strip().lower() in ("1", "true", "yes")
                )
            ),
            clinic_daily_confirmation_batch_enabled=(_env("CLINIC_DAILY_CONFIRMATION_BATCH") or "true").strip().lower()
            in ("1", "true", "yes")
            if mode == "clinic"
            else False,
            clinic_confirmation_batch_time=_env("CLINIC_CONFIRMATION_BATCH_TIME") or "10:00",
            clinic_cron_secret=_env("CLINIC_CRON_SECRET"),
            auto_dial_interval_seconds=float(_env("AUTO_DIAL_INTERVAL_SECONDS") or 120),
            clinic_dial_override_e164=_env("CLINIC_DIAL_OVERRIDE_E164"),
            firebase_project_id=_env("FIREBASE_PROJECT_ID"),
            bolna_call_retry_enabled=(_env("BOLNA_CALL_RETRY_ENABLED") or "").lower() in ("1", "true", "yes"),
            seed_path=Path(_env("SEED_PATH") or DEFAULT_SEED_PATH),
        )

    def webhook_url(self) -> str | None:
        if not self.public_base_url:
            return None
        url = f"{self.public_base_url}/api/webhooks/bolna"
        if self.bolna_webhook_secret:
            url += "?token=<BOLNA_WEBHOOK_SECRET>"
        return url
