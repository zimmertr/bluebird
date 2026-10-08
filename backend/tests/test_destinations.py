from __future__ import annotations

import asyncio

import httpx
from fastapi.testclient import TestClient

from app import ratelimit
from app.main import app
from app.models import MAX_ANALYZE_PEAKS
from app.services import osm as osm_mod
from app.services.errors import UpstreamError

client = TestClient(app)

_POLYGON = {
    "type": "Polygon",
    "coordinates": [[[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1], [0, 0]]],
}


def _payload(**overrides) -> dict:
    return {"polygon": _POLYGON, "destination_types": ["peak"], **overrides}


def _peak(name: str, elevation_ft: float | None = None) -> dict:
    return {
        "name": name,
        "latitude": 0.05,
        "longitude": 0.05,
        "elevation_ft": elevation_ft,
        "osm_id": f"node/{abs(hash(name)) % 10_000}",
        # Discovery classifies every element from its own tags, so a stub of
        # it has to carry a type too or it stops representing the real thing.
        "type": "peak",
    }


def _stub_osm(monkeypatch, result):
    async def fake(polygon, destination_types, on_status=None, **_):
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(osm_mod, "query_osm", fake)


def test_returns_discovered_rows_tagged_with_their_own_type(monkeypatch):
    _stub_osm(monkeypatch, [_peak("Alpha", 5000.0), _peak("Beta")])
    resp = client.post("/api/destinations", json=_payload())
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert [d["name"] for d in body["destinations"]] == ["Alpha", "Beta"]
    assert {d["type"] for d in body["destinations"]} == {"peak"}
    assert body["destinations"][0]["elevation_ft"] == 5000.0
    assert body["destinations"][1]["elevation_ft"] is None


def test_elevation_band_filters_but_unknowns_pass(monkeypatch):
    _stub_osm(
        monkeypatch,
        [_peak("Low", 500.0), _peak("Mid", 5000.0), _peak("Unknown")],
    )
    resp = client.post("/api/destinations", json=_payload(min_elevation_ft=1000))
    assert resp.status_code == 200
    assert [d["name"] for d in resp.json()["destinations"]] == ["Mid", "Unknown"]


def test_no_types_and_no_list_is_a_400(monkeypatch):
    _stub_osm(monkeypatch, [])
    resp = client.post("/api/destinations", json=_payload(destination_types=[]))
    assert resp.status_code == 400
    assert resp.json()["detail"] == (
        "Nothing to do: no destination_types to discover and no "
        "custom_destinations to resolve. Pick types from "
        "GET /api/capabilities, or send a custom list."
    )
    assert resp.json()["error"] == {"code": "validation", "retryable": False}


def test_over_cap_refuses_with_the_analyze_wording(monkeypatch):
    _stub_osm(monkeypatch, [_peak(f"P{i}") for i in range(MAX_ANALYZE_PEAKS + 1)])
    resp = client.post("/api/destinations", json=_payload())
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "analysis limit" in detail
    # The detail states the problem only; remedies live in the structured
    # fields, never in the prose (TJ, 2026-08-22).
    assert "smaller polygon" not in detail
    assert "minimum elevation" not in detail
    assert resp.json()["error"] == {"code": "refusal", "retryable": False}


def test_oversized_polygon_is_a_422():
    huge = {
        "type": "Polygon",
        "coordinates": [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
    }
    resp = client.post("/api/destinations", json=_payload(polygon=huge))
    assert resp.status_code == 422


def test_missing_polygon_is_a_400_naming_both_ways_to_ask():
    # Optional since custom lists became resolvable here (#207), so a bare
    # request is now a route-level refusal rather than a schema violation —
    # the same 400 POST /api/analyze gives for the same omission.
    resp = client.post("/api/destinations", json={"destination_types": ["peak"]})
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "polygon is required" in detail
    assert "custom_destinations" in detail
    assert resp.json()["error"] == {"code": "validation", "retryable": False}


def test_upstream_failure_maps_to_502(monkeypatch):
    _stub_osm(monkeypatch, UpstreamError("Overpass is down"))
    resp = client.post("/api/destinations", json=_payload())
    assert resp.status_code == 502
    assert resp.json()["detail"] == "Overpass is down"
    assert resp.json()["error"] == {"code": "upstream_unavailable", "retryable": True}


def test_budget_exhaustion_maps_to_503_with_retry_after(monkeypatch):
    _stub_osm(monkeypatch, ratelimit.BudgetExhausted("OpenStreetMap (Overpass)"))
    resp = client.post("/api/destinations", json=_payload())
    assert resp.status_code == 503
    assert resp.headers["retry-after"] == str(ratelimit.SHED_RETRY_AFTER_S)
    assert "busy" in resp.json()["detail"]
    # The header and the flag must agree: a shed request is worth resending.
    assert resp.json()["error"] == {"code": "busy", "retryable": True}


def test_has_its_own_rate_limit_bucket(monkeypatch):
    # Split from the analyze bucket in issue #180: discovery is one cheap map
    # query, and burning the analyze budget on it starved real analyses.
    monkeypatch.setattr(ratelimit.client, "DESTINATIONS_LIMITER", ratelimit.RateLimiter(60, 1))
    monkeypatch.setattr(ratelimit.client, "ANALYZE_LIMITER", ratelimit.RateLimiter(60, 1))
    _stub_osm(monkeypatch, [])
    assert client.post("/api/destinations", json=_payload()).status_code == 200
    resp = client.post("/api/destinations", json=_payload())
    assert resp.status_code == 429
    assert resp.headers["retry-after"]
    assert resp.json()["error"] == {"code": "rate_limited", "retryable": True}
    # The analyze bucket was never touched by either discovery request.
    assert ratelimit.client.ANALYZE_LIMITER.check("client")[0]


# ── One discovery in flight per address (#627) ────────────────────────────────


def _held_discovery(monkeypatch):
    """Overpass held open until released, recording which polygon got in.

    Each caller below sends its own polygon, offset by its own west edge, so
    the record says whose discovery reached Overpass and in what order.
    """
    entered: list[float] = []
    release = asyncio.Event()

    async def fake(polygon, destination_types, on_status=None, **_):
        entered.append(polygon.coordinates[0][0][0])
        await release.wait()
        return []

    monkeypatch.setattr(osm_mod, "query_osm", fake)
    return entered, release


def _offset_payload(west: float) -> dict:
    ring = [[west, 0], [west + 0.1, 0], [west + 0.1, 0.1], [west, 0.1], [west, 0]]
    return _payload(polygon={"type": "Polygon", "coordinates": [ring]})


async def _until(condition, *, turns: int = 200) -> None:
    for _ in range(turns):
        if condition():
            return
        await asyncio.sleep(0.005)
    raise AssertionError("condition never held")


async def test_one_address_holds_one_discovery_at_a_time(monkeypatch):
    # Overpass slots are pod-wide, two per mirror. One address sending
    # distinct polygons inside its bucket could hold all of them and leave
    # every other visitor queueing, so a second discovery from the same
    # address waits for its first while another address goes straight in.
    entered, release = _held_discovery(monkeypatch)
    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:

            def post(address: str, west: float):
                return asyncio.ensure_future(
                    http.post(
                        "/api/destinations",
                        json=_offset_payload(west),
                        headers={"cf-connecting-ip": address},
                    )
                )

            first = post("203.0.113.1", 1.0)
            await _until(lambda: entered == [1.0])
            second = post("203.0.113.1", 2.0)
            other = post("198.51.100.2", 3.0)
            await _until(lambda: 3.0 in entered)
            # Give the second request every chance to get in as well.
            for _ in range(20):
                await asyncio.sleep(0.005)
            assert entered == [1.0, 3.0]

            release.set()
            responses = await asyncio.gather(first, second, other)
    finally:
        release.set()
    assert [r.status_code for r in responses] == [200, 200, 200]
    # The waiting request ran its own discovery once the first one finished.
    assert entered == [1.0, 3.0, 2.0]


async def test_a_discovery_that_waits_too_long_gets_the_existing_429(monkeypatch):
    entered, release = _held_discovery(monkeypatch)
    monkeypatch.setattr(
        ratelimit.client,
        "DESTINATIONS_IN_FLIGHT",
        ratelimit.client.InFlightLimiter(1, name="destinations_in_flight", wait_s=0.05),
    )
    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
            headers = {"cf-connecting-ip": "203.0.113.1"}
            first = asyncio.ensure_future(
                http.post("/api/destinations", json=_offset_payload(1.0), headers=headers)
            )
            await _until(lambda: entered == [1.0])
            second = await http.post(
                "/api/destinations", json=_offset_payload(2.0), headers=headers
            )
            release.set()
            assert (await first).status_code == 200
    finally:
        release.set()
    assert second.status_code == 429
    assert second.headers["retry-after"] == str(ratelimit.SHED_RETRY_AFTER_S)
    assert second.json()["detail"] == "Too many requests from this connection. Try again later."
    assert second.json()["error"] == {"code": "rate_limited", "retryable": True}
    assert entered == [1.0]


# ── Resolving caller-supplied destinations (issue #207) ───────────────────────


def _custom(name: str, lat: float, lon: float, **extra) -> dict:
    return {"name": name, "latitude": lat, "longitude": lon, **extra}


def _stub_enrich(monkeypatch, elevations: dict[str, float | None], complete: bool = True):
    """Resolve by name, so a test says what OSM knows without geometry."""

    async def fake(destinations):
        rows = []
        for d in destinations:
            row = dict(d)
            if row.get("elevation_ft") is None and row["name"] in elevations:
                row["elevation_ft"] = elevations[row["name"]]
                row["osm_id"] = "node/42"
            rows.append(row)
        return rows

    async def fake_reporting(destinations):
        return await fake(destinations), complete

    monkeypatch.setattr(osm_mod, "enrich_custom", fake)
    monkeypatch.setattr(osm_mod, "enrich_custom_reporting", fake_reporting)


def test_custom_only_request_resolves_without_discovering(monkeypatch):
    def unreachable(*args, **kwargs):
        raise AssertionError("discovery must not run for a custom-only request")

    monkeypatch.setattr(osm_mod, "query_osm", unreachable)
    _stub_enrich(monkeypatch, {"McClellan Butte": 5165.0})

    resp = client.post(
        "/api/destinations",
        json={
            "destination_types": [],
            "custom_destinations": [_custom("McClellan Butte", 47.406905, -121.622215)],
        },
    )
    assert resp.status_code == 200
    [row] = resp.json()["destinations"]
    assert row["elevation_ft"] == 5165.0
    assert row["type"] == "custom"
    assert row["osm_id"] == "node/42"
    assert resp.json()["elevation_lookup_complete"] is True


def test_the_response_says_when_the_elevation_lookup_gave_up(monkeypatch):
    # #673: a null elevation under a lookup that gave up says nothing about
    # the place, so the browser asks again; under one that finished it is
    # the answer.
    _stub_enrich(monkeypatch, {}, complete=False)
    resp = client.post(
        "/api/destinations",
        json={
            "destination_types": [],
            "custom_destinations": [_custom("Nowhere", 47.0, -121.0)],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["destinations"][0]["elevation_ft"] is None
    assert body["elevation_lookup_complete"] is False


def test_a_list_that_carries_its_elevations_reports_a_complete_lookup(monkeypatch):
    def unreachable(*args, **kwargs):
        raise AssertionError("a row with an elevation is never looked up")

    monkeypatch.setattr(osm_mod.mirrors, "_post_with_fallback", unreachable)
    real = osm_mod.enrich.enrich_custom_reporting
    monkeypatch.setattr(osm_mod, "enrich_custom_reporting", real)
    resp = client.post(
        "/api/destinations",
        json={
            "destination_types": [],
            "custom_destinations": [{**_custom("Known", 47.0, -121.0), "elevation_ft": 5000}],
        },
    )
    assert resp.status_code == 200
    assert resp.json()["elevation_lookup_complete"] is True


# #673: the web app's own analysis has looked its rows up already (from the
# basemap's tiles, then this endpoint), so it asks for no lookup here and the
# call answers from the snow grid alone.
def test_a_request_that_asks_for_no_lookup_never_reaches_the_map_server(monkeypatch):
    def unreachable(*args, **kwargs):
        raise AssertionError("elevation_lookup: false must not ask the map server")

    monkeypatch.setattr(osm_mod, "enrich_custom_reporting", unreachable)
    monkeypatch.setattr(osm_mod, "enrich_custom", unreachable)
    resp = client.post(
        "/api/destinations",
        json={
            "destination_types": [],
            "custom_destinations": [
                {**_custom("Known", 47.0, -121.0), "elevation_ft": 5000},
                _custom("Unknown", 47.1, -121.1),
            ],
            "elevation_lookup": False,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert [d["elevation_ft"] for d in body["destinations"]] == [5000.0, None]
    assert [d["type"] for d in body["destinations"]] == ["custom", "custom"]
    # A row needed a lookup and none was made: the flag says so, the same
    # way it would for a lookup that gave up.
    assert body["elevation_lookup_complete"] is False


def test_a_no_lookup_request_whose_rows_all_carry_elevations_reports_complete(monkeypatch):
    resp = client.post(
        "/api/destinations",
        json={
            "destination_types": [],
            "custom_destinations": [{**_custom("Known", 47.0, -121.0), "elevation_ft": 5000}],
            "elevation_lookup": False,
        },
    )
    assert resp.status_code == 200
    assert resp.json()["elevation_lookup_complete"] is True


async def test_a_no_lookup_request_takes_no_discovery_slot(monkeypatch):
    # The same address holds a discovery open; a request that asks Overpass
    # nothing is answered meanwhile rather than queueing behind it, which is
    # what lets the web app's analysis answer in milliseconds while its own
    # elevation lookup waits on a busy map server.
    entered, release = _held_discovery(monkeypatch)
    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
            headers = {"cf-connecting-ip": "203.0.113.1"}
            first = asyncio.ensure_future(
                http.post("/api/destinations", json=_offset_payload(1.0), headers=headers)
            )
            await _until(lambda: entered == [1.0])
            meanwhile = await asyncio.wait_for(
                http.post(
                    "/api/destinations",
                    json={
                        "destination_types": [],
                        "custom_destinations": [_custom("Unknown", 47.1, -121.1)],
                        "elevation_lookup": False,
                    },
                    headers=headers,
                ),
                timeout=2.0,
            )
            release.set()
            assert (await first).status_code == 200
    finally:
        release.set()
    assert meanwhile.status_code == 200
    assert meanwhile.json()["destinations"][0]["elevation_ft"] is None


async def test_a_lookup_request_waits_for_the_address_s_discovery(monkeypatch):
    # The other way round: a list that asks for a lookup spends the same
    # Overpass slots as a discovery, so it queues behind one.
    entered, release = _held_discovery(monkeypatch)
    _stub_enrich(monkeypatch, {"Unknown": 4000.0})
    transport = httpx.ASGITransport(app=app)
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
            headers = {"cf-connecting-ip": "203.0.113.1"}
            first = asyncio.ensure_future(
                http.post("/api/destinations", json=_offset_payload(1.0), headers=headers)
            )
            await _until(lambda: entered == [1.0])
            second = asyncio.ensure_future(
                http.post(
                    "/api/destinations",
                    json={
                        "destination_types": [],
                        "custom_destinations": [_custom("Unknown", 47.1, -121.1)],
                    },
                    headers=headers,
                )
            )
            for _ in range(20):
                await asyncio.sleep(0.005)
            assert not second.done()
            release.set()
            responses = await asyncio.gather(first, second)
    finally:
        release.set()
    assert [r.status_code for r in responses] == [200, 200]
    assert responses[1].json()["destinations"][0]["elevation_ft"] == 4000.0


# A line pasted twice is one destination: OSM is asked about the point once,
# and one row comes back, under the first line's name (#579).
def test_a_repeated_custom_row_is_looked_up_once(monkeypatch):
    asked: list[list[str]] = []

    async def fake(destinations):
        asked.append([d["name"] for d in destinations])
        return [dict(d) for d in destinations], True

    monkeypatch.setattr(osm_mod, "enrich_custom_reporting", fake)
    resp = client.post(
        "/api/destinations",
        json={
            "destination_types": [],
            "custom_destinations": [
                _custom("First", 47.406905, -121.622215),
                _custom("Again", 47.406905, -121.622215),
            ],
        },
    )
    assert resp.status_code == 200
    assert asked == [["First"]]
    assert [row["name"] for row in resp.json()["destinations"]] == ["First"]


def test_unresolvable_custom_row_comes_back_with_a_null_elevation(monkeypatch):
    _stub_enrich(monkeypatch, {})
    resp = client.post(
        "/api/destinations",
        json={
            "destination_types": [],
            "custom_destinations": [_custom("Chimney Rock", 47.507122, -121.290115)],
        },
    )
    assert resp.status_code == 200
    [row] = resp.json()["destinations"]
    assert row["elevation_ft"] is None


def test_polygon_and_custom_merge_with_the_custom_row_winning(monkeypatch):
    # _peak() stacks every row on one coordinate, which would collide with the
    # custom row indiscriminately; these need distinct positions to show that
    # only the one the caller also claims is the one that drops.
    alpha = {**_peak("Alpha", 1000.0), "latitude": 0.05, "longitude": 0.05}
    beta = {**_peak("Beta", 2000.0), "latitude": 0.06, "longitude": 0.06}
    _stub_osm(monkeypatch, [alpha, beta])
    _stub_enrich(monkeypatch, {"Mine": 7000.0})
    resp = client.post(
        "/api/destinations",
        json=_payload(custom_destinations=[_custom("Mine", 0.05, 0.05)]),
    )
    assert resp.status_code == 200
    rows = resp.json()["destinations"]
    assert [r["name"] for r in rows] == ["Beta", "Mine"]
    assert [r["type"] for r in rows] == ["peak", "custom"]


def test_resolved_elevation_lets_the_band_filter_custom_rows(monkeypatch):
    # The whole point of #207: before resolution these rows were unknown, so
    # the band waved every one of them through.
    _stub_enrich(monkeypatch, {"High": 9000.0, "Low": 4000.0})
    resp = client.post(
        "/api/destinations",
        json={
            "destination_types": [],
            "custom_destinations": [
                _custom("High", 47.0, -121.0),
                _custom("Low", 47.1, -121.1),
            ],
            "min_elevation_ft": 8000,
        },
    )
    assert resp.status_code == 200
    assert [r["name"] for r in resp.json()["destinations"]] == ["High"]


def test_a_row_that_stays_unknown_still_passes_the_band(monkeypatch):
    _stub_enrich(monkeypatch, {"Known": 4000.0})
    resp = client.post(
        "/api/destinations",
        json={
            "destination_types": [],
            "custom_destinations": [
                _custom("Known", 47.0, -121.0),
                _custom("Unresolved", 47.1, -121.1),
            ],
            "min_elevation_ft": 8000,
        },
    )
    assert resp.status_code == 200
    assert [r["name"] for r in resp.json()["destinations"]] == ["Unresolved"]


def test_caller_supplied_elevation_is_never_overwritten(monkeypatch):
    _stub_enrich(monkeypatch, {"Mine": 9999.0})
    resp = client.post(
        "/api/destinations",
        json={
            "destination_types": [],
            "custom_destinations": [_custom("Mine", 47.0, -121.0, elevation_ft=1234.0)],
        },
    )
    assert resp.status_code == 200
    assert resp.json()["destinations"][0]["elevation_ft"] == 1234.0


def test_an_oversized_custom_list_is_rejected_at_the_door():
    resp = client.post(
        "/api/destinations",
        json={
            "destination_types": [],
            "custom_destinations": [
                _custom(f"P{i}", 47.0, -121.0) for i in range(MAX_ANALYZE_PEAKS + 1)
            ],
        },
    )
    assert resp.status_code == 422


def test_over_cap_union_speaks_generically(monkeypatch):
    _stub_osm(monkeypatch, [_peak(f"P{i}") for i in range(MAX_ANALYZE_PEAKS + 1)])
    _stub_enrich(monkeypatch, {})
    resp = client.post(
        "/api/destinations",
        json=_payload(custom_destinations=[_custom("Mine", 47.0, -121.0)]),
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    # A union is a mixed set, so its refusal says "destinations"; the prose
    # carries no remedies (TJ, 2026-08-22).
    assert "destinations" in detail
    assert "trim" not in detail.lower()
    assert resp.json()["error"] == {"code": "refusal", "retryable": False}


def test_carries_no_snow_depth(monkeypatch):
    # Snow depth left the API in #678: the pod holds no snow grid, so a row
    # and the response carry nothing about it.
    _stub_osm(monkeypatch, [_peak("Alpha", 5000.0)])
    body = client.post("/api/destinations", json=_payload()).json()
    assert "snow_analysis_date" not in body
    assert "snow_depth_in" not in body["destinations"][0]
