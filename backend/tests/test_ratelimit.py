from __future__ import annotations

import asyncio
import importlib
import json
from datetime import datetime, timedelta, timezone

from app import ratelimit
from app.main import app
from app.routes import geocode as geocode_mod
from app.services import air_quality as aqi_mod
from app.services import osm as osm_mod
from app.services import weather as weather_mod
from fastapi import Request
from fastapi.testclient import TestClient

client = TestClient(app)


# ── Helpers ────────────────────────────────────────────────────────────────


class _Clock:
    """Injectable monotonic clock so refill math is tested without sleeping."""

    def __init__(self, t: float = 0.0):
        self.t = t

    def __call__(self) -> float:
        return self.t


def _request(headers: dict[str, str] | None = None, peer: tuple | None = ("198.51.100.7", 4242)) -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/analyze",
        "query_string": b"",
        "headers": [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()],
        "client": peer,
    }
    return Request(scope)


def _window(inverted: bool = False) -> dict[str, str]:
    now = datetime.now(timezone.utc)
    start, end = now, now + timedelta(days=1)
    if inverted:
        start, end = end, start
    return {"start_datetime": start.isoformat(), "end_datetime": end.isoformat()}


def _analyze_payload(inverted: bool = True) -> dict:
    # An inverted window fails with 400 inside the handler, past the rate-limit
    # dependency but before any upstream call — the cheapest real request.
    return {
        "destination_type": "peak",
        "polygon": {
            "type": "Polygon",
            "coordinates": [[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1], [0, 0]]],
        },
        **_window(inverted=inverted),
    }


def _sse_events(text: str) -> list[dict]:
    events = []
    for block in text.split("\n\n"):
        for line in block.split("\n"):
            if line.startswith("data: "):
                events.append(json.loads(line[6:]))
    return events


class _AlwaysShed:
    """Budget stand-in whose slot always sheds."""

    def slot(self):
        return self

    async def __aenter__(self):
        raise ratelimit.BudgetExhausted("test provider")

    async def __aexit__(self, *exc):
        return False


# ── Token bucket / RateLimiter ─────────────────────────────────────────────


def test_bucket_allows_burst_then_denies():
    clock = _Clock()
    limiter = ratelimit.RateLimiter(60, 3, clock=clock)
    assert all(limiter.check("a")[0] for _ in range(3))
    allowed, retry_after = limiter.check("a")
    assert not allowed
    assert retry_after == 1.0  # 60/min = 1 token/s, bucket at exactly 0


def test_bucket_refills_over_time():
    clock = _Clock()
    limiter = ratelimit.RateLimiter(60, 1, clock=clock)
    assert limiter.check("a")[0]
    assert not limiter.check("a")[0]
    clock.t = 1.01
    assert limiter.check("a")[0]


def test_retry_after_shrinks_as_refill_progresses():
    clock = _Clock()
    limiter = ratelimit.RateLimiter(60, 1, clock=clock)
    limiter.check("a")
    _, at_zero = limiter.check("a")
    clock.t = 0.5
    _, at_half = limiter.check("a")
    assert at_half < at_zero


def test_disabled_limiter_always_allows():
    limiter = ratelimit.RateLimiter(0, 1)
    assert all(limiter.check("a")[0] for _ in range(100))


def test_keys_are_isolated():
    clock = _Clock()
    limiter = ratelimit.RateLimiter(60, 1, clock=clock)
    assert limiter.check("a")[0]
    assert not limiter.check("a")[0]
    assert limiter.check("b")[0]


def test_eviction_drops_full_buckets_first():
    clock = _Clock()
    limiter = ratelimit.RateLimiter(60, 1, max_keys=2, clock=clock)
    limiter.check("a")
    limiter.check("b")
    # Both refill to full; a full bucket carries no enforcement state, so both
    # are evictable and the new key gets a bucket without touching real state.
    clock.t = 2.0
    assert limiter.check("c")[0]
    assert set(limiter._buckets) == {"c"}


def test_eviction_keeps_depleted_buckets_when_possible():
    clock = _Clock()
    limiter = ratelimit.RateLimiter(60, 1, max_keys=2, clock=clock)
    limiter.check("hot")  # depleted: mid-refill, still enforcement-relevant
    clock.t = 1.5
    limiter.check("idle")  # brand-new at t=1.5
    clock.t = 1.6  # "hot" refilled (>=1s passed), "idle" is mid-refill
    assert limiter.check("new")[0]
    assert "idle" in limiter._buckets  # survived: only the full bucket was dropped
    assert "hot" not in limiter._buckets


def test_reset_clears_state():
    limiter = ratelimit.RateLimiter(60, 1)
    limiter.check("a")
    assert not limiter.check("a")[0]
    limiter.reset()
    assert limiter.check("a")[0]


# ── client_key ─────────────────────────────────────────────────────────────


def test_client_key_prefers_cf_connecting_ip():
    req = _request({"cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "10.0.0.1, 172.16.0.1"})
    assert ratelimit.client_key(req) == "203.0.113.9"


def test_client_key_takes_rightmost_xff_hop():
    # The leftmost hop is client-typed; rotating it must not mint new buckets.
    spoof_a = _request({"x-forwarded-for": "1.1.1.1, 198.51.100.99"})
    spoof_b = _request({"x-forwarded-for": "2.2.2.2, 198.51.100.99"})
    assert ratelimit.client_key(spoof_a) == "198.51.100.99"
    assert ratelimit.client_key(spoof_a) == ratelimit.client_key(spoof_b)


def test_client_key_falls_back_to_socket_peer():
    assert ratelimit.client_key(_request()) == "198.51.100.7"


def test_client_key_dash_without_peer():
    assert ratelimit.client_key(_request(peer=None)) == "-"


# ── Route enforcement: 429 ─────────────────────────────────────────────────


def test_analyze_429_after_burst(monkeypatch):
    monkeypatch.setattr(ratelimit, "ANALYZE_LIMITER", ratelimit.RateLimiter(60, 1))
    assert client.post("/api/analyze", json=_analyze_payload()).status_code == 400
    resp = client.post("/api/analyze", json=_analyze_payload())
    assert resp.status_code == 429
    assert int(resp.headers["retry-after"]) >= 1
    assert "Try again" in resp.json()["detail"]


def test_stream_shares_analyze_bucket_and_429_is_plain_http(monkeypatch):
    monkeypatch.setattr(ratelimit, "ANALYZE_LIMITER", ratelimit.RateLimiter(60, 1))
    assert client.post("/api/analyze", json=_analyze_payload()).status_code == 400
    # The second request lands on the stream endpoint: same bucket, and the
    # refusal is a plain 429 JSON response, not an SSE error event.
    resp = client.post("/api/analyze/stream", json=_analyze_payload())
    assert resp.status_code == 429
    assert resp.headers["retry-after"]
    assert resp.json()["detail"].startswith("Too many requests")


def test_geocode_bucket_independent_of_analyze(monkeypatch):
    monkeypatch.setattr(ratelimit, "ANALYZE_LIMITER", ratelimit.RateLimiter(60, 1))
    monkeypatch.setattr(ratelimit, "GEOCODE_LIMITER", ratelimit.RateLimiter(60, 1))

    class _FakeResp:
        def raise_for_status(self):
            return None

        def json(self):
            return []

    class _FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, params=None, headers=None):
            return _FakeResp()

    monkeypatch.setattr(geocode_mod.httpx, "AsyncClient", lambda *a, **k: _FakeClient())

    # Drain the analyze bucket; geocode must still have its own token.
    assert client.post("/api/analyze", json=_analyze_payload()).status_code == 400
    assert client.get("/api/geocode", params={"q": "Rainier"}).status_code == 200
    resp = client.get("/api/geocode", params={"q": "Rainier"})
    assert resp.status_code == 429
    assert resp.headers["retry-after"]


# ── Route enforcement: 503 shed ────────────────────────────────────────────


def test_analyze_503_when_overpass_budget_sheds(monkeypatch):
    async def shed(*args, **kwargs):
        raise ratelimit.BudgetExhausted("OpenStreetMap (Overpass)")

    monkeypatch.setattr(osm_mod, "query_osm", shed)
    resp = client.post("/api/analyze", json=_analyze_payload(inverted=False))
    assert resp.status_code == 503
    assert resp.headers["retry-after"] == str(ratelimit.SHED_RETRY_AFTER_S)
    assert "capacity" in resp.json()["detail"]


def test_analyze_503_when_weather_budget_sheds(monkeypatch):
    async def one_peak(*args, **kwargs):
        return [{"name": "Peak", "latitude": 0.05, "longitude": 0.05, "elevation_ft": None, "osm_id": None}]

    async def shed(*args, **kwargs):
        raise ratelimit.BudgetExhausted("Open-Meteo (weather service)")

    async def no_aqi(destinations, *args, **kwargs):
        return [None] * len(destinations)

    monkeypatch.setattr(osm_mod, "query_osm", one_peak)
    monkeypatch.setattr(weather_mod, "fetch_weather_batch", shed)
    monkeypatch.setattr(aqi_mod, "fetch_aqi_batch", no_aqi)
    resp = client.post("/api/analyze", json=_analyze_payload(inverted=False))
    assert resp.status_code == 503
    assert resp.headers["retry-after"] == str(ratelimit.SHED_RETRY_AFTER_S)


def test_stream_budget_shed_arrives_as_error_event(monkeypatch):
    async def shed(*args, **kwargs):
        raise ratelimit.BudgetExhausted("OpenStreetMap (Overpass)")

    monkeypatch.setattr(osm_mod, "query_osm", shed)
    resp = client.post("/api/analyze/stream", json=_analyze_payload(inverted=False))
    assert resp.status_code == 200  # stream already open; failure is an event
    events = _sse_events(resp.text)
    assert events[-1]["type"] == "error"
    assert "capacity" in events[-1]["message"]


def test_aqi_budget_shed_degrades_to_none(monkeypatch):
    monkeypatch.setattr(ratelimit, "AQI_BUDGET", _AlwaysShed())
    dests = [{"latitude": 0.0, "longitude": 0.0} for _ in range(3)]
    now = datetime.now(timezone.utc)
    out = asyncio.run(aqi_mod.fetch_aqi_batch(dests, now, now + timedelta(days=1)))
    assert out == [None, None, None]


def test_geocode_503_when_gate_queue_is_full(monkeypatch):
    gate = ratelimit.MinIntervalGate("Nominatim (place search)", 10.0, max_wait_s=0.0)
    monkeypatch.setattr(ratelimit, "NOMINATIM_GATE", gate)

    class _FakeResp:
        def raise_for_status(self):
            return None

        def json(self):
            return []

    class _FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def get(self, url, params=None, headers=None):
            return _FakeResp()

    monkeypatch.setattr(geocode_mod.httpx, "AsyncClient", lambda *a, **k: _FakeClient())

    assert client.get("/api/geocode", params={"q": "Baker"}).status_code == 200
    resp = client.get("/api/geocode", params={"q": "Baker"})
    assert resp.status_code == 503
    assert int(resp.headers["retry-after"]) >= 1


# ── UpstreamBudget ─────────────────────────────────────────────────────────


def test_budget_caps_concurrency():
    async def scenario():
        budget = ratelimit.UpstreamBudget("test", 2, wait_s=5.0)
        active = 0
        peak = 0

        async def worker():
            nonlocal active, peak
            async with budget.slot():
                active += 1
                peak = max(peak, active)
                await asyncio.sleep(0.01)
                active -= 1

        await asyncio.gather(*(worker() for _ in range(6)))
        return peak

    assert asyncio.run(scenario()) == 2


def test_budget_sheds_after_bounded_wait():
    async def scenario():
        budget = ratelimit.UpstreamBudget("test", 1, wait_s=0.02)

        async def holder():
            async with budget.slot():
                await asyncio.sleep(0.2)

        hold = asyncio.create_task(holder())
        await asyncio.sleep(0.01)
        try:
            async with budget.slot():
                return None
        except ratelimit.BudgetExhausted as exc:
            return exc
        finally:
            hold.cancel()

    exc = asyncio.run(scenario())
    assert isinstance(exc, ratelimit.BudgetExhausted)
    assert exc.retry_after_s == ratelimit.SHED_RETRY_AFTER_S
    assert "capacity" in exc.message


def test_budget_releases_slot_on_exception():
    async def scenario():
        budget = ratelimit.UpstreamBudget("test", 1, wait_s=0.05)
        try:
            async with budget.slot():
                raise RuntimeError("boom")
        except RuntimeError:
            pass
        async with budget.slot():
            return True

    assert asyncio.run(scenario())


# ── MinIntervalGate ────────────────────────────────────────────────────────


def test_gate_spaces_consecutive_calls():
    async def scenario():
        gate = ratelimit.MinIntervalGate("test", 0.05)
        loop = asyncio.get_running_loop()
        t0 = loop.time()
        await gate.acquire()
        await gate.acquire()
        return loop.time() - t0

    assert asyncio.run(scenario()) >= 0.05


def test_gate_sheds_when_queue_exceeds_max_wait():
    async def scenario():
        gate = ratelimit.MinIntervalGate("test", 10.0, max_wait_s=0.05)
        await gate.acquire()
        try:
            await gate.acquire()
        except ratelimit.BudgetExhausted as exc:
            return exc
        return None

    exc = asyncio.run(scenario())
    assert isinstance(exc, ratelimit.BudgetExhausted)
    assert exc.retry_after_s == 10


def test_gate_zero_interval_is_a_noop():
    async def scenario():
        gate = ratelimit.MinIntervalGate("test", 0.0)
        for _ in range(50):
            await gate.acquire()
        return True

    assert asyncio.run(scenario())


# ── Capabilities contract ──────────────────────────────────────────────────


def test_capabilities_publishes_live_limiter_values(monkeypatch):
    monkeypatch.setattr(ratelimit, "ANALYZE_LIMITER", ratelimit.RateLimiter(12, 6))
    monkeypatch.setattr(ratelimit, "DESTINATIONS_LIMITER", ratelimit.RateLimiter(30, 10))
    monkeypatch.setattr(ratelimit, "GEOCODE_LIMITER", ratelimit.RateLimiter(30, 10))
    monkeypatch.setattr(ratelimit, "WILDFIRES_LIMITER", ratelimit.RateLimiter(90, 30))
    rate = client.get("/api/capabilities").json()["limits"]["rate"]
    assert rate == {
        "analyze_per_minute": 12,
        "analyze_burst": 6,
        "destinations_per_minute": 30,
        "destinations_burst": 10,
        "geocode_per_minute": 30,
        "geocode_burst": 10,
        "wildfires_per_minute": 90,
        "wildfires_burst": 30,
    }


# ── Env config ─────────────────────────────────────────────────────────────


def test_env_overrides_and_bad_values_fall_back(monkeypatch):
    monkeypatch.setenv("RATE_LIMIT_ANALYZE_PER_MINUTE", "99")
    monkeypatch.setenv("UPSTREAM_CONCURRENCY_OVERPASS", "not-a-number")
    try:
        importlib.reload(ratelimit)
        assert ratelimit.RATE_LIMIT_ANALYZE_PER_MINUTE == 99
        assert ratelimit.ANALYZE_LIMITER.per_minute == 99
        assert ratelimit.UPSTREAM_CONCURRENCY_OVERPASS == 2  # default kept
    finally:
        monkeypatch.delenv("RATE_LIMIT_ANALYZE_PER_MINUTE", raising=False)
        monkeypatch.delenv("UPSTREAM_CONCURRENCY_OVERPASS", raising=False)
        importlib.reload(ratelimit)
