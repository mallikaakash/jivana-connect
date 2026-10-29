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
    seed_path: Path = DEFAULT_SEED_PATH

    @property
    def live_voice(self) -> bool:
        return bool(self.bolna_api_key and self.bolna_agent_id and self.demo_call_recipient)

    @classmethod
    def from_env(cls) -> "Settings":
        load_dotenv(BACKEND_DIR / ".env", override=False)
        cors = _env("CORS_ORIGINS") or "http://localhost:5173"
        sim = _env("SIMULATED_CALL_SECONDS")
        return cls(
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
            seed_path=Path(_env("SEED_PATH") or DEFAULT_SEED_PATH),
        )

    def webhook_url(self) -> str | None:
        if not self.public_base_url:
            return None
        url = f"{self.public_base_url}/api/webhooks/bolna"
        if self.bolna_webhook_secret:
            url += "?token=<BOLNA_WEBHOOK_SECRET>"
        return url
