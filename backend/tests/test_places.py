"""The places table's readers (#760): ring search, the pasted-coordinate lookup and the map's markers.

Each reader answers from the table once a fill has completed and returns None
otherwise, which sends its caller down the live Overpass path. The tests that
need no database pin that fallback; the rest run under `make test-backend-db`.
"""

from __future__ import annotations

import httpx
import pytest

from app import db
from app.main import app
from app.models import DestinationType, GeoPolygon
from app.services import candidates, osm, places

RING = GeoPolygon(
    type="Polygon",
    coordinates=[[[-121.6, 47.4], [-121.4, 47.4], [-121.4, 47.6], [-121.6, 47.6], [-121.6, 47.4]]],
)


@pytest.fixture(autouse=True)
def _forget_fill_state():
    places._forget()
    yield
    places._forget()


# --- With no database --------------------------------------------------------


async def test_without_a_database_every_reader_steps_aside():
    assert not db.available()
    assert await places.discover(RING, [DestinationType.peak]) is None
    assert await places.summits_near([{"latitude": 47.5, "longitude": -121.5}], 300.0) is None
    assert await places.landmarks((-121.6, 47.4, -121.4, 47.6)) is None


async def test_an_unimplemented_type_is_refused_on_either_path():
    with pytest.raises(NotImplementedError):
        await places.discover(RING, [DestinationType.custom])


async def test_discovery_asks_overpass_while_the_table_cannot_answer(monkeypatch):
    calls = []

    async def fake_query(polygon, types, on_status=None, **kwargs):
        calls.append(types)
        return [{"name": "Live", "type": "peak", "latitude": 47.5, "longitude": -121.5,
                 "elevation_ft": None, "osm_id": "node/1"}]

    monkeypatch.setattr(osm, "query_osm", fake_query)
    rows = await candidates.discover(RING, [DestinationType.peak])
    assert [r["name"] for r in rows] == ["Live"]
    assert len(calls) == 1


async def test_the_markers_answer_503_without_a_database():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/landmarks", params={"bbox": "-121.6,47.4,-121.4,47.6"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "snapshot_unavailable"
    assert response.headers["Retry-After"] == "300"


async def test_a_malformed_box_is_a_422():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/landmarks", params={"bbox": "1,2,3"})
    assert response.status_code == 422


# --- With the database -------------------------------------------------------


async def _insert(conn, rows):
    for osm_type, osm_id, kind, name, ele, rank, lon, lat in rows:
        await conn.execute(
            "INSERT INTO places (osm_type, osm_id, kind, name, ele_ft, rank, geom)"
            " VALUES (%s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))",
            (osm_type, osm_id, kind, name, ele, rank, lon, lat),
        )


async def _fill(conn, rows):
    await _insert(conn, rows)
    await conn.execute(
        "UPDATE osm_state SET filled_at = now(), rules_version = 1, sequence = 100,"
        " updated_at = '2026-10-18T00:00:00Z'"
    )


PLACES = [
    ("node", 1, "peak", "Mount Si", 4167.0, 0, -121.72, 47.49),  # outside the ring
    ("node", 2, "peak", "Mailbox Peak", 4822.0, 0, -121.50, 47.47),
    ("node", 3, "peak", None, 5961.0, 0, -121.45, 47.55),
    ("way", 4, "lake", "Lost Lake", None, 0, -121.55, 47.50),
    ("way", 5, "lake", "Lost Lake", None, 0, -121.55, 47.54),  # 4.4 km away: its own lake
    # The lot and the node beside it: one trailhead, and the node stands for it.
    ("way", 6, "trailhead", "Poo Poo Trailhead", None, 1, -121.48, 47.45),
    ("node", 7, "trailhead", "Poo Poo Trailhead", None, 0, -121.48, 47.4515),
    ("relation", 8, "crag", "Lower Town Wall", None, 0, -121.58, 47.58),
]


@pytest.mark.db
async def test_an_unfilled_table_is_never_read(database):
    async with db.connection() as conn:
        await _insert(conn, PLACES)
    assert not await places.is_filled()
    assert await places.discover(RING, [DestinationType.peak]) is None


@pytest.mark.db
async def test_a_ring_reads_its_kinds_merged_and_in_overpass_order(database):
    async with db.connection() as conn:
        await _fill(conn, PLACES)
    rows = await places.discover(
        RING, [DestinationType.peak, DestinationType.lake, DestinationType.trailhead]
    )
    assert [(r["osm_id"], r["name"], r["type"]) for r in rows] == [
        ("node/2", "Mailbox Peak", "peak"),
        ("node/7", "Poo Poo Trailhead", "trailhead"),
        ("way/4", "Lost Lake", "lake"),
        ("way/5", "Lost Lake", "lake"),
    ]
    assert rows[0] == {
        "name": "Mailbox Peak", "type": "peak", "latitude": 47.47, "longitude": -121.5,
        "elevation_ft": 4822.0, "osm_id": "node/2",
    }


@pytest.mark.db
async def test_unnamed_summits_are_named_for_their_height_when_asked(database):
    async with db.connection() as conn:
        await _fill(conn, PLACES)
    named = await places.discover(RING, [DestinationType.peak])
    both = await places.discover(RING, [DestinationType.peak], include_unnamed_peaks=True)
    assert [r["name"] for r in named] == ["Mailbox Peak"]
    assert [r["name"] for r in both] == ["Mailbox Peak", "Peak 5961"]


@pytest.mark.db
async def test_a_ring_that_crosses_itself_is_read_rather_than_refused(database):
    async with db.connection() as conn:
        await _fill(conn, PLACES)
    bowtie = GeoPolygon(
        type="Polygon",
        coordinates=[[[-121.6, 47.4], [-121.4, 47.6], [-121.4, 47.4], [-121.6, 47.6], [-121.6, 47.4]]],
    )
    # The two triangles meet at the ring's middle, where Mailbox Peak stands
    # on the single point they share and the lakes stand inside the west one.
    rows = await places.discover(bowtie, [DestinationType.lake])
    assert [r["osm_id"] for r in rows] == ["way/4", "way/5"]


@pytest.mark.db
async def test_discovery_reads_the_table_and_leaves_overpass_alone(database, monkeypatch):
    async def no_overpass(*args, **kwargs):
        raise AssertionError("the table answers once it is filled")

    monkeypatch.setattr(osm, "query_osm", no_overpass)
    async with db.connection() as conn:
        await _fill(conn, PLACES)
    rows = await candidates.discover(RING, [DestinationType.crag])
    assert [r["name"] for r in rows] == ["Lower Town Wall"]


@pytest.mark.db
async def test_a_pasted_point_takes_the_nearest_summit_within_150_m(database, monkeypatch):
    async def no_overpass(*args, **kwargs):
        raise AssertionError("the table answers once it is filled")

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", no_overpass)
    async with db.connection() as conn:
        await _fill(conn, PLACES + [("node", 9, "peak", "Mailbox North", 4700.0, 0, -121.50, 47.4722)])
    rows = [
        # 111 m north of node 2 and 133 m south of node 9: the nearer wins.
        {"name": "A", "latitude": 47.471, "longitude": -121.50, "elevation_ft": None},
        # Nothing within 150 m.
        {"name": "B", "latitude": 47.30, "longitude": -121.30, "elevation_ft": None},
        # A caller's elevation is never overwritten.
        {"name": "C", "latitude": 47.47, "longitude": -121.50, "elevation_ft": 100.0},
    ]
    # The module's own function: conftest stubs the package's for every test.
    enriched, complete = await osm.enrich.enrich_custom_reporting(rows)
    assert complete
    assert (enriched[0]["elevation_ft"], enriched[0]["osm_id"]) == (4822.0, "node/2")
    assert enriched[1]["elevation_ft"] is None and "osm_id" not in enriched[1]
    assert enriched[2]["elevation_ft"] == 100.0


@pytest.mark.db
async def test_the_table_answers_the_name_match_too(database, monkeypatch):
    async def no_overpass(*args, **kwargs):
        raise AssertionError("the table answers once it is filled")

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", no_overpass)
    async with db.connection() as conn:
        await _fill(conn, [("node", 11, "peak", "Buck Mountain", 8528.0, 0, -121.50, 47.4725)])
    # 278 m south of the summit: past the coordinate match, inside the name's.
    rows = [{"name": "Buck Mountain", "latitude": 47.47, "longitude": -121.50, "elevation_ft": None}]
    enriched, complete = await osm.enrich.enrich_custom_reporting(rows)
    assert complete
    assert (enriched[0]["elevation_ft"], enriched[0]["osm_id"]) == (8528.0, "node/11")


@pytest.mark.db
async def test_the_markers_are_merged_over_a_wider_box(database):
    async with db.connection() as conn:
        await _fill(conn, PLACES)
    # The node stands 167 m north of the lot and just outside this box; it
    # still stands for the lot, so the view shows no marker for either.
    answer = await places.landmarks((-121.49, 47.44, -121.47, 47.451))
    assert answer is not None
    _updated, rows = answer
    assert rows == []
    _updated, rows = await places.landmarks((-121.49, 47.44, -121.47, 47.46))
    assert [r["osm_id"] for r in rows] == ["node/7"]


@pytest.mark.db
async def test_the_markers_route_serves_geojson_with_the_update_time(database):
    async with db.connection() as conn:
        await _fill(conn, PLACES)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/landmarks", params={"bbox": "-121.6,47.4,-121.4,47.6"})
    assert response.status_code == 200
    body = response.json()
    assert body["fetched_at"] == 1792281600000  # 2026-10-18T00:00:00Z
    assert [f["properties"] for f in body["features"]] == [
        {"name": "Poo Poo Trailhead", "kind": "trailhead", "osm_id": "node/7", "elevation_ft": None},
        {"name": "Lower Town Wall", "kind": "crag", "osm_id": "relation/8", "elevation_ft": None},
    ]
    assert body["features"][1]["geometry"] == {"type": "Point", "coordinates": [-121.58, 47.58]}


@pytest.mark.db
async def test_a_box_across_the_antimeridian_reads_both_sides(database):
    async with db.connection() as conn:
        await _fill(conn, [
            ("node", 1, "crag", "East", None, 0, 179.9, -16.0),
            ("node", 2, "crag", "West", None, 0, -179.9, -16.0),
            ("node", 3, "crag", "Far", None, 0, 170.0, -16.0),
        ])
    _updated, rows = await places.landmarks((179.5, -16.5, -179.5, -15.5))
    assert sorted(r["name"] for r in rows) == ["East", "West"]
