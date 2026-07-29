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
    return {"polygon": _POLYGON, "destination_type": "peak", **overrides}


def _peak(name: str, elevation_ft: float | None = None) -> dict:
    return {
        "name": name,
        "latitude": 0.05,
        "longitude": 0.05,
        "elevation_ft": elevation_ft,
        "osm_id": f"node/{abs(hash(name)) % 10_000}",
    }


def _stub_osm(monkeypatch, result):
    async def fake(polygon, destination_type, on_status=None):
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(osm_mod, "query_osm", fake)


def test_returns_discovered_rows_tagged_with_the_request_type(monkeypatch):
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


def test_custom_type_is_a_400(monkeypatch):
    _stub_osm(monkeypatch, [])
    resp = client.post("/api/destinations", json=_payload(destination_type="custom"))
    assert resp.status_code == 400
    assert "nothing to discover" in resp.json()["detail"]


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


def test_missing_polygon_is_a_422():
    resp = client.post("/api/destinations", json={"destination_type": "peak"})
    assert resp.status_code == 422


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
