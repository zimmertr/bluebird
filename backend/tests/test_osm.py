from __future__ import annotations

import asyncio
import dataclasses
import logging
import time

import httpx
import pytest
from conftest import fake_response
from prometheus_client import REGISTRY

from app import ratelimit
from app.models import DestinationType, GeoPolygon, bbox_area_km2
from app.services import osm
from app.services.errors import UpstreamError

POLY = GeoPolygon(
    type="Polygon", coordinates=[[[-121.0, 47.0], [-120.0, 47.0], [-120.0, 48.0], [-121.0, 47.0]]]
)


def test_polygon_to_overpass_orders_lat_lon():
    # GeoJSON is [lon, lat]; Overpass wants "lat lon lat lon ...".
    assert osm._polygon_to_overpass(POLY) == "47.0 -121.0 47.0 -120.0 48.0 -120.0 47.0 -121.0"


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

    async def fake_post(query, on_status=None, **_kwargs):
        return canned

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)
    results = await osm.query_osm(POLY, [DestinationType.peak])

    names = [r["name"] for r in results]
    assert names == ["Peak A", "Lake B"]
    assert results[1]["latitude"] == 47.7  # way center picked up
    assert results[0]["osm_id"] == "node/1"
    assert results[1]["osm_id"] == "way/3"


async def test_query_osm_converts_elevation_meters_to_feet(monkeypatch):
    canned = {"elements": [{"type": "node", "id": 1, "lat": 1.0, "lon": 2.0, "tags": {"name": "X", "ele": "1000"}}]}

    async def fake_post(query, on_status=None, **_kwargs):
        return canned

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)
    results = await osm.query_osm(POLY, [DestinationType.peak])
    # 1000 m * 3.28084 ft/m, rounded to whole feet.
    assert results[0]["elevation_ft"] == 3281.0


async def test_query_osm_bad_elevation_tag_is_ignored(monkeypatch):
    canned = {"elements": [{"type": "node", "id": 1, "lat": 1.0, "lon": 2.0, "tags": {"name": "X", "ele": "high"}}]}

    async def fake_post(query, on_status=None, **_kwargs):
        return canned

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)
    results = await osm.query_osm(POLY, [DestinationType.peak])
    assert results[0]["elevation_ft"] is None


async def test_query_osm_peak_query_includes_volcanoes(monkeypatch):
    # Regression: Cascade volcanoes (Baker, Rainier, ...) are tagged
    # natural=volcano, not natural=peak — the peak query must ask for both.
    captured: dict[str, str] = {}

    async def fake_post(query, on_status=None, **_kwargs):
        captured["query"] = query
        return {"elements": []}

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)
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

    async def fake_post(query, on_status=None, **_kwargs):
        calls.append(query)
        return {"elements": []}

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)
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

    async def fake_post(query, on_status=None, **_kwargs):
        return canned

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)
    results = await osm.query_osm(
        POLY, [DestinationType.peak, DestinationType.lake, DestinationType.trailhead]
    )

    assert [r["type"] for r in results] == ["peak", "peak", "lake", "trailhead"]


async def test_type_order_does_not_change_the_query_or_the_cache_key(monkeypatch):
    # Order carries no meaning, so it must not produce a second query text or
    # a second cache entry for the same question.
    queries = []

    async def fake_post(query, on_status=None, **_kwargs):
        queries.append(query)
        return {"elements": []}

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)
    await osm.query_osm(POLY, [DestinationType.lake, DestinationType.peak])
    # A second ask in the other order is served from the first one's cache.
    await osm.query_osm(POLY, [DestinationType.peak, DestinationType.lake])
    assert len(queries) == 1

    # Duplicates are likewise not a different question.
    await osm.query_osm(POLY, [DestinationType.peak, DestinationType.peak, DestinationType.lake])
    assert len(queries) == 1


async def test_a_polygons_bbox_is_neither_queried_nor_keyed(monkeypatch):
    # RFC 7946 lets a polygon carry a bbox and the API accepts one (#563), but
    # the ring is the whole question: the same ring with any bbox, or none, is
    # one query and one cache entry.
    queries = []

    async def fake_post(query, on_status=None, **_kwargs):
        queries.append(query)
        return {"elements": []}

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)
    await osm.query_osm(POLY, [DestinationType.peak])
    boxed = GeoPolygon(**POLY.model_dump(exclude={"bbox"}), bbox=[-180, -90, 180, 90])
    await osm.query_osm(boxed, [DestinationType.peak])
    assert len(queries) == 1


async def test_a_positions_altitude_is_neither_queried_nor_keyed(monkeypatch):
    # RFC 7946 lets a position carry an altitude and the API accepts one, the
    # way it accepts a bbox (#564). The model drops it, so the same ring with
    # an altitude is the same area, the same query and one cache entry.
    queries = []

    async def fake_post(query, on_status=None, **_kwargs):
        queries.append(query)
        return {"elements": []}

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)
    raised = GeoPolygon(
        type="Polygon", coordinates=[[[*p, 1234.5] for p in POLY.coordinates[0]]]
    )
    assert raised.coordinates == POLY.coordinates
    assert bbox_area_km2(raised.coordinates[0]) == bbox_area_km2(POLY.coordinates[0])
    assert osm._polygon_to_overpass(raised) == osm._polygon_to_overpass(POLY)
    await osm.query_osm(POLY, [DestinationType.peak])
    await osm.query_osm(raised, [DestinationType.peak])
    assert len(queries) == 1


async def test_no_types_asks_nothing(monkeypatch):
    async def fake_post(query, on_status=None, **_kwargs):
        raise AssertionError("no types requested, so Overpass must not be called")

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)
    assert await osm.query_osm(POLY, []) == []


# ── _post_with_fallback (the mirror failover chain) ────────────────────────


class _FakeClient:
    """Async-context httpx stand-in that replays a scripted list of behaviors,
    one per .post() call (an Exception is raised, a coroutine function is
    awaited for its answer, anything else is returned). Records the url,
    timeout and body of every attempt for per-mirror assertions."""

    def __init__(self, behaviors):
        self._behaviors = behaviors
        self.calls = 0
        self.urls: list[str] = []
        self.timeouts: list[float | None] = []
        self.bodies: list[str] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, data=None, timeout=None):
        behavior = self._behaviors[self.calls]
        self.calls += 1
        self.urls.append(url)
        self.timeouts.append(timeout)
        self.bodies.append(data["data"])
        if isinstance(behavior, Exception):
            raise behavior
        if callable(behavior):
            return await behavior()
        return behavior


def test_mirror_order_and_timeouts_match_measurements():
    # Guard for issue #545 (measured 2026-09-30, 30 days of #77 telemetry):
    # overpass-api.de 40 of 62 ok, its 504s after 8-16s; mail.ru 7 of 11 ok,
    # most under 15s; kumi 0 of 8, so it is gone. Reordering or retuning this
    # table should come with fresh measurements in hand — update the dated
    # comment in osm/mirrors.py alongside this test.
    assert [m.url for m in osm.OVERPASS_MIRRORS] == [
        "https://overpass-api.de/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    ]
    assert [m.timeout_s for m in osm.OVERPASS_MIRRORS] == [25.0, 25.0]
    # The worst case an analysis can wait on the chain; it was 115s with kumi.
    assert sum(m.timeout_s for m in osm.OVERPASS_MIRRORS) == 50.0
    # Separate operators get separate budgets, not one shared pool.
    assert len({id(m.budget) for m in osm.OVERPASS_MIRRORS}) == len(osm.OVERPASS_MIRRORS)


async def test_post_with_fallback_recovers_on_second_endpoint(monkeypatch):
    statuses: list[str] = []

    async def on_status(msg):
        statuses.append(msg)

    fake = _FakeClient([httpx.ConnectError("down"), fake_response({"elements": []})])
    monkeypatch.setattr(osm.mirrors.httpx, "AsyncClient", lambda *a, **k: fake)

    result = await osm._post_with_fallback("q", on_status)
    assert result == {"elements": []}
    assert fake.calls == 2
    # The healthy first attempt is silent; only failover gets narrated.
    assert statuses == ["Trying backup map server 2 of 2…"]


async def test_post_with_fallback_all_endpoints_fail(monkeypatch):
    fake = _FakeClient([httpx.ConnectError("a"), httpx.ConnectError("b")])
    monkeypatch.setattr(osm.mirrors.httpx, "AsyncClient", lambda *a, **k: fake)

    with pytest.raises(UpstreamError):
        await osm._post_with_fallback("q")
    assert fake.calls == len(osm.OVERPASS_MIRRORS)
    # Each attempt carries its own mirror's leash, not one shared client value.
    assert fake.timeouts == [m.timeout_s for m in osm.OVERPASS_MIRRORS]


async def test_a_mirror_that_answers_past_its_deadline_fails_over(monkeypatch):
    # Issue #630: httpx's timeout is per operation and its read timer restarts
    # on every chunk, so a mirror that trickles its answer held a slot for as
    # long as it liked. Each attempt now has the mirror's timeout as a total,
    # which is what makes the sum above a worst case rather than a hope.
    mirrors = [dataclasses.replace(m, timeout_s=0.05) for m in osm.OVERPASS_MIRRORS]
    monkeypatch.setattr(osm.mirrors, "OVERPASS_MIRRORS", mirrors)

    async def trickle():
        await asyncio.sleep(1)
        return fake_response({"elements": [{"slow": True}]})

    fake = _FakeClient([trickle, fake_response({"elements": []})])
    monkeypatch.setattr(osm.mirrors.httpx, "AsyncClient", lambda *a, **k: fake)

    assert await osm._post_with_fallback("q") == {"elements": []}
    assert fake.calls == 2


async def test_post_with_fallback_skips_saturated_mirror(monkeypatch):
    # Mirror 1's pod-wide budget is fully occupied: the chain must move to the
    # next operator (its own capacity) instead of shedding the analysis.
    saturated = ratelimit.UpstreamBudget("test (saturated)", 1, wait_s=0.01)
    await saturated._sem.acquire()
    mirrors = [
        dataclasses.replace(osm.OVERPASS_MIRRORS[0], budget=saturated),
        *osm.OVERPASS_MIRRORS[1:],
    ]
    monkeypatch.setattr(osm.mirrors, "OVERPASS_MIRRORS", mirrors)

    statuses: list[str] = []

    async def on_status(msg):
        statuses.append(msg)

    fake = _FakeClient([fake_response({"elements": []})])
    monkeypatch.setattr(osm.mirrors.httpx, "AsyncClient", lambda *a, **k: fake)

    result = await osm._post_with_fallback("q", on_status)
    assert result == {"elements": []}
    # The saturated mirror never fired an HTTP request.
    assert fake.urls == [mirrors[1].url]
    assert statuses == ["Trying backup map server 2 of 2…"]


async def test_post_with_fallback_all_mirrors_saturated_raises(monkeypatch):
    # Saturation of the FINAL mirror is terminal and keeps its BudgetExhausted
    # type, so the routes' existing 503 + Retry-After mapping still applies.
    mirrors = []
    for m in osm.OVERPASS_MIRRORS:
        budget = ratelimit.UpstreamBudget("test (saturated)", 1, wait_s=0.01)
        await budget._sem.acquire()
        mirrors.append(dataclasses.replace(m, budget=budget))
    monkeypatch.setattr(osm.mirrors, "OVERPASS_MIRRORS", mirrors)

    fake = _FakeClient([])
    monkeypatch.setattr(osm.mirrors.httpx, "AsyncClient", lambda *a, **k: fake)

    with pytest.raises(ratelimit.BudgetExhausted):
        await osm._post_with_fallback("q")
    assert fake.calls == 0


async def test_post_with_fallback_rejects_partial_remark(monkeypatch):
    # A mirror that times out mid-query returns 200 with PARTIAL elements plus
    # a `remark` — that must count as a mirror failure, not a result, or a
    # truncated candidate list gets ranked as if it were complete.
    partial = fake_response({"remark": "runtime error: Query timed out in 'query'", "elements": [{"type": "node"}]})
    clean = fake_response({"elements": []})
    fake = _FakeClient([partial, clean])
    monkeypatch.setattr(osm.mirrors.httpx, "AsyncClient", lambda *a, **k: fake)

    result = await osm._post_with_fallback("q")
    assert result == {"elements": []}
    assert fake.calls == 2


async def test_post_with_fallback_all_partial_raises(monkeypatch):
    partial = {"remark": "runtime error: Query timed out", "elements": []}
    fake = _FakeClient([fake_response(partial), fake_response(partial)])
    monkeypatch.setattr(osm.mirrors.httpx, "AsyncClient", lambda *a, **k: fake)

    with pytest.raises(UpstreamError) as excinfo:
        await osm._post_with_fallback("q")
    assert fake.calls == len(osm.OVERPASS_MIRRORS)
    # The user should be told the query was too demanding, not shown a raw
    # "failed unexpectedly" fallback string.
    assert "partial results" in excinfo.value.message


# ── The server timeout travels with the attempt (#545) ────────────────────
# Overpass keeps a query's slot busy until ITS timeout, so a server timeout
# longer than the pod's leash held one of the address's two slots for a query
# nobody was waiting on any more.


async def test_each_attempt_asks_the_server_for_its_own_timeout(monkeypatch):
    # Two different leashes, so the test can tell one mirror's number from the
    # other's; the real table gives both 25s.
    mirrors = [
        dataclasses.replace(osm.OVERPASS_MIRRORS[0], timeout_s=25.0),
        dataclasses.replace(osm.OVERPASS_MIRRORS[1], timeout_s=13.0),
    ]
    monkeypatch.setattr(osm.mirrors, "OVERPASS_MIRRORS", mirrors)
    fake = _FakeClient([httpx.ConnectError("down"), fake_response({"elements": []})])
    monkeypatch.setattr(osm.mirrors.httpx, "AsyncClient", lambda *a, **k: fake)

    await osm._post_with_fallback(osm._build_query([DestinationType.peak], "1 2 3 4"))

    assert [b.splitlines()[0] for b in fake.bodies] == [
        "[out:json][timeout:25];",
        "[out:json][timeout:13];",
    ]
    assert fake.timeouts == [25.0, 13.0]
    assert not any(osm.SERVER_TIMEOUT_TOKEN in b for b in fake.bodies)


async def test_neither_query_spells_a_server_timeout_of_its_own(monkeypatch):
    # Both builders leave the number to the mirror; a literal here would be
    # the [timeout:60] that outlived the pod's 25s leash.
    discovery = osm._build_query([DestinationType.peak], "1 2 3 4")
    assert discovery.startswith(f"[out:json][timeout:{osm.SERVER_TIMEOUT_TOKEN}];")

    spy: list = []
    _stub_overpass(monkeypatch, [], spy)
    await _enrich_custom([_row(47.0, -121.0)])
    [enrichment] = spy
    assert enrichment.startswith(f"[out:json][timeout:{osm.SERVER_TIMEOUT_TOKEN}];")


# ── Cooldown: a mirror that just failed is asked last (#545) ──────────────


class _Clock:
    """The chain's monotonic clock, moved by hand."""

    def __init__(self, now: float = 1000.0):
        self.now = now

    def __call__(self) -> float:
        return self.now


PRIMARY = "https://overpass-api.de/api/interpreter"
SECONDARY = "https://maps.mail.ru/osm/tools/overpass/api/interpreter"


def _script(monkeypatch, behaviors) -> _FakeClient:
    fake = _FakeClient(behaviors)
    monkeypatch.setattr(osm.mirrors.httpx, "AsyncClient", lambda *a, **k: fake)
    return fake


def test_the_cooldown_is_the_measured_two_minutes():
    # Bursts of "too busy" on 2026-09-30 lasted tens of minutes with successes
    # between them; the note in osm/mirrors.py says why two minutes fits.
    assert osm.MIRROR_COOLDOWN_S == 120.0


async def test_a_failed_mirror_is_asked_last_during_its_cooldown(monkeypatch):
    clock = _Clock()
    monkeypatch.setattr(osm.mirrors, "_clock", clock)

    first = _script(monkeypatch, [httpx.ConnectError("busy"), fake_response({"elements": []})])
    await osm._post_with_fallback("q")
    assert first.urls == [PRIMARY, SECONDARY]

    clock.now += osm.MIRROR_COOLDOWN_S - 1
    second = _script(monkeypatch, [fake_response({"elements": []})])
    await osm._post_with_fallback("q")
    assert second.urls == [SECONDARY]


async def test_a_cooling_mirror_is_still_asked_when_the_rest_fail(monkeypatch):
    # Prefer, never skip: an analysis makes as many attempts as it did before
    # the cooldown existed, so a cooling mirror can still save it.
    clock = _Clock()
    monkeypatch.setattr(osm.mirrors, "_clock", clock)
    _script(monkeypatch, [httpx.ConnectError("busy"), fake_response({"elements": []})])
    await osm._post_with_fallback("q")

    statuses: list[str] = []

    async def on_status(msg):
        statuses.append(msg)

    clock.now += 10
    fake = _script(monkeypatch, [httpx.ConnectError("down"), fake_response({"elements": []})])
    assert await osm._post_with_fallback("q", on_status) == {"elements": []}
    assert fake.urls == [SECONDARY, PRIMARY]
    assert statuses == ["Trying backup map server 2 of 2…"]


async def test_a_mirror_leads_again_once_its_cooldown_ends(monkeypatch):
    clock = _Clock()
    monkeypatch.setattr(osm.mirrors, "_clock", clock)
    _script(monkeypatch, [httpx.ConnectError("busy"), fake_response({"elements": []})])
    await osm._post_with_fallback("q")

    clock.now += osm.MIRROR_COOLDOWN_S
    fake = _script(monkeypatch, [fake_response({"elements": []})])
    await osm._post_with_fallback("q")
    assert fake.urls == [PRIMARY]


async def test_a_success_clears_the_record_and_a_failure_sets_it(monkeypatch):
    clock = _Clock()
    monkeypatch.setattr(osm.mirrors, "_clock", clock)
    _script(monkeypatch, [httpx.ConnectError("busy"), fake_response({"elements": []})])
    await osm._post_with_fallback("q")

    # Now the fallback fails and the cooling primary answers: the primary
    # earns its place back at once and the fallback takes the cooldown.
    clock.now += 10
    _script(monkeypatch, [httpx.ConnectError("down"), fake_response({"elements": []})])
    await osm._post_with_fallback("q")

    clock.now += 10
    fake = _script(monkeypatch, [httpx.ConnectError("busy"), fake_response({"elements": []})])
    await osm._post_with_fallback("q")
    assert fake.urls == [PRIMARY, SECONDARY]
    assert [m.url for m in osm._attempt_order()] == [SECONDARY, PRIMARY]


async def test_a_budget_shed_does_not_cool_the_mirror(monkeypatch):
    # A shed is the pod's own saturation; the mirror was never asked, so it
    # has done nothing to be moved to the back for.
    saturated = ratelimit.UpstreamBudget("test (saturated)", 1, wait_s=0.01)
    await saturated._sem.acquire()
    mirrors = [
        dataclasses.replace(osm.OVERPASS_MIRRORS[0], budget=saturated),
        *osm.OVERPASS_MIRRORS[1:],
    ]
    monkeypatch.setattr(osm.mirrors, "OVERPASS_MIRRORS", mirrors)
    _script(monkeypatch, [fake_response({"elements": []})])

    await osm._post_with_fallback("q")
    assert [m.url for m in osm._attempt_order()] == [PRIMARY, SECONDARY]


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
    async def fake_post(query, on_status=None, **_kwargs):
        if spy is not None:
            spy.append(query)
        return {"elements": elements}

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)


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
    async def boom(query, on_status=None, **_kwargs):
        raise UpstreamError("Every Overpass mirror failed")

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", boom)
    [row] = await _enrich_custom([_row(47.0, -121.0)])
    assert row["elevation_ft"] is None
    assert row["name"] == "Row"


async def test_enrich_custom_degrades_rather_than_raising_on_budget_exhaustion(monkeypatch):
    # Enrichment must never turn a saturated Overpass budget into a 503 for an
    # analysis that only wanted forecasts.
    async def saturated(query, on_status=None, **_kwargs):
        raise ratelimit.BudgetExhausted("OpenStreetMap (Overpass)")

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", saturated)
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


def test_enrich_deadline_is_the_measured_eight_seconds():
    # Half the primary's healthy answers land under 5s and its "too busy"
    # arrives after 8-16s (2026-09-30), which is where the note in
    # osm/enrich.py puts the line. Re-measure before changing.
    assert osm.ENRICH_DEADLINE_S == 8.0


def _count(name: str, **labels: str) -> float:
    value = REGISTRY.get_sample_value(name, labels)
    return 0.0 if value is None else value


_REQUESTS = "bluebird_forecast_overpass_requests_total"
_FALLBACK = "bluebird_forecast_overpass_fallback_total"
_DURATIONS = "bluebird_forecast_overpass_request_duration_seconds_count"
PRIMARY_HOST = "overpass-api.de"
SECONDARY_HOST = "maps.mail.ru"


async def _stall():
    await asyncio.sleep(30)


async def test_enrich_custom_goes_on_without_a_lookup_that_misses_its_deadline(
    monkeypatch, caplog
):
    # Through the real chain, so the cancellation is proven to release the
    # mirror's slot rather than just to reach enrich_custom. Both mirrors
    # stall: the primary runs out its own slice and the deadline cuts the
    # backup's, which is the busy spell #655 measured.
    budget = ratelimit.UpstreamBudget("test (enrich deadline)", 1)
    mirrors = [dataclasses.replace(m, budget=budget) for m in osm.OVERPASS_MIRRORS]
    monkeypatch.setattr(osm.mirrors, "OVERPASS_MIRRORS", mirrors)
    monkeypatch.setattr(osm.enrich, "ENRICH_DEADLINE_S", 0.05)

    fake = _script(monkeypatch, [_stall, _stall])
    outcomes = ("error", "timeout", "success")
    primary_before = {
        o: _count(_REQUESTS, mirror=PRIMARY_HOST, outcome=o, path="enrichment") for o in outcomes
    }
    backup_before = {
        o: _count(_REQUESTS, mirror=SECONDARY_HOST, outcome=o, path="enrichment") for o in outcomes
    }

    started = time.perf_counter()
    with caplog.at_level(logging.WARNING, logger="app.services.osm"):
        [row] = await _enrich_custom([_row(47.0, -121.0)])

    assert time.perf_counter() - started < 5
    assert row == _row(47.0, -121.0)
    assert "gave up" in caplog.text
    # The deadline still bounds the whole lookup, but the backup was asked.
    assert fake.calls == 2
    # The cut attempt gave its slot back.
    assert budget._sem._value == budget.capacity
    # The primary's own slice ran out, which is a timeout like any other...
    assert (
        _count(_REQUESTS, mirror=PRIMARY_HOST, outcome="timeout", path="enrichment")
        == primary_before["timeout"] + 1
    )
    # ...and the deadline's cut of the backup is no outcome at all, since
    # "error" would read as the mirror breaking. It still cools the backup.
    for outcome, before in backup_before.items():
        assert _count(_REQUESTS, mirror=SECONDARY_HOST, outcome=outcome, path="enrichment") == before
    assert set(osm.mirrors._last_failure) == {PRIMARY, SECONDARY}


# ── The lookup's deadline is split across the mirrors (#655) ─────────────


async def test_a_stalled_primary_leaves_the_backup_its_slice_of_the_deadline(monkeypatch):
    # On 2026-10-06 a busy primary blanked every 100-row list: the deadline
    # fired inside the first attempt, so the backup was never asked.
    monkeypatch.setattr(osm.enrich, "ENRICH_DEADLINE_S", 0.4)
    rows = [_row(47.0 + i * _FAR_DEG, -121.0, f"P{i}") for i in range(100)]
    nodes = [_node(i + 1, r["latitude"] + _NEAR_DEG, r["longitude"]) for i, r in enumerate(rows)]
    fake = _script(monkeypatch, [_stall, fake_response({"elements": nodes})])

    enriched = await _enrich_custom(rows)

    assert fake.urls == [PRIMARY, SECONDARY]
    # Equal slices of the deadline, one per mirror.
    assert fake.timeouts == [0.2, 0.2]
    assert [r["elevation_ft"] for r in enriched] == [3281.0] * 100


async def test_after_a_busy_lookup_the_next_list_starts_on_the_backup(monkeypatch):
    clock = _Clock()
    monkeypatch.setattr(osm.mirrors, "_clock", clock)
    monkeypatch.setattr(osm.enrich, "ENRICH_DEADLINE_S", 0.4)
    _script(monkeypatch, [_stall, fake_response({"elements": []})])
    await _enrich_custom([_row(47.0, -121.0)])

    clock.now += 10
    fake = _script(monkeypatch, [fake_response({"elements": [_node(1, 46.0, -121.0)]})])
    [row] = await _enrich_custom([_row(46.0, -121.0)])

    assert fake.urls == [SECONDARY]
    assert row["elevation_ft"] == 3281.0


async def test_a_deadline_cut_moves_the_mirror_behind_the_next(monkeypatch):
    # The caller's deadline ended the attempt, but the mirror still did not
    # answer in the time it had, so the next call should not wait on it first.
    _script(monkeypatch, [_stall])
    with pytest.raises(TimeoutError):
        async with asyncio.timeout(0.05):
            await osm._post_with_fallback("q")
    assert [m.url for m in osm._attempt_order()] == [SECONDARY, PRIMARY]


async def test_a_cut_while_queued_for_a_slot_does_not_cool_the_mirror(monkeypatch):
    # Waiting on the pod's own budget asks the mirror nothing, the same as a
    # shed, so a cut there is no news about the mirror.
    held = ratelimit.UpstreamBudget("test (held)", 1, wait_s=30)
    await held._sem.acquire()
    mirrors = [
        dataclasses.replace(osm.OVERPASS_MIRRORS[0], budget=held),
        *osm.OVERPASS_MIRRORS[1:],
    ]
    monkeypatch.setattr(osm.mirrors, "OVERPASS_MIRRORS", mirrors)
    fake = _script(monkeypatch, [])
    with pytest.raises(TimeoutError):
        async with asyncio.timeout(0.05):
            await osm._post_with_fallback("q")
    held._sem.release()
    assert fake.calls == 0
    assert [m.url for m in osm._attempt_order()] == [PRIMARY, SECONDARY]


async def test_the_enrichment_query_asks_each_server_for_its_slice(monkeypatch):
    # The server stops working when the pod stops waiting, as on discovery.
    fake = _script(monkeypatch, [httpx.ConnectError("down"), fake_response({"elements": []})])
    await _enrich_custom([_row(47.0, -121.0)])
    assert [b.splitlines()[0] for b in fake.bodies] == ["[out:json][timeout:4];"] * 2
    assert fake.timeouts == [4.0, 4.0]


async def test_discovery_keeps_the_mirror_table_timeouts(monkeypatch):
    fake = _script(monkeypatch, [httpx.ConnectError("down"), fake_response({"elements": []})])
    await osm.query_osm(POLY, [DestinationType.peak])
    assert [b.splitlines()[0] for b in fake.bodies] == ["[out:json][timeout:25];"] * 2
    assert fake.timeouts == [25.0, 25.0]


async def test_the_overpass_metrics_say_which_path_asked(monkeypatch):
    # The enrichment query and a polygon's discovery query are different
    # questions with different latencies, and the slices are retuned from the
    # enrichment path's numbers alone.
    def counts(path: str) -> tuple[float, float, float, float]:
        return (
            _count(_REQUESTS, mirror=PRIMARY_HOST, outcome="network_error", path=path),
            _count(_REQUESTS, mirror=SECONDARY_HOST, outcome="success", path=path),
            _count(_FALLBACK, mirror=PRIMARY_HOST, path=path),
            _count(_DURATIONS, mirror=SECONDARY_HOST, path=path),
        )

    before = {path: counts(path) for path in ("enrichment", "discovery")}

    _script(monkeypatch, [httpx.ConnectError("down"), fake_response({"elements": []})])
    await _enrich_custom([_row(47.0, -121.0)])
    osm.reset_mirror_health()
    _script(monkeypatch, [httpx.ConnectError("down"), fake_response({"elements": []})])
    await osm.query_osm(POLY, [DestinationType.peak])

    for path, was in before.items():
        assert counts(path) == tuple(n + 1 for n in was), path


def test_custom_match_radius_is_the_measured_150_m():
    # 150 m is a measurement, not a round number someone liked: 97/100 of the
    # bundled Smoot list matched at it, 50 m lost four more, 300 m reached
    # further for one. The note in osm/enrich.py says re-measure before changing —
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


# ── Unnamed summits (opt-in) ───────────────────────────────────────────────
# OSM knows plenty of peaks only by their height. Including them roughly
# triples the candidate count, which is why it is a flag and not the default.


def _unnamed(id_: int, ele: str, lat: float = 47.5):
    return {
        "type": "node",
        "id": id_,
        "lat": lat,
        "lon": -121.5,
        "tags": {"natural": "peak", "ele": ele},
    }


async def test_unnamed_peaks_are_skipped_unless_asked_for(monkeypatch):
    async def fake_post(query, on_status=None, **_kwargs):
        assert '["ele"]' not in query
        return {"elements": [_unnamed(1, "1000")]}

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)
    assert await osm.query_osm(POLY, [DestinationType.peak]) == []


async def test_unnamed_peaks_are_named_for_their_height(monkeypatch):
    async def fake_post(query, on_status=None, **_kwargs):
        assert '["ele"]' in query
        return {"elements": [_unnamed(1, "1817.2")]}

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)
    rows = await osm.query_osm(POLY, [DestinationType.peak], include_unnamed_peaks=True)

    # 1817.2 m is 5,962 ft. Unpunctuated: an identifier, not a measurement, and
    # the same string the browser builds for a clicked one.
    assert [r["name"] for r in rows] == ["Peak 5962"]
    assert rows[0]["type"] == "peak"


async def test_two_unnamed_peaks_at_one_height_are_two_destinations(monkeypatch):
    # Name is the identity rule for mapped features and cannot be for generated
    # ones: every unnamed 5,961 ft summit in a range would collapse into one.
    async def fake_post(query, on_status=None, **_kwargs):
        return {"elements": [_unnamed(1, "1000", 47.5), _unnamed(2, "1000", 47.6)]}

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)
    rows = await osm.query_osm(POLY, [DestinationType.peak], include_unnamed_peaks=True)

    assert len(rows) == 2
    assert {r["osm_id"] for r in rows} == {"node/1", "node/2"}


async def test_an_unnamed_peak_with_no_height_has_nothing_to_be_called(monkeypatch):
    async def fake_post(query, on_status=None, **_kwargs):
        return {"elements": [{"type": "node", "id": 9, "lat": 47.5, "lon": -121.5, "tags": {"natural": "peak"}}]}

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)
    assert await osm.query_osm(POLY, [DestinationType.peak], include_unnamed_peaks=True) == []


async def test_the_two_questions_do_not_share_a_cache_entry(monkeypatch):
    queries = []

    async def fake_post(query, on_status=None, **_kwargs):
        queries.append(query)
        return {"elements": []}

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)
    await osm.query_osm(POLY, [DestinationType.peak])
    await osm.query_osm(POLY, [DestinationType.peak], include_unnamed_peaks=True)
    assert len(queries) == 2


async def test_the_flag_is_ignored_when_peaks_were_not_asked_for(monkeypatch):
    async def fake_post(query, on_status=None, **_kwargs):
        assert "natural" not in query or '"peak"' not in query
        return {"elements": []}

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", fake_post)
    await osm.query_osm(POLY, [DestinationType.lake], include_unnamed_peaks=True)
