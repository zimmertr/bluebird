"""TTL caches for discovery and per-location forecasts (issue #180)."""

from __future__ import annotations

import pytest
from app.models import DestinationType, GeoPolygon
from app.services import cache, osm


class _Clock:
    def __init__(self, t: float = 0.0):
        self.t = t

    def __call__(self) -> float:
        return self.t


def test_ttl_cache_hits_until_expiry():
    clock = _Clock()
    c = cache.TTLCache(8, ttl_s=10.0, clock=clock)
    c.put("k", "v")
    assert c.get("k") == "v"
    clock.t = 9.9
    assert c.get("k") == "v"
    clock.t = 10.0
    assert c.get("k") is None


def test_ttl_cache_evicts_least_recently_used():
    clock = _Clock()
    c = cache.TTLCache(2, ttl_s=100.0, clock=clock)
    c.put("a", 1)
    c.put("b", 2)
    assert c.get("a") == 1  # refresh a's recency
    c.put("c", 3)  # evicts b, the least recently used
    assert c.get("b") is None
    assert c.get("a") == 1
    assert c.get("c") == 3


def test_discovery_key_tolerates_sub_meter_ring_noise():
    ring_a = [[-121.955, 48.954], [-120.413, 48.954], [-120.407, 47.288]]
    ring_b = [[c + 1e-7 for c in pair] for pair in ring_a]
    assert cache.discovery_key(ring_a, "peak") == cache.discovery_key(ring_b, "peak")
    # A genuinely different polygon or type is a different key.
    assert cache.discovery_key(ring_a, "lake") != cache.discovery_key(ring_a, "peak")


def test_forecast_key_distinguishes_windows_sharing_dates():
    # Values are per-window aggregates, so two windows inside the same dates
    # must never collide.
    a = cache.forecast_key("weather", 48.1, -121.1, "2026-07-29T06:00", "2026-07-29T18:00")
    b = cache.forecast_key("weather", 48.1, -121.1, "2026-07-29T00:00", "2026-07-29T23:00")
    assert a != b


_POLY = GeoPolygon(
    type="Polygon",
    coordinates=[[[0.0, 0.0], [0.1, 0.0], [0.1, 0.1], [0.0, 0.1], [0.0, 0.0]]],
)


async def test_query_osm_serves_repeat_from_cache(monkeypatch):
    calls = 0

    async def fake_post(query, on_status=None):
        nonlocal calls
        calls += 1
        return {
            "elements": [
                {"type": "node", "id": 1, "lat": 0.05, "lon": 0.05, "tags": {"name": "A"}}
            ]
        }

    monkeypatch.setattr(osm, "_post_with_fallback", fake_post)
    first = await osm.query_osm(_POLY, DestinationType.peak)
    second = await osm.query_osm(_POLY, DestinationType.peak)
    assert calls == 1
    assert first == second
    # The cached list is returned as a copy: mutating one caller's result
    # must not corrupt the entry the next caller receives.
    second.clear()
    third = await osm.query_osm(_POLY, DestinationType.peak)
    assert len(third) == 1


async def test_partial_results_are_never_cached(monkeypatch):
    from app.services.errors import PartialResultError

    calls = 0

    async def flaky_post(query, on_status=None):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise PartialResultError("runtime error: query timed out")
        return {
            "elements": [
                {"type": "node", "id": 1, "lat": 0.05, "lon": 0.05, "tags": {"name": "A"}}
            ]
        }

    monkeypatch.setattr(osm, "_post_with_fallback", flaky_post)
    with pytest.raises(PartialResultError):
        await osm.query_osm(_POLY, DestinationType.peak)
    # The failure cached nothing: the retry really queries again.
    result = await osm.query_osm(_POLY, DestinationType.peak)
    assert calls == 2
    assert len(result) == 1
