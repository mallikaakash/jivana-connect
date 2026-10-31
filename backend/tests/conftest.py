import time
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app import timeutil
from app.config import Settings
from app.main import create_app

FROZEN = datetime(2026, 10, 30, 11, 0, 0, tzinfo=timeutil.IST)


def wait_for(predicate, timeout=5.0, interval=0.02):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(interval)
    raise AssertionError("condition not met in time")


@pytest.fixture(autouse=True)
def frozen_now():
    timeutil.set_now_override(FROZEN)
    yield FROZEN
    timeutil.set_now_override(None)


def _client(settings: Settings):
    app = create_app(settings)
    return TestClient(app)


@pytest.fixture
def client():
    with _client(Settings(simulated_call_seconds=0)) as c:
        yield c


@pytest.fixture
def slow_client():
    with _client(Settings(simulated_call_seconds=30)) as c:
        yield c


class FakeBolna:
    def __init__(self):
        self.started = []
        self.fail_with = None
        self.counter = 0

    async def start_call(self, user_data, *, recipient_phone_number=None):
        if self.fail_with:
            raise self.fail_with
        self.counter += 1
        self.started.append({"user_data": user_data, "phone": recipient_phone_number})
        return f"exec-{self.counter}"

    async def get_execution(self, execution_id):
        return None


@pytest.fixture
def live_client():
    settings = Settings(
        bolna_api_key="test-key",
        bolna_agent_id="agent-test",
        demo_call_recipient="+910000000000",
        simulated_call_seconds=0,
        poll_interval_seconds=60,
    )
    with _client(settings) as c:
        fake = FakeBolna()
        svc = c.app.state.service
        svc.bolna.start_call = fake.start_call
        svc.bolna.get_execution = fake.get_execution
        c.fake_bolna = fake
        yield c
