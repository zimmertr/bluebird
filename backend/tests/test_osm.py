from __future__ import annotations

import dataclasses

import httpx
import pytest
from app import ratelimit
from app.models import DestinationType, GeoPolygon
from app.services import osm
from app.services.errors import UpstreamError

POLY = GeoPolygon(type="Polygon", coordinates=[[[-121.0, 47.0], [-120.0, 47.0], [-120.0, 48.0]]])


def test_polygon_to_overpass_orders_lat_lon():
    # GeoJSON is [lon, lat]; Overpass wants "lat lon lat lon ...".
    assert osm._polygon_to_overpass(POLY) == "47.0 -121.0 47.0 -120.0 48.0 -120.0"


async def test_query_osm_parses_dedups_and_skips(monkeypatch):
    canned = {
        "elements": [
            {"type": "node", "id": 1, "lat": 47.5, "lon": -121.5, "tags": {"name": "Peak A", "ele": "1000"}},
            # Duplicate name — dropped.
            {"type": "node", "id": 2, "lat": 47.6, "lon": -121.6, "tags": {"name": "Peak A"}},
            # Way with a center rather than lat/lon on the element.
            {"type": "way", "id": 3, "center": {"lat": 47.7, "lon": -121.7}, "tags": {"name": "Lake B"}},
            # No name — dropped.
            {"type": "node", "id": 4, "lat": 47.8, "lon": -121.8, "tags": {}},
            # Missing coordinates — dropped.
            {"type": "node", "id": 5, "lat": None, "lon": -121.9, "tags": {"name": "NoCoord"}},
        ]
    }

    async def fake_post(query, on_status=None):
        return canned

    monkeypatch.setattr(osm, "_post_with_fallback", fake_post)
    results = await osm.query_osm(POLY, DestinationType.peak)

    names = [r["name"] for r in results]
    assert names == ["Peak A", "Lake B"]
    assert results[1]["latitude"] == 47.7  # way center picked up
    assert results[0]["osm_id"] == "node/1"
    assert results[1]["osm_id"] == "way/3"


async def test_query_osm_converts_elevation_meters_to_feet(monkeypatch):
    canned = {"elements": [{"type": "node", "id": 1, "lat": 1.0, "lon": 2.0, "tags": {"name": "X", "ele": "1000"}}]}

    async def fake_post(query, on_status=None):
        return canned

    monkeypatch.setattr(osm, "_post_with_fallback", fake_post)
    results = await osm.query_osm(POLY, DestinationType.peak)
    # 1000 m * 3.28084 ft/m, rounded to whole feet.
    assert results[0]["elevation_ft"] == 3281.0


async def test_query_osm_bad_elevation_tag_is_ignored(monkeypatch):
    canned = {"elements": [{"type": "node", "id": 1, "lat": 1.0, "lon": 2.0, "tags": {"name": "X", "ele": "high"}}]}

    async def fake_post(query, on_status=None):
        return canned

    monkeypatch.setattr(osm, "_post_with_fallback", fake_post)
    results = await osm.query_osm(POLY, DestinationType.peak)
    assert results[0]["elevation_ft"] is None


async def test_query_osm_peak_query_includes_volcanoes(monkeypatch):
    # Regression: Cascade volcanoes (Baker, Rainier, ...) are tagged
    # natural=volcano, not natural=peak — the peak query must ask for both.
    captured: dict[str, str] = {}

    async def fake_post(query, on_status=None):
        captured["query"] = query
        return {"elements": []}

    monkeypatch.setattr(osm, "_post_with_fallback", fake_post)
    await osm.query_osm(POLY, DestinationType.peak)
    assert 'node["natural"="peak"]["name"]' in captured["query"]
    assert 'node["natural"="volcano"]["name"]' in captured["query"]


async def test_query_osm_unimplemented_type_raises():
    with pytest.raises(NotImplementedError):
        await osm.query_osm(POLY, DestinationType.custom)


# ── _post_with_fallback (the 3-mirror failover chain) ──────────────────────


class _FakeResp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeClient:
    """Async-context httpx stand-in that replays a scripted list of behaviors,
    one per .post() call (an Exception is raised, anything else is returned).
    Records the url and timeout of every attempt for per-mirror assertions."""

    def __init__(self, behaviors):
        self._behaviors = behaviors
        self.calls = 0
        self.urls: list[str] = []
        self.timeouts: list[float | None] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, data=None, timeout=None):
        behavior = self._behaviors[self.calls]
        self.calls += 1
        self.urls.append(url)
        self.timeouts.append(timeout)
        if isinstance(behavior, Exception):
            raise behavior
        return behavior


def test_mirror_order_and_timeouts_match_measurements():
    # Guard for issue #177 (measured 2026-07-28): overpass-api.de 12-17s,
    # mail.ru 38.8s, kumi 77-108s. Reordering or retuning this table should
    # come with fresh measurements (or #77 telemetry) in hand — update the
    # dated comment in osm.py alongside this test.
    assert [m.url for m in osm.OVERPASS_MIRRORS] == [
        "https://overpass-api.de/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    ]
    assert [m.timeout_s for m in osm.OVERPASS_MIRRORS] == [25.0, 45.0, 45.0]
    # Separate operators get separate budgets, not one shared pool.
    assert len({id(m.budget) for m in osm.OVERPASS_MIRRORS}) == len(osm.OVERPASS_MIRRORS)


async def test_post_with_fallback_recovers_on_second_endpoint(monkeypatch):
    statuses: list[str] = []

    async def on_status(msg):
        statuses.append(msg)

    fake = _FakeClient([httpx.ConnectError("down"), _FakeResp({"elements": []})])
    monkeypatch.setattr(osm.httpx, "AsyncClient", lambda *a, **k: fake)

    result = await osm._post_with_fallback("q", on_status)
    assert result == {"elements": []}
    assert fake.calls == 2
    # The healthy first attempt is silent; only failover gets narrated.
    assert statuses == ["Trying backup map server 2 of 3…"]


async def test_post_with_fallback_all_endpoints_fail(monkeypatch):
    fake = _FakeClient([httpx.ConnectError("a"), httpx.ConnectError("b"), httpx.ConnectError("c")])
    monkeypatch.setattr(osm.httpx, "AsyncClient", lambda *a, **k: fake)

    with pytest.raises(UpstreamError):
        await osm._post_with_fallback("q")
    assert fake.calls == len(osm.OVERPASS_MIRRORS)
    # Each attempt carries its own mirror's leash, not one shared client value.
    assert fake.timeouts == [m.timeout_s for m in osm.OVERPASS_MIRRORS]


async def test_post_with_fallback_skips_saturated_mirror(monkeypatch):
    # Mirror 1's pod-wide budget is fully occupied: the chain must move to the
    # next operator (its own capacity) instead of shedding the analysis.
    saturated = ratelimit.UpstreamBudget("test (saturated)", 1, wait_s=0.01)
    await saturated._sem.acquire()
    mirrors = [
        dataclasses.replace(osm.OVERPASS_MIRRORS[0], budget=saturated),
        *osm.OVERPASS_MIRRORS[1:],
    ]
    monkeypatch.setattr(osm, "OVERPASS_MIRRORS", mirrors)

    statuses: list[str] = []

    async def on_status(msg):
        statuses.append(msg)

    fake = _FakeClient([_FakeResp({"elements": []})])
    monkeypatch.setattr(osm.httpx, "AsyncClient", lambda *a, **k: fake)

    result = await osm._post_with_fallback("q", on_status)
    assert result == {"elements": []}
    # The saturated mirror never fired an HTTP request.
    assert fake.urls == [mirrors[1].url]
    assert statuses == ["Trying backup map server 2 of 3…"]


async def test_post_with_fallback_all_mirrors_saturated_raises(monkeypatch):
    # Saturation of the FINAL mirror is terminal and keeps its BudgetExhausted
    # type, so the routes' existing 503 + Retry-After mapping still applies.
    mirrors = []
    for m in osm.OVERPASS_MIRRORS:
        budget = ratelimit.UpstreamBudget("test (saturated)", 1, wait_s=0.01)
        await budget._sem.acquire()
        mirrors.append(dataclasses.replace(m, budget=budget))
    monkeypatch.setattr(osm, "OVERPASS_MIRRORS", mirrors)

    fake = _FakeClient([])
    monkeypatch.setattr(osm.httpx, "AsyncClient", lambda *a, **k: fake)

    with pytest.raises(ratelimit.BudgetExhausted):
        await osm._post_with_fallback("q")
    assert fake.calls == 0


async def test_post_with_fallback_rejects_partial_remark(monkeypatch):
    # A mirror that times out mid-query returns 200 with PARTIAL elements plus
    # a `remark` — that must count as a mirror failure, not a result, or a
    # truncated candidate list gets ranked as if it were complete.
    partial = _FakeResp({"remark": "runtime error: Query timed out in 'query'", "elements": [{"type": "node"}]})
    clean = _FakeResp({"elements": []})
    fake = _FakeClient([partial, clean])
    monkeypatch.setattr(osm.httpx, "AsyncClient", lambda *a, **k: fake)

    result = await osm._post_with_fallback("q")
    assert result == {"elements": []}
    assert fake.calls == 2


async def test_post_with_fallback_all_partial_raises(monkeypatch):
    partial = {"remark": "runtime error: Query timed out", "elements": []}
    fake = _FakeClient([_FakeResp(partial), _FakeResp(partial), _FakeResp(partial)])
    monkeypatch.setattr(osm.httpx, "AsyncClient", lambda *a, **k: fake)

    with pytest.raises(UpstreamError) as excinfo:
        await osm._post_with_fallback("q")
    assert fake.calls == len(osm.OVERPASS_MIRRORS)
    # The user should be told the query was too demanding, not shown a raw
    # "failed unexpectedly" fallback string.
    assert "part of the results" in excinfo.value.message
    assert "smaller search area" in excinfo.value.message
