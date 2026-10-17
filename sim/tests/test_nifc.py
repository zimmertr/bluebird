"""NIFC: the pod's pager and parser take the sim's perimeters at both fidelities."""

from __future__ import annotations

import asyncio
import json

import pytest
from pod_client import route_to_sim

from app import control, nifc
from app.services import nifc as pod_nifc
from app.services.errors import UpstreamRateLimited

SIM_URL = "http://sim/nifc/query"


@pytest.fixture(autouse=True)
def _pod(monkeypatch):
    control.reset()
    monkeypatch.setattr(pod_nifc, "QUERY_URL", SIM_URL)
    yield
    control.reset()


def _params(**extra):
    return {
        "where": pod_nifc.WHERE,
        "outFields": pod_nifc.OUT_FIELDS,
        "returnGeometry": "true",
        "outSR": "4326",
        "geometryPrecision": pod_nifc.GEOMETRY_PRECISION,
        "f": "geojson",
        "orderByFields": "OBJECTID",
        **extra,
    }


def _vertices(fires) -> int:
    return sum(len(json.loads(f.blob)["geometry"]["coordinates"][0]) for f in fires)


def test_the_pods_fetch_pages_through_every_fire(monkeypatch):
    asked = route_to_sim(monkeypatch)
    # A small page so the national set takes several, which is the arithmetic
    # under test: the offset steps by what each page sent.
    monkeypatch.setattr(pod_nifc, "PAGE_SIZE", 70)
    snapshot = asyncio.run(pod_nifc.fetch_snapshot())
    total = len(nifc.fires().features)
    assert 250 < total < 350
    assert len(snapshot.full) == len(snapshot.coarse) == total
    assert len(asked) == 2 * -(-total // 70)
    blobs = [json.loads(f.blob) for f in snapshot.full]
    assert [b["id"] for b in blobs] == list(range(1, total + 1))
    assert _vertices(snapshot.coarse) < _vertices(snapshot.full) / 3
    for fire in blobs:
        props = fire["properties"]
        for field in pod_nifc.OUT_FIELDS.split(","):
            assert props[field] is not None
        assert props["attr_IncidentName"].endswith(" Fire")
        assert props["attr_ModifiedOnDateTime_dt"] > props["attr_FireDiscoveryDateTime"]
        ring = fire["geometry"]["coordinates"][0]
        assert ring[0] == ring[-1] and len(ring) >= 9
    assert all(25 <= f.south and f.north <= 49.5 and -125.5 <= f.west and f.east <= -66.5 for f in snapshot.full)


def test_a_page_reads_through_the_pods_parser(client):
    r = client.get("/nifc/query", params=_params(resultOffset=0, resultRecordCount=100))
    fires, more, count = pod_nifc._parse_page(r.content)
    assert (len(fires), more, count) == (100, True, 100)
    last = len(nifc.fires().features) - 5
    r = client.get("/nifc/query", params=_params(resultOffset=last, resultRecordCount=100))
    assert pod_nifc._parse_page(r.content)[1:] == (False, 5)


def test_a_quota_fault_is_an_error_inside_a_200(client):
    client.put("/control", json={"faults": {"nifc": {"status": 429, "times": 1}}})
    r = client.get("/nifc/query", params=_params())
    assert r.status_code == 200
    assert r.json()["error"]["code"] == 429
    with pytest.raises(UpstreamRateLimited):
        pod_nifc._parse_page(r.content)
    assert client.get("/nifc/query", params=_params()).json()["type"] == "FeatureCollection"


def test_a_field_the_layer_lacks_is_refused(client):
    r = client.get("/nifc/query", params=_params(outFields="OBJECTID,poly_Nonexistent"))
    assert r.status_code == 200 and r.json()["error"]["code"] == 400


def test_the_same_page_is_the_same_bytes(client):
    params = _params(maxAllowableOffset=pod_nifc.COARSE_OFFSET_DEG, resultOffset=0, resultRecordCount=2000)
    assert client.get("/nifc/query", params=params).content == client.get("/nifc/query", params=params).content
