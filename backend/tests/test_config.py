from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routes.config import _truthy

client = TestClient(app)


@pytest.mark.parametrize("value", ["1", "true", "TRUE", "Yes", "on", "  on  "])
def test_truthy_accepts(value):
    assert _truthy(value) is True


@pytest.mark.parametrize("value", ["0", "false", "no", "off", "", "  ", None])
def test_truthy_rejects(value):
    assert _truthy(value) is False


def test_config_disabled_by_default(monkeypatch):
    monkeypatch.delenv("PREVIEW_BANNER", raising=False)
    monkeypatch.delenv("SERVICE_WORKER", raising=False)
    monkeypatch.delenv("PREVIEW_PR", raising=False)
    body = client.get("/api/config").json()
    assert body == {"preview": {"enabled": False, "pr": None, "commit": None}, "service_worker": False}


def test_config_enabled_surfaces_pr_and_commit(monkeypatch):
    monkeypatch.delenv("SERVICE_WORKER", raising=False)
    monkeypatch.setenv("PREVIEW_BANNER", "1")
    monkeypatch.setenv("PREVIEW_PR", "42")
    monkeypatch.setenv("PREVIEW_COMMIT", "abc123")
    body = client.get("/api/config").json()
    assert body == {"preview": {"enabled": True, "pr": "42", "commit": "abc123"}, "service_worker": False}


def test_config_disabled_hides_pr_even_if_set(monkeypatch):
    # PR/commit only leak through when the banner is explicitly enabled.
    monkeypatch.delenv("PREVIEW_BANNER", raising=False)
    monkeypatch.setenv("PREVIEW_PR", "42")
    body = client.get("/api/config").json()
    assert body["preview"]["pr"] is None


@pytest.mark.parametrize(("value", "on"), [(None, False), ("0", False), ("1", True), ("on", True)])
def test_the_service_worker_is_off_unless_the_deployment_turns_it_on(monkeypatch, value, on):
    # Record 0349: the worker keeps the page in the browser, so it waits on the
    # privacy page saying so, and the switch is how it is turned off again.
    if value is None:
        monkeypatch.delenv("SERVICE_WORKER", raising=False)
    else:
        monkeypatch.setenv("SERVICE_WORKER", value)
    assert client.get("/api/config").json()["service_worker"] is on
