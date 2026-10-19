"""The daily update (#760): OpenStreetMap's change files applied to the places table.

Reading a file and placing shapes from Overpass need no database and are
pinned first; applying a file, the waiting shapes and a whole run are db tests.
"""

from __future__ import annotations

import gzip

import httpx
import pytest

from app import db
from app.services import osm, places
from app.services.errors import UpstreamRateLimited
from app.services.places import update


def _tags(tags: dict[str, str]) -> str:
    return "".join(f'<tag k="{k}" v="{v}"/>' for k, v in tags.items())


def node(i, lat, lon, tags=None, version=1):
    return f'<node id="{i}" version="{version}" lat="{lat}" lon="{lon}">{_tags(tags or {})}</node>'


def gone(element, i, version=2):
    return f'<{element} id="{i}" version="{version}"/>'


def way(i, refs, tags, version=1):
    nds = "".join(f'<nd ref="{r}"/>' for r in refs)
    return f'<way id="{i}" version="{version}">{nds}{_tags(tags)}</way>'


def relation(i, members, tags, version=1):
    ms = "".join(f'<member type="{t}" ref="{r}" role=""/>' for t, r in members)
    return f'<relation id="{i}" version="{version}">{ms}{_tags(tags)}</relation>'


def osc(*blocks: tuple[str, list[str]]) -> bytes:
    body = "".join(f"<{action}>{''.join(items)}</{action}>" for action, items in blocks)
    return gzip.compress(
        f'<?xml version="1.0"?><osmChange version="0.6">{body}</osmChange>'.encode()
    )


LAKE = {"natural": "water", "water": "lake", "name": "Snow Lake"}
PEAK = {"natural": "peak", "name": "Chair Peak", "ele": "1945"}


def test_a_day_file_reads_as_drops_rows_and_shapes_to_place():
    data = osc(
        ("create", [
            node(1, 47.45, -121.45, PEAK),
            # A new lake drawn with its points: placed from the file.
            node(10, 47.40, -121.50), node(11, 47.42, -121.46),
            way(20, [10, 11, 10], LAKE),
        ]),
        ("modify", [
            # A summit whose tag went away is dropped and not kept.
            node(2, 47.0, -121.0, {"name": "Former"}, version=3),
            # A lake renamed with no point moved: kept, its place unknown here.
            way(21, [30, 31, 30], {**LAKE, "name": "Gem Lake"}, version=4),
            # A lake one of whose points moved today: its old place is stale.
            node(32, 47.5, -121.5, version=2),
            way(22, [32, 33, 32], LAKE, version=2),
            relation(40, [("w", 50)], {"sport": "climbing", "climbing": "area", "name": "Index"}),
        ]),
        ("delete", [gone("node", 3), gone("way", 23)]),
    )
    changes = update.read_changes(data)

    assert {t: sorted(ids) for t, ids in changes.touched.items()} == {
        "node": [2, 3, 32], "way": [21, 22, 23], "relation": [40],
    }
    assert sorted(changes.placed) == [
        ("node", 1, "peak", "Chair Peak", 6381.0, 0, -121.45, 47.45),
        ("way", 20, "lake", "Snow Lake", None, 0, pytest.approx(-121.48), pytest.approx(47.41)),
    ]
    assert sorted(changes.unplaced) == [
        ("relation", 40, "crag", "Index", None, 0, True),
        ("way", 21, "lake", "Gem Lake", None, 0, False),
        ("way", 22, "lake", "Snow Lake", None, 0, True),
    ]


def test_the_last_version_read_stands():
    data = osc(
        ("create", [node(1, 47.0, -121.0, PEAK, version=1)]),
        ("modify", [node(1, 47.0, -121.0, {"name": "Untagged"}, version=2)]),
        ("create", [node(5, 47.0, -121.0, {"name": "Old"}, version=1)]),
        ("modify", [node(5, 47.1, -121.1, PEAK, version=2)]),
    )
    changes = update.read_changes(data)
    assert [(r[1], r[3], r[7]) for r in changes.placed] == [(5, "Chair Peak", 47.1)]


def test_change_paths_split_the_sequence_into_three_folders():
    from app.services.osm import rules

    assert rules.change_path(4567) == "000/004/567.osc.gz"
    assert rules.change_path(123456789) == "123/456/789.osc.gz"


# --- Shapes from Overpass, with no database -----------------------------------


def _overpass(monkeypatch, *answers):
    """Stub the mirror chain with one answer per query, in order; returns the queries."""
    asked = []
    queue = list(answers)

    async def post(query, on_status=None, *, path="discovery", attempt_timeout_s=None):
        asked.append((query, path))
        answer = queue.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return {"elements": answer}

    monkeypatch.setattr(osm.mirrors, "_post_with_fallback", post)
    return asked


def test_one_query_names_every_waiting_shape_by_id():
    query = update._centres_query([("way", 21), ("relation", 40), ("way", 22)])
    assert "(way(id:21,22);rel(id:40););out tags center;" in query
    assert update._centres_query([("relation", 40)]).count("way(") == 0


async def test_a_shape_stands_at_overpass_centre(monkeypatch):
    asked = _overpass(
        monkeypatch, [{"type": "way", "id": 21, "center": {"lat": 47.1, "lon": -121.2}, "tags": LAKE}]
    )
    rows = await update.place_shapes([("way", 21)])
    assert rows == {("way", 21): ("way", 21, "lake", "Snow Lake", None, 0, -121.2, 47.1)}
    # Counted apart from discovery and the lookup on the Overpass metrics.
    assert [path for _query, path in asked] == ["update"]


async def test_a_shape_overpass_no_longer_has_or_the_rules_no_longer_keep_is_dropped(monkeypatch):
    _overpass(
        monkeypatch,
        [{"type": "way", "id": 21, "center": {"lat": 47.1, "lon": -121.2}, "tags": {"name": "Pond"}}],
    )
    rows = await update.place_shapes([("way", 21), ("way", 23)])
    assert rows == {("way", 21): None, ("way", 23): None}


async def test_an_area_made_only_of_areas_is_placed_over_the_areas_inside(monkeypatch):
    area = {"sport": "climbing", "climbing": "area", "name": "Inner Walls"}
    asked = _overpass(
        monkeypatch,
        # Overpass gives such an area no centre (Inner Walls, checked 2026-10-18).
        [{"type": "relation", "id": 40, "tags": area}],
        [
            {"type": "relation", "id": 40, "members": [
                {"type": "relation", "ref": 41}, {"type": "relation", "ref": 42}]},
            # An area with points of its own stands at them alone, so the
            # area inside it (43, far east) does not widen it.
            {"type": "relation", "id": 41, "members": [{"type": "node", "ref": 1}, {"type": "relation", "ref": 43}],
             "bounds": {"minlat": 47.0, "minlon": -121.2, "maxlat": 47.0, "maxlon": -121.2}},
            {"type": "relation", "id": 42, "members": [{"type": "node", "ref": 2}],
             "bounds": {"minlat": 47.2, "minlon": -121.0, "maxlat": 47.2, "maxlon": -121.0}},
            {"type": "relation", "id": 43, "members": [{"type": "node", "ref": 3}],
             "bounds": {"minlat": 47.1, "minlon": -120.0, "maxlat": 47.1, "maxlon": -120.0}},
        ],
    )
    rows = await update.place_shapes([("relation", 40)])
    row = rows[("relation", 40)]
    assert row is not None
    assert row[:4] == ("relation", 40, "crag", "Inner Walls")
    assert (row[6], row[7]) == (pytest.approx(-121.1), pytest.approx(47.1))
    assert "(rel(id:40);>>;);rel._;out bb;" in asked[1][0]


async def test_an_area_with_nothing_below_it_is_dropped(monkeypatch):
    area = {"sport": "climbing", "climbing": "area", "name": "Empty"}
    _overpass(monkeypatch, [{"type": "relation", "id": 40, "tags": area}], [])
    assert await update.place_shapes([("relation", 40)]) == {("relation", 40): None}


async def test_the_replication_server_refusing_volume_stops_the_run(monkeypatch):
    async def get(url, timeout_s):
        return httpx.Response(429, headers={"Retry-After": "120"}, request=httpx.Request("GET", url))

    monkeypatch.setattr(update.http, "client", lambda: _Client(get))
    with pytest.raises(UpstreamRateLimited) as exc:
        await update._get(f"{update.REPLICATION_URL}/state.txt", 60.0)
    assert exc.value.retry_after_s == 120


class _Client:
    def __init__(self, get):
        self._get = get

    async def get(self, url, headers=None, timeout=None, follow_redirects=False):
        return await self._get(url, timeout)


# --- Applying a day, with the database ---------------------------------------


async def _filled(conn, sequence=100):
    await conn.execute(
        "INSERT INTO places (osm_type, osm_id, kind, name, ele_ft, rank, geom) VALUES"
        " ('way', 21, 'lake', 'Snow Lake', NULL, 0, ST_SetSRID(ST_MakePoint(-121.3, 47.3), 4326)),"
        " ('way', 22, 'lake', 'Snow Lake', NULL, 0, ST_SetSRID(ST_MakePoint(-121.6, 47.6), 4326)),"
        " ('node', 2, 'peak', 'Former', NULL, 0, ST_SetSRID(ST_MakePoint(-121.0, 47.0), 4326)),"
        " ('node', 3, 'peak', 'Deleted', NULL, 0, ST_SetSRID(ST_MakePoint(-121.0, 47.0), 4326))"
    )
    await conn.execute("UPDATE osm_state SET filled_at = now(), rules_version = 1, sequence = %s", (sequence,))


async def _table(conn):
    rows = await (
        await conn.execute(
            "SELECT osm_type, osm_id, name, round(ST_X(geom)::numeric, 3)::float,"
            " round(ST_Y(geom)::numeric, 3)::float FROM places ORDER BY osm_type, osm_id"
        )
    ).fetchall()
    pending = await (
        await conn.execute("SELECT osm_type, osm_id FROM places_pending ORDER BY osm_type, osm_id")
    ).fetchall()
    return [tuple(r) for r in rows], [tuple(p) for p in pending]


@pytest.fixture
def _fresh():
    places._forget()
    yield
    places._forget()


@pytest.mark.db
async def test_a_day_is_applied_in_one_transaction(database, _fresh):
    async with db.connection() as conn:
        await _filled(conn)
    data = osc(
        ("create", [node(1, 47.45, -121.45, PEAK)]),
        ("modify", [
            node(2, 47.0, -121.0, {"name": "Former"}, version=3),
            way(21, [30, 31, 30], {**LAKE, "name": "Gem Lake"}, version=4),
            node(32, 47.5, -121.5, version=2),
            way(22, [32, 33, 32], LAKE, version=2),
            way(24, [34, 35, 34], LAKE),
        ]),
        ("delete", [gone("node", 3)]),
    )
    await update.apply(update.read_changes(data), 101)
    async with db.connection() as conn:
        table, pending = await _table(conn)
        sequence = (await (await conn.execute("SELECT sequence FROM osm_state")).fetchone())[0]
    assert table == [
        ("node", 1, "Chair Peak", -121.45, 47.45),
        # Renamed in place: no point moved, so no API call.
        ("way", 21, "Gem Lake", -121.3, 47.3),
        # A point moved: it stands where it stood until the API places it.
        ("way", 22, "Snow Lake", -121.6, 47.6),
    ]
    assert pending == [("way", 22), ("way", 24)]
    assert sequence == 101


@pytest.mark.db
async def test_a_day_applied_after_a_refill_rolls_back(database, _fresh):
    async with db.connection() as conn:
        await _filled(conn, sequence=200)
    with pytest.raises(RuntimeError):
        await update.apply(update.read_changes(osc(("create", [node(1, 47.0, -121.0, PEAK)]))), 101)
    async with db.connection() as conn:
        table, _pending = await _table(conn)
    assert ("node", 1, "Chair Peak", -121.0, 47.0) not in table


@pytest.mark.db
async def test_waiting_shapes_are_placed_or_dropped(database, _fresh, monkeypatch):
    async with db.connection() as conn:
        await _filled(conn)
        await conn.execute(
            "INSERT INTO places_pending (osm_type, osm_id) VALUES ('way', 22), ('way', 23)"
        )
    _overpass(
        monkeypatch, [{"type": "way", "id": 22, "center": {"lat": 47.1, "lon": -121.2}, "tags": LAKE}]
    )
    placed = await update.place_pending()
    async with db.connection() as conn:
        table, pending = await _table(conn)
    assert placed == 2
    assert ("way", 22, "Snow Lake", -121.2, 47.1) in table
    assert all(r[1] != 23 for r in table if r[0] == "way")
    assert pending == []


@pytest.mark.db
async def test_shapes_wait_out_an_overpass_failure_and_the_run_goes_on(database, _fresh, monkeypatch):
    async with db.connection() as conn:
        await _filled(conn, sequence=102)
        await conn.execute("INSERT INTO places_pending (osm_type, osm_id) VALUES ('way', 22)")
    state = b"#x\nsequenceNumber=102\ntimestamp=2026-10-18T00\\:00\\:00Z\n"

    async def get(url, timeout_s):
        return httpx.Response(200, content=state, request=httpx.Request("GET", url))

    monkeypatch.setattr(update.http, "client", lambda: _Client(get))
    _overpass(monkeypatch, update.UpstreamError("Every Overpass mirror failed"))
    await update.run()
    async with db.connection() as conn:
        table, pending = await _table(conn)
    assert ("way", 22, "Snow Lake", -121.6, 47.6) in table
    assert pending == [("way", 22)]


@pytest.mark.db
async def test_a_run_applies_every_day_since_the_last(database, _fresh, monkeypatch):
    async with db.connection() as conn:
        await _filled(conn, sequence=100)
    files = {
        "state.txt": b"#x\nsequenceNumber=102\ntimestamp=2026-10-18T00\\:00\\:00Z\n",
        "000/000/101.osc.gz": osc(("create", [node(1, 47.0, -121.0, PEAK)])),
        "000/000/102.osc.gz": osc(("delete", [gone("node", 1)])),
    }

    async def get(url, timeout_s):
        path = url.removeprefix(update.REPLICATION_URL + "/")
        return httpx.Response(200, content=files[path], request=httpx.Request("GET", url))

    monkeypatch.setattr(update.http, "client", lambda: _Client(get))
    await update.run()
    async with db.connection() as conn:
        table, _pending = await _table(conn)
        sequence = (await (await conn.execute("SELECT sequence FROM osm_state")).fetchone())[0]
    assert sequence == 102
    assert all(r[1] != 1 for r in table if r[0] == "node")


@pytest.mark.db
async def test_an_unfilled_table_is_not_updated(database, _fresh, monkeypatch):
    async def get(url, timeout_s):
        raise AssertionError("nothing to update before the first fill")

    monkeypatch.setattr(update.http, "client", lambda: _Client(get))
    await update.run()
