from __future__ import annotations

import httpx
import pytest
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


async def test_query_osm_unimplemented_type_raises():
    with pytest.raises(NotImplementedError):
        await osm.query_osm(POLY, DestinationType.custom)


# ── _post_with_fallback (the 3-endpoint mirror chain) ──────────────────────


class _FakeResp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeClient:
    """Async-context httpx stand-in that replays a scripted list of behaviors,
    one per .post() call (an Exception is raised, anything else is returned)."""

    def __init__(self, behaviors):
        self._behaviors = behaviors
        self.calls = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, data=None):
        behavior = self._behaviors[self.calls]
        self.calls += 1
        if isinstance(behavior, Exception):
            raise behavior
        return behavior


async def test_post_with_fallback_recovers_on_second_endpoint(monkeypatch):
    statuses: list[str] = []

    async def on_status(msg):
        statuses.append(msg)

    fake = _FakeClient([httpx.ConnectError("down"), _FakeResp({"elements": []})])
    monkeypatch.setattr(osm.httpx, "AsyncClient", lambda *a, **k: fake)

    result = await osm._post_with_fallback("q", on_status)
    assert result == {"elements": []}
    assert fake.calls == 2
    # Each attempt announces itself before firing.
    assert len(statuses) == 2


async def test_post_with_fallback_all_endpoints_fail(monkeypatch):
    fake = _FakeClient([httpx.ConnectError("a"), httpx.ConnectError("b"), httpx.ConnectError("c")])
    monkeypatch.setattr(osm.httpx, "AsyncClient", lambda *a, **k: fake)

    with pytest.raises(UpstreamError):
        await osm._post_with_fallback("q")
    assert fake.calls == len(osm.OVERPASS_ENDPOINTS)
