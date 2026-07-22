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
    monkeypatch.delenv("PREVIEW_PR", raising=False)
    body = client.get("/api/config").json()
    assert body == {"preview": {"enabled": False, "pr": None, "commit": None}}


def test_config_enabled_surfaces_pr_and_commit(monkeypatch):
    monkeypatch.setenv("PREVIEW_BANNER", "1")
    monkeypatch.setenv("PREVIEW_PR", "42")
    monkeypatch.setenv("PREVIEW_COMMIT", "abc123")
    body = client.get("/api/config").json()
    assert body == {"preview": {"enabled": True, "pr": "42", "commit": "abc123"}}


def test_config_disabled_hides_pr_even_if_set(monkeypatch):
    # PR/commit only leak through when the banner is explicitly enabled.
    monkeypatch.delenv("PREVIEW_BANNER", raising=False)
    monkeypatch.setenv("PREVIEW_PR", "42")
    body = client.get("/api/config").json()
    assert body["preview"]["pr"] is None


def test_healthz():
    assert client.get("/healthz").json() == {"status": "ok"}
