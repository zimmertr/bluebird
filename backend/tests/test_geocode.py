from __future__ import annotations

import asyncio

import httpx
from conftest import fake_response
from fastapi.testclient import TestClient

from app.main import app
from app.routes import geocode as geocode_mod

client = TestClient(app)


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
    _patch_client(monkeypatch, fake_response(rows))
    resp = client.get("/api/geocode", params={"q": "Seattle"})
    assert resp.status_code == 200
    assert resp.json() == rows


def test_geocode_sends_policy_user_agent(monkeypatch):
    # Nominatim requires an identifying User-Agent; the proxy must attach it.
    seen = {}

    class _Capturing(_FakeClient):
        async def get(self, url, params=None, headers=None):
            seen["headers"] = headers
            return fake_response([])

    monkeypatch.setattr(geocode_mod.httpx, "AsyncClient", lambda *a, **k: _Capturing(None))
    client.get("/api/geocode", params={"q": "x"})
    assert seen["headers"]["User-Agent"] == geocode_mod.USER_AGENT


def test_geocode_upstream_error_is_502(monkeypatch):
    _patch_client(monkeypatch, httpx.ConnectError("down"))
    resp = client.get("/api/geocode", params={"q": "Seattle"})
    assert resp.status_code == 502
    assert resp.json()["detail"] == "Cannot reach Nominatim (place search). Try again later."
    assert resp.json()["error"] == {"code": "upstream_unavailable", "retryable": True}


def test_geocode_non_list_payload_is_502(monkeypatch):
    _patch_client(monkeypatch, fake_response({"error": "unexpected"}))
    resp = client.get("/api/geocode", params={"q": "Seattle"})
    assert resp.status_code == 502
    assert resp.json()["detail"] == (
        "Nominatim (place search) returned an unexpected response."
    )
    assert resp.json()["error"] == {"code": "upstream_unavailable", "retryable": True}


def test_geocode_empty_query_is_422():
    # q has min_length=1 — an empty query fails FastAPI validation.
    assert client.get("/api/geocode", params={"q": ""}).status_code == 422


def test_geocode_limit_out_of_range_is_422():
    assert client.get("/api/geocode", params={"q": "x", "limit": 99}).status_code == 422


class _Counting(_FakeClient):
    """Counts the calls that would have reached Nominatim."""

    calls: list[dict] = []

    async def get(self, url, params=None, headers=None):
        _Counting.calls.append(params)
        return await super().get(url, params=params, headers=headers)


def _patch_counting(monkeypatch, resp_or_exc):
    _Counting.calls = []
    monkeypatch.setattr(geocode_mod.httpx, "AsyncClient", lambda *a, **k: _Counting(resp_or_exc))
    return _Counting.calls


def test_geocode_repeat_search_is_served_from_cache(monkeypatch):
    # Nominatim's usage policy asks callers to cache, and the per-pod gate
    # makes every uncached search wait its turn (#571).
    rows = [{"display_name": "Mount Rainier", "lat": "46.85", "lon": "-121.76"}]
    calls = _patch_counting(monkeypatch, fake_response(rows))
    first = client.get("/api/geocode", params={"q": "Mount Rainier"})
    second = client.get("/api/geocode", params={"q": "Mount Rainier"})
    assert first.json() == second.json() == rows
    assert len(calls) == 1


def test_geocode_cache_hit_does_not_wait_for_the_gate(monkeypatch):
    # A hit must not take a slot in the Nominatim queue: with the gate shut,
    # the cached answer still comes back.
    rows = [{"display_name": "Seattle", "lat": "47.6", "lon": "-122.3"}]
    _patch_counting(monkeypatch, fake_response(rows))
    client.get("/api/geocode", params={"q": "Seattle"})

    async def _refuse():
        raise AssertionError("a cached search acquired the Nominatim gate")

    monkeypatch.setattr(geocode_mod.ratelimit.NOMINATIM_GATE, "acquire", _refuse)
    assert client.get("/api/geocode", params={"q": "Seattle"}).json() == rows


def test_geocode_cache_keys_on_the_limit(monkeypatch):
    # Five rows cannot answer a request for ten.
    calls = _patch_counting(monkeypatch, fake_response([]))
    client.get("/api/geocode", params={"q": "Seattle", "limit": 5})
    client.get("/api/geocode", params={"q": "Seattle", "limit": 10})
    client.get("/api/geocode", params={"q": "Seattle", "limit": 5})
    assert [c["limit"] for c in calls] == [5, 10]


def test_geocode_caches_an_empty_answer(monkeypatch):
    calls = _patch_counting(monkeypatch, fake_response([]))
    client.get("/api/geocode", params={"q": "Nowhere at all"})
    assert client.get("/api/geocode", params={"q": "Nowhere at all"}).json() == []
    assert len(calls) == 1


def test_geocode_does_not_cache_a_failure(monkeypatch):
    calls = _patch_counting(monkeypatch, httpx.ConnectError("down"))
    assert client.get("/api/geocode", params={"q": "Seattle"}).status_code == 502
    assert client.get("/api/geocode", params={"q": "Seattle"}).status_code == 502
    assert len(calls) == 2


def test_geocode_does_not_cache_a_non_list_payload(monkeypatch):
    calls = _patch_counting(monkeypatch, fake_response({"error": "unexpected"}))
    client.get("/api/geocode", params={"q": "Seattle"})
    client.get("/api/geocode", params={"q": "Seattle"})
    assert len(calls) == 2


def test_geocode_asks_again_after_the_ttl(monkeypatch):
    now = [0.0]
    monkeypatch.setattr(
        geocode_mod.cache,
        "GEOCODE_CACHE",
        geocode_mod.cache.TTLCache(
            geocode_mod.cache.GEOCODE_MAX_ENTRIES,
            geocode_mod.cache.GEOCODE_TTL_S,
            clock=lambda: now[0],
        ),
    )
    calls = _patch_counting(monkeypatch, fake_response([]))
    client.get("/api/geocode", params={"q": "Seattle"})
    now[0] = geocode_mod.cache.GEOCODE_TTL_S - 1
    client.get("/api/geocode", params={"q": "Seattle"})
    now[0] = geocode_mod.cache.GEOCODE_TTL_S
    client.get("/api/geocode", params={"q": "Seattle"})
    assert len(calls) == 2


def test_geocode_body_that_is_not_json_is_502(monkeypatch):
    # Issue #630: an HTML block page on a 200 decodes to nothing. It used to
    # escape the handler as a bare 500 rather than the route's documented 502.
    _patch_client(monkeypatch, fake_response(None, text="<html>blocked</html>"))
    resp = client.get("/api/geocode", params={"q": "Seattle"})
    assert resp.status_code == 502
    assert resp.json()["detail"] == f"{geocode_mod.PROVIDER} request failed. Try again later."


def test_geocode_past_its_total_deadline_is_502(monkeypatch):
    # Issue #630: httpx's timeout is per operation, so a slow trickle never
    # trips it. The whole call has a deadline.
    monkeypatch.setattr(geocode_mod, "TIMEOUT_S", 0.05, raising=False)

    class _Slow(_FakeClient):
        async def get(self, url, params=None, headers=None):
            await asyncio.sleep(1)
            return fake_response([])

    monkeypatch.setattr(geocode_mod.httpx, "AsyncClient", lambda *a, **k: _Slow(None))
    resp = client.get("/api/geocode", params={"q": "Seattle"})
    assert resp.status_code == 502
    assert resp.json()["detail"] == f"{geocode_mod.PROVIDER} took too long. Try again later."
