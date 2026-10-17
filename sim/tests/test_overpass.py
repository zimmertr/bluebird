"""Overpass: the pod's discovery and lookup read the sim's answers as the lattice's places."""

from __future__ import annotations

import asyncio

import pytest
from pod_client import route_to_sim

from app import control, lattice, overpass
from app.models import DestinationType, GeoPolygon
from app.services import cache
from app.services.errors import UpstreamError
from app.services.osm import enrich, mirrors
from app.services.osm.query import _build_query, _polygon_to_overpass

SIM_URL = "http://sim/overpass/api/interpreter"

# A ring over the Cascades, lon/lat, closed: a pentagon so the ray cast matters.
RING = [[-121.6, 47.4], [-121.3, 47.42], [-121.25, 47.6], [-121.45, 47.68], [-121.62, 47.55], [-121.6, 47.4]]
POLYGON = GeoPolygon(type="Polygon", coordinates=[RING])
LATLON_RING = [(lat, lon) for lon, lat in RING]


@pytest.fixture(autouse=True)
def _pod(monkeypatch):
    control.reset()
    cache.DISCOVERY_CACHE.clear()
    cache.ENRICH_CACHE.clear()
    mirrors.reset_mirror_health()
    monkeypatch.setattr(mirrors, "OVERPASS_MIRRORS", [mirrors._mirror(SIM_URL)])
    route_to_sim(monkeypatch)
    yield
    control.reset()


def _inside(places):
    return [p for p in places if lattice.point_in_ring(p.lat, p.lon, LATLON_RING)]


def _feet(metres: float) -> float:
    return round(metres * 3.28084, 0)


BOX = (47.39, -121.63, 47.69, -121.24)


def test_discovery_reads_every_kind_as_itself():
    types = [DestinationType.peak, DestinationType.lake, DestinationType.trailhead, DestinationType.crag]
    rows = asyncio.run(mirrors.query_osm(POLYGON, types, include_unnamed_peaks=True))
    got = {(r["type"], r["name"]): r for r in rows}

    named = {
        "peak": _inside(lattice.peaks_in_bbox(*BOX)),
        "lake": _inside(lattice.lakes_in_bbox(*BOX)),
        "trailhead": _inside(lattice.trailheads_in_bbox(*BOX)),
        "crag": _inside(lattice.crags_in_bbox(*BOX)),
    }
    unnamed = _inside(lattice.unnamed_peaks_in_bbox(*BOX))
    assert all(named.values()) and unnamed
    for kind, places in named.items():
        for place in places:
            row = got.pop((kind, place.name))
            assert (row["latitude"], row["longitude"]) == (place.lat, place.lon)
            # Only a summit carries `ele`; the tiles give a lake or a crag none either.
            assert row["elevation_ft"] == (_feet(place.elevation_m) if kind == "peak" else None)
            assert row["osm_id"] == f"{'way' if kind == 'lake' else 'node'}/{place.osm_id}"
    # What is left is the unnamed summits, named for their feet as the pod does.
    assert set(got) == {("peak", f"Peak {round(_feet(p.elevation_m))}") for p in unnamed}


def test_peaks_alone_leave_the_unnamed_out():
    rows = asyncio.run(mirrors.query_osm(POLYGON, [DestinationType.peak]))
    assert {r["name"]: r["elevation_ft"] for r in rows} == {
        p.name: _feet(p.elevation_m) for p in _inside(lattice.peaks_in_bbox(*BOX))
    }


def test_the_lookup_finds_the_summit_under_a_pasted_point():
    summit = lattice.peaks_in_bbox(47.5, -121.5, 47.52, -121.47)[0]
    nowhere = (47.501, -121.4)
    assert lattice.nearest_peak(*nowhere, 150) is None
    rows = [
        {"name": "Pasted", "latitude": summit.lat + 0.0005, "longitude": summit.lon, "elevation_ft": None},
        {"name": "Field", "latitude": nowhere[0], "longitude": nowhere[1], "elevation_ft": None},
    ]
    enriched, complete = asyncio.run(enrich.enrich_custom_reporting(rows))
    assert complete
    assert enriched[0]["elevation_ft"] == _feet(summit.elevation_m)
    assert enriched[0]["osm_id"] == f"node/{summit.osm_id}"
    assert enriched[1]["elevation_ft"] is None and "osm_id" not in enriched[1]


def test_the_forced_count_reaches_the_pod_whole():
    control.current().overpass.candidates = 2500
    rows = asyncio.run(mirrors.query_osm(POLYGON, [DestinationType.peak]))
    assert len(rows) == 2500
    assert {r["type"] for r in rows} == {"peak"}


def test_the_worldwide_question_is_bounded(client):
    query = (
        "[out:json][timeout:60];\n(\n"
        '  node["highway"="trailhead"]["name"];\n'
        '  way["highway"="trailhead"]["name"];\n'
        '  node["sport"="climbing"]["climbing"~"^(crag|area|boulder)$"]["name"];\n'
        ");\nout center;\n"
    )
    r = client.post("/overpass/api/interpreter", data={"data": query})
    elements = r.json()["elements"]
    assert 0 < len(elements) < 5000
    south, west, north, east = overpass.HOME_BOX
    assert all(south <= e["lat"] < north and west <= e["lon"] < east for e in elements)


def test_a_busy_server_is_plain_text_and_fails_the_chain(client):
    client.put("/control", json={"faults": {"overpass": {"status": 504}}})
    query = _build_query([DestinationType.peak], _polygon_to_overpass(POLYGON)).replace("__SERVER_TIMEOUT_S__", "25")
    r = client.post("/overpass/api/interpreter", data={"data": query})
    assert (r.status_code, r.text) == (504, "Gateway Timeout")
    with pytest.raises(UpstreamError):
        asyncio.run(mirrors.query_osm(POLYGON, [DestinationType.peak]))


def test_a_remark_is_a_partial_answer_the_pod_refuses(client):
    put = client.put(
        "/control", json={"faults": {"overpass": {"status": 200, "reason": "runtime error: Query timed out"}}}
    )
    assert put.status_code == 200
    with pytest.raises(UpstreamError):
        asyncio.run(mirrors.query_osm(POLYGON, [DestinationType.peak]))


def test_the_same_query_is_the_same_bytes(client):
    query = _build_query(
        [DestinationType.peak, DestinationType.lake], _polygon_to_overpass(POLYGON), include_unnamed_peaks=True
    ).replace("__SERVER_TIMEOUT_S__", "25")
    first = client.post("/overpass/api/interpreter", data={"data": query}).content
    assert first == client.post("/overpass/api/interpreter", data={"data": query}).content
    assert b'"generator":"bluebird-forecast-sim"' in first


def test_an_unreadable_query_is_a_400(client):
    assert client.post("/overpass/api/interpreter", data={"data": "out;"}).status_code == 400
