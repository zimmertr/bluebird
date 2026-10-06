"""TTL caches for discovery and per-location forecasts (issue #180)."""

from __future__ import annotations

import random
import sys
from datetime import UTC, datetime, timedelta

import pytest

from app.models import DestinationType, GeoPolygon
from app.services import aggregation, cache, osm


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


def test_ttl_cache_evicts_by_bytes_least_recently_used_first():
    c = cache.TTLCache(8, ttl_s=100.0, max_bytes=10, sizer=len, clock=_Clock())
    c.put("a", "xxxx")
    c.put("b", "xxxx")
    assert c.get("a") == "xxxx"  # refresh a's recency
    c.put("c", "xxxx")  # 12 bytes held would pass 10: b goes, the least recent
    assert c.get("b") is None
    assert c.get("a") == "xxxx"
    assert c.get("c") == "xxxx"
    assert c.bytes == 8


def test_ttl_cache_refuses_an_entry_larger_than_its_byte_bound():
    # Caching it would evict everything else and still not fit.
    c = cache.TTLCache(8, ttl_s=100.0, max_bytes=10, sizer=len, clock=_Clock())
    c.put("a", "xxxx")
    c.put("big", "x" * 11)
    assert c.get("big") is None
    assert c.get("a") == "xxxx"
    assert c.bytes == 4


def test_ttl_cache_counts_a_replaced_or_expired_entry_once():
    clock = _Clock()
    c = cache.TTLCache(8, ttl_s=10.0, max_bytes=10, sizer=len, clock=clock)
    c.put("a", "xxxxxx")
    c.put("a", "xx")
    assert c.bytes == 2
    c.put("b", "x" * 8)  # exactly the bound: a stays
    assert c.get("a") == "xx"
    clock.t = 10.0
    assert c.get("a") is None
    assert c.bytes == 8
    c.clear()
    assert c.bytes == 0


def _hours(count: int) -> list[str]:
    start = datetime(2026, 9, 1, tzinfo=UTC)
    return [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(count)]


def _deep_size(obj, seen=None) -> int:
    """What an object really holds: itself, and every container and value
    under it, each counted once."""
    seen = set() if seen is None else seen
    if id(obj) in seen:
        return 0
    seen.add(id(obj))
    size = sys.getsizeof(obj)
    if isinstance(obj, dict):
        size += sum(_deep_size(k, seen) + _deep_size(v, seen) for k, v in obj.items())
    elif isinstance(obj, (list, tuple)):
        size += sum(_deep_size(v, seen) for v in obj)
    return size


@pytest.mark.parametrize("hours", [1, 24, 385, 2_000])
def test_forecast_entry_bytes_never_counts_less_than_an_entry_holds(hours):
    # The bound is only a bound if the count it adds up is not an
    # underestimate. Each value here is a fresh float, which is what the
    # aggregation produces, and every column is present: the largest shape a
    # weather entry takes.
    rng = random.Random(hours)
    times = _hours(hours)
    start = datetime.fromisoformat(times[0]).replace(tzinfo=UTC)
    end = datetime.fromisoformat(times[-1]).replace(tzinfo=UTC)
    item = {
        "hourly_units": {**aggregation._DECLARED_UNITS, "freezing_level_height": "ft"},
        "hourly": {
            "time": times,
            **{
                name: [round(rng.random() * 60, 1) for _ in times]
                for name in aggregation.HOURLY_VARIABLES.split(",")
            },
        },
    }
    metrics = aggregation._weather_metrics(item, start, end, 9000.0)
    weather_entry = {**metrics, "series": aggregation._weather_series(item, start, end, 9000.0)}
    aqi_item = {"hourly": {"time": times, "us_aqi": [rng.randint(0, 300) for _ in times]}}
    aqi_entry = {
        **aggregation._aqi_metrics(aqi_item, start, end),
        "series": aggregation._aqi_series(aqi_item, start, end),
    }
    for entry in (weather_entry, aqi_entry):
        assert cache.forecast_entry_bytes(entry) >= _deep_size(entry)
    assert cache.forecast_entry_bytes(cache.NO_DATA) >= _deep_size(cache.NO_DATA)


def test_the_forecast_cache_is_bounded_by_bytes():
    assert cache.FORECAST_CACHE.max_bytes == cache.FORECAST_MAX_BYTES
    # A year of one destination's weather is a few megabytes, so the bound
    # holds many of them and never refuses one outright.
    year = {"series": {"times": [0] * 9_400, **{k: [0.0] * 9_400 for k in "abcd"}}}
    assert cache.forecast_entry_bytes(year) < cache.FORECAST_MAX_BYTES // 100


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

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)
    first = await osm.query_osm(_POLY, [DestinationType.peak])
    second = await osm.query_osm(_POLY, [DestinationType.peak])
    assert calls == 1
    assert first == second
    # True copies, at both depths and in both directions: mutating the FRESH
    # call's dicts (which the cache stored) or a HIT's list/dicts must never
    # corrupt what the next caller receives.
    first[0]["elevation_ft"] = -1.0  # fresh-path dict shared with the store?
    second[0]["name"] = "corrupted"  # hit-path dict shared with the entry?
    second.clear()
    third = await osm.query_osm(_POLY, [DestinationType.peak])
    assert len(third) == 1
    assert third[0]["name"] == "A"
    assert third[0].get("elevation_ft") is None


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

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", flaky_post)
    with pytest.raises(PartialResultError):
        await osm.query_osm(_POLY, [DestinationType.peak])
    # The failure cached nothing: the retry really queries again.
    result = await osm.query_osm(_POLY, [DestinationType.peak])
    assert calls == 2
    assert len(result) == 1
