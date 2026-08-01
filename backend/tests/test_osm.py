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
    results = await osm.query_osm(POLY, [DestinationType.peak])

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
    results = await osm.query_osm(POLY, [DestinationType.peak])
    # 1000 m * 3.28084 ft/m, rounded to whole feet.
    assert results[0]["elevation_ft"] == 3281.0


async def test_query_osm_bad_elevation_tag_is_ignored(monkeypatch):
    canned = {"elements": [{"type": "node", "id": 1, "lat": 1.0, "lon": 2.0, "tags": {"name": "X", "ele": "high"}}]}

    async def fake_post(query, on_status=None):
        return canned

    monkeypatch.setattr(osm, "_post_with_fallback", fake_post)
    results = await osm.query_osm(POLY, [DestinationType.peak])
    assert results[0]["elevation_ft"] is None


async def test_query_osm_peak_query_includes_volcanoes(monkeypatch):
    # Regression: Cascade volcanoes (Baker, Rainier, ...) are tagged
    # natural=volcano, not natural=peak — the peak query must ask for both.
    captured: dict[str, str] = {}

    async def fake_post(query, on_status=None):
        captured["query"] = query
        return {"elements": []}

    monkeypatch.setattr(osm, "_post_with_fallback", fake_post)
    await osm.query_osm(POLY, [DestinationType.peak])
    assert 'node["natural"="peak"]["name"]' in captured["query"]
    assert 'node["natural"="volcano"]["name"]' in captured["query"]


async def test_query_osm_unimplemented_type_raises():
    with pytest.raises(NotImplementedError):
        await osm.query_osm(POLY, [DestinationType.custom])


# ── Several types at once ──────────────────────────────────────────────────
# Overpass is donated and this query is the slowest step of an analysis, so
# the point of asking for a set is that it stays ONE request.


async def test_several_types_are_one_query_not_one_each(monkeypatch):
    calls = []

    async def fake_post(query, on_status=None):
        calls.append(query)
        return {"elements": []}

    monkeypatch.setattr(osm, "_post_with_fallback", fake_post)
    await osm.query_osm(POLY, [DestinationType.peak, DestinationType.lake])

    assert len(calls) == 1
    query = calls[0]
    assert 'node["natural"="peak"]["name"]' in query
    assert 'node["natural"="volcano"]["name"]' in query
    assert 'relation["natural"="water"]["water"="lake"]["name"]' in query
    # Trailheads were not asked for and must not ride along.
    assert "trailhead" not in query


async def test_rows_are_classified_by_their_own_tags(monkeypatch):
    # The reason a union needs classification at all: with one type the route
    # could assume the answer, and with three it cannot. A row's type picks its
    # badge and whether it links to Peakbagger.
    canned = {
        "elements": [
            {"type": "node", "id": 1, "lat": 1.0, "lon": 1.0, "tags": {"name": "A", "natural": "peak"}},
            {"type": "node", "id": 2, "lat": 2.0, "lon": 2.0, "tags": {"name": "B", "natural": "volcano"}},
            {"type": "way", "id": 3, "center": {"lat": 3.0, "lon": 3.0},
             "tags": {"name": "C", "natural": "water", "water": "lake"}},
            {"type": "node", "id": 4, "lat": 4.0, "lon": 4.0, "tags": {"name": "D", "highway": "trailhead"}},
        ]
    }

    async def fake_post(query, on_status=None):
        return canned

    monkeypatch.setattr(osm, "_post_with_fallback", fake_post)
    results = await osm.query_osm(
        POLY, [DestinationType.peak, DestinationType.lake, DestinationType.trailhead]
    )

    assert [r["type"] for r in results] == ["peak", "peak", "lake", "trailhead"]


async def test_type_order_does_not_change_the_query_or_the_cache_key(monkeypatch):
    # Order carries no meaning, so it must not produce a second query text or
    # a second cache entry for the same question.
    queries = []

    async def fake_post(query, on_status=None):
        queries.append(query)
        return {"elements": []}

    monkeypatch.setattr(osm, "_post_with_fallback", fake_post)
    await osm.query_osm(POLY, [DestinationType.lake, DestinationType.peak])
    # A second ask in the other order is served from the first one's cache.
    await osm.query_osm(POLY, [DestinationType.peak, DestinationType.lake])
    assert len(queries) == 1

    # Duplicates are likewise not a different question.
    await osm.query_osm(POLY, [DestinationType.peak, DestinationType.peak, DestinationType.lake])
    assert len(queries) == 1


async def test_no_types_asks_nothing(monkeypatch):
    async def fake_post(query, on_status=None):
        raise AssertionError("no types requested, so Overpass must not be called")

    monkeypatch.setattr(osm, "_post_with_fallback", fake_post)
    assert await osm.query_osm(POLY, []) == []


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


# ── Custom-destination enrichment (issue #207) ────────────────────────────────

# conftest neutralizes osm.enrich_custom for every test so no route test makes
# a live Overpass call. These tests are the ones that mean to exercise it, so
# they hold the real function, captured at import time before that fixture runs.
_enrich_custom = osm.enrich_custom


# ~110 m and ~1.1 km north of the probe point: inside and outside the match
# radius, using the ~111 km per degree of latitude that holds anywhere.
_NEAR_DEG = 0.001
_FAR_DEG = 0.01


def _row(lat: float, lon: float, name: str = "Row", **extra) -> dict:
    return {
        "name": name,
        "latitude": lat,
        "longitude": lon,
        "elevation_ft": None,
        "osm_id": None,
        "type": "custom",
        **extra,
    }


def _node(node_id: int, lat: float, lon: float, ele: str | None = "1000") -> dict:
    tags: dict = {"name": f"Peak {node_id}"}
    if ele is not None:
        tags["ele"] = ele
    return {"type": "node", "id": node_id, "lat": lat, "lon": lon, "tags": tags}


def _stub_overpass(monkeypatch, elements, spy: list | None = None):
    async def fake_post(query, on_status=None):
        if spy is not None:
            spy.append(query)
        return {"elements": elements}

    monkeypatch.setattr(osm, "_post_with_fallback", fake_post)


async def test_enrich_custom_fills_elevation_and_identity(monkeypatch):
    _stub_overpass(monkeypatch, [_node(1, 47.0 + _NEAR_DEG, -121.0)])
    [row] = await _enrich_custom([_row(47.0, -121.0)])
    assert row["elevation_ft"] == 3281.0  # 1000 m in feet
    assert row["osm_id"] == "node/1"
    # Enrichment resolves; it does not rename. The pasted label is the user's.
    assert row["name"] == "Row"


async def test_enrich_custom_leaves_unmatched_points_alone(monkeypatch):
    _stub_overpass(monkeypatch, [_node(1, 47.0 + _FAR_DEG, -121.0)])
    [row] = await _enrich_custom([_row(47.0, -121.0)])
    assert row["elevation_ft"] is None
    assert row["osm_id"] is None


async def test_enrich_custom_attaches_identity_even_without_an_ele_tag(monkeypatch):
    # A matched peak that OSM has not measured still answers "which peak is
    # this", so the row earns its OSM id while staying honestly elevation-less.
    _stub_overpass(monkeypatch, [_node(7, 47.0, -121.0, ele=None)])
    [row] = await _enrich_custom([_row(47.0, -121.0)])
    assert row["elevation_ft"] is None
    assert row["osm_id"] == "node/7"


async def test_enrich_custom_picks_the_nearest_of_several_in_radius(monkeypatch):
    _stub_overpass(
        monkeypatch,
        [
            _node(1, 47.0 + _NEAR_DEG, -121.0, ele="1000"),
            _node(2, 47.0 + _NEAR_DEG / 4, -121.0, ele="2000"),
        ],
    )
    [row] = await _enrich_custom([_row(47.0, -121.0)])
    assert row["osm_id"] == "node/2"
    assert row["elevation_ft"] == 6562.0


async def test_enrich_custom_never_overwrites_a_known_elevation(monkeypatch):
    spy: list = []
    _stub_overpass(monkeypatch, [_node(1, 47.0, -121.0, ele="1000")], spy)
    [row] = await _enrich_custom([_row(47.0, -121.0, elevation_ft=9999.0)])
    assert row["elevation_ft"] == 9999.0
    # A row that already knows its elevation is not even asked about, so a
    # list of searched places costs no Overpass call at all.
    assert spy == []


async def test_enrich_custom_returns_rows_unchanged_when_overpass_fails(monkeypatch):
    async def boom(query, on_status=None):
        raise UpstreamError("Every Overpass mirror failed")

    monkeypatch.setattr(osm, "_post_with_fallback", boom)
    [row] = await _enrich_custom([_row(47.0, -121.0)])
    assert row["elevation_ft"] is None
    assert row["name"] == "Row"


async def test_enrich_custom_degrades_rather_than_raising_on_budget_exhaustion(monkeypatch):
    # Enrichment must never turn a saturated Overpass budget into a 503 for an
    # analysis that only wanted forecasts.
    async def saturated(query, on_status=None):
        raise ratelimit.BudgetExhausted("OpenStreetMap (Overpass)")

    monkeypatch.setattr(osm, "_post_with_fallback", saturated)
    [row] = await _enrich_custom([_row(47.0, -121.0)])
    assert row["elevation_ft"] is None


async def test_enrich_custom_does_not_mutate_the_rows_it_was_given(monkeypatch):
    _stub_overpass(monkeypatch, [_node(1, 47.0, -121.0)])
    original = _row(47.0, -121.0)
    enriched = await _enrich_custom([original])
    assert original["elevation_ft"] is None
    assert enriched[0]["elevation_ft"] == 3281.0


async def test_enrich_custom_serves_a_repeat_list_from_cache(monkeypatch):
    spy: list = []
    _stub_overpass(monkeypatch, [_node(1, 47.0, -121.0)], spy)
    rows = [_row(47.0, -121.0)]
    await _enrich_custom(rows)
    await _enrich_custom(rows)
    assert len(spy) == 1


async def test_enrich_custom_cache_ignores_the_order_points_arrive_in(monkeypatch):
    spy: list = []
    _stub_overpass(
        monkeypatch, [_node(1, 47.0, -121.0), _node(2, 48.0, -122.0)], spy
    )
    a, b = _row(47.0, -121.0, "A"), _row(48.0, -122.0, "B")
    await _enrich_custom([a, b])
    await _enrich_custom([b, a])
    # The question is "what stands on this set of points", so a reordered
    # paste of the same peaks must not re-buy the answer.
    assert len(spy) == 1


async def test_enrich_custom_queries_peaks_and_volcanoes_within_the_radius(monkeypatch):
    spy: list = []
    _stub_overpass(monkeypatch, [], spy)
    await _enrich_custom([_row(47.123456, -121.654321)])
    [query] = spy
    # The literal, not the interpolated constant. Written the old way this
    # assertion moved with any edit to CUSTOM_MATCH_RADIUS_M, so it could not
    # notice the radius changing at all.
    assert "around:150" in query
    assert "47.123456,-121.654321" in query
    # Volcanoes are unioned in for the same reason discovery does it: OSM tags
    # Rainier and Baker as volcano rather than peak.
    assert "volcano" in query


def test_custom_match_radius_is_the_measured_150_m():
    # 150 m is a measurement, not a round number someone liked: 97/100 of the
    # bundled Smoot list matched at it, 50 m lost four more, 300 m reached
    # further for one. The note in osm.py says re-measure before changing —
    # this is what makes that instruction enforceable.
    assert osm.CUSTOM_MATCH_RADIUS_M == 150.0


async def test_enrich_custom_splits_a_list_too_big_for_one_query(monkeypatch):
    spy: list = []
    _stub_overpass(monkeypatch, [], spy)
    rows = [
        _row(47.0 + i * _FAR_DEG, -121.0, f"P{i}")
        for i in range(osm.CUSTOM_ENRICH_CHUNK + 1)
    ]
    await _enrich_custom(rows)
    assert len(spy) == 2


async def test_enrich_custom_skips_the_lookup_when_nothing_is_missing(monkeypatch):
    spy: list = []
    _stub_overpass(monkeypatch, [], spy)
    rows = await _enrich_custom([_row(47.0, -121.0, elevation_ft=100.0)])
    assert spy == []
    assert rows[0]["elevation_ft"] == 100.0
