from __future__ import annotations

from app import ratelimit
from app.main import app
from app.models import MAX_ANALYZE_PEAKS
from app.services import osm as osm_mod
from app.services.errors import UpstreamError
from fastapi.testclient import TestClient

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
    async def fake(polygon, destination_types, on_status=None):
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
    assert "Nothing to do" in resp.json()["detail"]


def test_over_cap_refuses_with_the_analyze_wording(monkeypatch):
    _stub_osm(monkeypatch, [_peak(f"P{i}") for i in range(MAX_ANALYZE_PEAKS + 1)])
    resp = client.post("/api/destinations", json=_payload())
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "analysis limit" in detail
    assert "smaller polygon" in detail


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


def test_upstream_failure_maps_to_502(monkeypatch):
    _stub_osm(monkeypatch, UpstreamError("Overpass is down"))
    resp = client.post("/api/destinations", json=_payload())
    assert resp.status_code == 502
    assert resp.json()["detail"] == "Overpass is down"


def test_budget_exhaustion_maps_to_503_with_retry_after(monkeypatch):
    _stub_osm(monkeypatch, ratelimit.BudgetExhausted("OpenStreetMap (Overpass)"))
    resp = client.post("/api/destinations", json=_payload())
    assert resp.status_code == 503
    assert resp.headers["retry-after"] == str(ratelimit.SHED_RETRY_AFTER_S)
    assert "capacity" in resp.json()["detail"]


def test_has_its_own_rate_limit_bucket(monkeypatch):
    # Split from the analyze bucket in issue #180: discovery is one cheap map
    # query, and burning the analyze budget on it starved real analyses.
    monkeypatch.setattr(ratelimit, "DESTINATIONS_LIMITER", ratelimit.RateLimiter(60, 1))
    monkeypatch.setattr(ratelimit, "ANALYZE_LIMITER", ratelimit.RateLimiter(60, 1))
    _stub_osm(monkeypatch, [])
    assert client.post("/api/destinations", json=_payload()).status_code == 200
    resp = client.post("/api/destinations", json=_payload())
    assert resp.status_code == 429
    assert resp.headers["retry-after"]
    # The analyze bucket was never touched by either discovery request.
    assert ratelimit.ANALYZE_LIMITER.check("client")[0]


# ── Resolving caller-supplied destinations (issue #207) ───────────────────────


def _custom(name: str, lat: float, lon: float, **extra) -> dict:
    return {"name": name, "latitude": lat, "longitude": lon, **extra}


def _stub_enrich(monkeypatch, elevations: dict[str, float | None]):
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

    monkeypatch.setattr(osm_mod, "enrich_custom", fake)


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


def test_over_cap_union_advises_trimming_the_list_too(monkeypatch):
    _stub_osm(monkeypatch, [_peak(f"P{i}") for i in range(MAX_ANALYZE_PEAKS + 1)])
    _stub_enrich(monkeypatch, {})
    resp = client.post(
        "/api/destinations",
        json=_payload(custom_destinations=[_custom("Mine", 47.0, -121.0)]),
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert "trim the custom list" in detail.lower()
    assert "destinations" in detail
