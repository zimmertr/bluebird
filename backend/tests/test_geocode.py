from __future__ import annotations

import httpx
from app.main import app
from app.routes import geocode as geocode_mod
from fastapi.testclient import TestClient

client = TestClient(app)


class _FakeResp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeClient:
    """Async-context httpx stand-in; returns a canned response or raises."""

    def __init__(self, resp_or_exc):
        self._r = resp_or_exc

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, params=None, headers=None):
        if isinstance(self._r, Exception):
            raise self._r
        return self._r


def _patch_client(monkeypatch, resp_or_exc):
    monkeypatch.setattr(geocode_mod.httpx, "AsyncClient", lambda *a, **k: _FakeClient(resp_or_exc))


def test_geocode_forwards_list_payload(monkeypatch):
    rows = [{"display_name": "Seattle", "lat": "47.6", "lon": "-122.3"}]
    _patch_client(monkeypatch, _FakeResp(rows))
    resp = client.get("/api/geocode", params={"q": "Seattle"})
    assert resp.status_code == 200
    assert resp.json() == rows


def test_geocode_sends_policy_user_agent(monkeypatch):
    # Nominatim requires an identifying User-Agent; the proxy must attach it.
    seen = {}

    class _Capturing(_FakeClient):
        async def get(self, url, params=None, headers=None):
            seen["headers"] = headers
            return _FakeResp([])

    monkeypatch.setattr(geocode_mod.httpx, "AsyncClient", lambda *a, **k: _Capturing(None))
    client.get("/api/geocode", params={"q": "x"})
    assert seen["headers"]["User-Agent"] == geocode_mod.USER_AGENT


def test_geocode_upstream_error_is_502(monkeypatch):
    _patch_client(monkeypatch, httpx.ConnectError("down"))
    resp = client.get("/api/geocode", params={"q": "Seattle"})
    assert resp.status_code == 502


def test_geocode_non_list_payload_is_502(monkeypatch):
    _patch_client(monkeypatch, _FakeResp({"error": "unexpected"}))
    resp = client.get("/api/geocode", params={"q": "Seattle"})
    assert resp.status_code == 502


def test_geocode_empty_query_is_422():
    # q has min_length=1 — an empty query fails FastAPI validation.
    assert client.get("/api/geocode", params={"q": ""}).status_code == 422


def test_geocode_limit_out_of_range_is_422():
    assert client.get("/api/geocode", params={"q": "x", "limit": 99}).status_code == 422
