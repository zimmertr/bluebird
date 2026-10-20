"""Keeping the places table current from OpenStreetMap's daily change files (#760).

OpenStreetMap publishes one change file a day, about 110 MB gzipped, holding
every element created, edited or deleted that day. The planet fill records the
last file its planet already holds (`osm_state.sequence`), and this applies
each later one in turn, one transaction per file, so a failure part way leaves
the table at the last whole day and the next run starts there.

From each file it needs three things: the ids of every element edited or
deleted, any of which the table may hold and must drop; every element the rules
keep, with its newest tags; and the points of the ways among those. Reading
them takes two passes over the file, because a way names its points before
the file is done listing them, and holding every point in a day's edits would
take gigabytes. The file stays in memory, compressed, between the passes: the
pod's root is read-only and has no scratch volume.

A node carries its own point. A way is placed when every point it names is in
the same file, which is how a newly drawn lake arrives. Otherwise the table
keeps where the place stood, and the shape waits in `places_pending` for
Overpass to place it, but only when it can have moved: some of its points
changed today, or the table never held it. Every edited relation waits there,
since its members' points are almost never in the file. A shape the table
holds is not re-placed when only its points move, so a redrawn lake's centre
can lag until someone edits the lake itself.

The waiting shapes go to Overpass by id, all in one query a run, because
OpenStreetMap's own API is for editing the map and its usage policy rules out
read-only use; Overpass is the read-only service that policy points to (the
maintainer, 2026-10-18, over holding a copy of every point on the planet).
Overpass boxes a relation around its own nodes and ways, the rule the fill
follows, so its `out center` is the table's point; an area made only of other
areas has no centre there, and a second query brings the areas inside it.
"""

from __future__ import annotations

import asyncio
import gzip
import io
import logging
import math
import os
import xml.etree.ElementTree as ET
from array import array
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass, field
from typing import Any

import httpx

from app import db, ratelimit
from app.db import refresh
from app.services import http, osm, places
from app.services.errors import UpstreamError, UpstreamRateLimited
from app.services.osm import rules
from app.services.osm.query import SERVER_TIMEOUT_TOKEN

log = logging.getLogger(__name__)

PROVIDER = "OpenStreetMap"

REPLICATION_URL = (
    os.environ.get("REPLICATION_URL", "").strip() or "https://planet.openstreetmap.org/replication/day"
).rstrip("/")

# A day file is published once a day at an hour nobody promises, so the update
# looks every hour and is at most an hour behind it.
INTERVAL_S = 3600.0
# The whole run, after which the refresh counts it failed and lets the lock go.
DEADLINE_S = 1800.0
# No new day file is started after this much of a run, so one that starts
# finishes inside the deadline: a file takes a few minutes, and a pod that was
# down for a week catches up over a few runs.
FILES_BUDGET_S = 900.0
# One day file's download. 110 MB at the 10 MB/s a slow mirror manages.
DOWNLOAD_TIMEOUT_S = 300.0
# Shapes asked of Overpass in one query, oldest first. Day file 5149 left
# 1,147 shapes that could have moved (2026-10-17), so a day fits one query and
# a backlog drains a query a run.
PENDING_PER_QUERY = 2_000

_COPY_CHUNK = 100_000


@dataclass
class Changes:
    """What one day file means for the places table."""

    # Every element edited or deleted that day, by type: the table drops any
    # it holds before the kept ones go back in.
    touched: dict[str, array] = field(
        default_factory=lambda: {t: array("q") for t in ("node", "way", "relation")}
    )
    placed: list[rules.Row] = field(default_factory=list)
    # (osm_type, osm_id, kind, name, ele_ft, rank, moved): kept but not placed
    # from the file. `moved` is True when its old place may be wrong.
    unplaced: list[tuple[str, int, str, str | None, float | None, int, bool]] = field(
        default_factory=list
    )


def _elements(data: bytes) -> Iterator[tuple[str, ET.Element]]:
    """(action, element) for every node, way and relation in a gzipped osmChange.

    Each element is cleared once read, with its block, so memory stays flat
    however many millions a day holds.
    """
    with gzip.GzipFile(fileobj=io.BytesIO(data)) as stream:
        action = ""
        block: ET.Element | None = None
        for event, elem in ET.iterparse(stream, events=("start", "end")):
            tag = elem.tag
            if event == "start":
                if tag in ("create", "modify", "delete"):
                    action, block = tag, elem
                continue
            if tag in ("node", "way", "relation") and block is not None:
                yield action, elem
                block.clear()
            elif tag in ("create", "modify", "delete"):
                elem.clear()
                block = None


def _tags(elem: ET.Element) -> dict[str, str]:
    return {t.get("k", ""): t.get("v", "") for t in elem.findall("tag")}


def read_changes(data: bytes) -> Changes:
    """Changes from one gzipped day file. CPU bound: the caller runs it on a thread.

    Change files list each element's versions oldest first (osmium sorts them
    by type, id and version when it merges a day), so the last copy read is
    the one that stands.
    """
    changes = Changes()
    # (type, id) -> (tags, node point or way refs); relations carry nothing.
    keep: dict[tuple[str, int], tuple[dict[str, str], Any]] = {}
    for action, elem in _elements(data):
        element = elem.tag
        osm_id = int(elem.get("id", "0"))
        key = (element, osm_id)
        if action != "create":
            changes.touched[element].append(osm_id)
        if action == "delete":
            keep.pop(key, None)
            continue
        tags = _tags(elem)
        if rules.classify(element, tags) is None:
            keep.pop(key, None)
            continue
        if element == "node":
            keep[key] = (tags, (float(elem.get("lon", "nan")), float(elem.get("lat", "nan"))))
        elif element == "way":
            keep[key] = (tags, tuple(int(nd.get("ref", "0")) for nd in elem.findall("nd")))
        else:
            keep[key] = (tags, None)

    wanted = {ref for (element, _), (_, refs) in keep.items() if element == "way" for ref in refs}
    points: dict[int, tuple[float, float]] = {}
    if wanted:
        for action, elem in _elements(data):
            if elem.tag != "node" or action == "delete":
                continue
            ref = int(elem.get("id", "0"))
            if ref in wanted:
                points[ref] = (float(elem.get("lon", "nan")), float(elem.get("lat", "nan")))

    for (element, osm_id), (tags, geometry) in keep.items():
        point: tuple[float, float] | None = None
        moved = True
        if element == "node":
            point = geometry
        elif element == "way":
            found = [points.get(ref) for ref in geometry]
            if found and all(p is not None for p in found):
                box: rules.Box | None = None
                for p in found:
                    assert p is not None
                    box = rules.extend(box, *p)
                assert box is not None
                point = rules.centre(box)
            else:
                moved = any(p is not None for p in found)
        if point is not None and not any(math.isnan(v) for v in point):
            row = rules.place_row(element, osm_id, tags, point)
            if row is not None:
                changes.placed.append(row)
            continue
        row = rules.place_row(element, osm_id, tags, (0.0, 0.0))
        if row is not None:
            changes.unplaced.append((*row[:6], moved))
    return changes


def _chunks(ids: array, size: int) -> Iterator[array]:
    for start in range(0, len(ids), size):
        yield ids[start : start + size]


async def apply(changes: Changes, sequence: int) -> None:
    """Apply one day file's changes and record its sequence, in one transaction.

    The sequence moves only from the one before it, so a fill that swapped a
    new table in meanwhile (and wrote its own sequence) makes this roll back
    rather than mark a day applied to a table it never touched.
    """
    async with db.connection() as conn, conn.transaction():
        await conn.execute(
            "CREATE TEMP TABLE touched (osm_type text NOT NULL, osm_id bigint NOT NULL)"
            " ON COMMIT DROP"
        )
        async with conn.cursor().copy("COPY touched (osm_type, osm_id) FROM STDIN") as copy:
            for element, ids in changes.touched.items():
                for chunk in _chunks(ids, _COPY_CHUNK):
                    await copy.write("".join(f"{element}\t{i}\n" for i in chunk))
        await conn.execute("ANALYZE touched")
        await conn.execute(
            "CREATE TEMP TABLE incoming (osm_type text, osm_id bigint, kind text, name text,"
            " ele_ft real, rank smallint, lon float8, lat float8, moved boolean) ON COMMIT DROP"
        )
        async with conn.cursor().copy("COPY incoming FROM STDIN") as copy:
            for row in changes.placed:
                await copy.write_row((*row, False))
            for osm_type, osm_id, kind, name, ele, rank, moved in changes.unplaced:
                await copy.write_row((osm_type, osm_id, kind, name, ele, rank, None, None, moved))
        # A held shape edited today keeps where it stood until Overpass places it.
        await conn.execute(
            "UPDATE incoming i SET lon = ST_X(p.geom), lat = ST_Y(p.geom) FROM places p"
            " WHERE i.lon IS NULL AND p.osm_type = i.osm_type AND p.osm_id = i.osm_id"
        )
        await conn.execute(
            "DELETE FROM places p USING touched t"
            " WHERE p.osm_type = t.osm_type AND p.osm_id = t.osm_id"
        )
        await conn.execute(
            "DELETE FROM places_pending p USING touched t"
            " WHERE p.osm_type = t.osm_type AND p.osm_id = t.osm_id"
        )
        await conn.execute(
            "INSERT INTO places (osm_type, osm_id, kind, name, ele_ft, rank, geom)"
            " SELECT osm_type, osm_id, kind, name, ele_ft, rank,"
            "        ST_SetSRID(ST_MakePoint(lon, lat), 4326)"
            " FROM incoming WHERE lon IS NOT NULL"
            " ON CONFLICT (osm_type, osm_id) DO UPDATE SET kind = excluded.kind,"
            "   name = excluded.name, ele_ft = excluded.ele_ft, rank = excluded.rank,"
            "   geom = excluded.geom"
        )
        await conn.execute(
            "INSERT INTO places_pending (osm_type, osm_id)"
            " SELECT osm_type, osm_id FROM incoming"
            " WHERE osm_type <> 'node' AND (moved OR lon IS NULL)"
            " ON CONFLICT (osm_type, osm_id) DO NOTHING"
        )
        cur = await conn.execute(
            "UPDATE osm_state SET sequence = %s, updated_at = now() WHERE sequence = %s",
            (sequence, sequence - 1),
        )
        if cur.rowcount != 1:
            raise RuntimeError(f"osm_state moved while day {sequence} was applied")


async def _get(url: str, timeout_s: float) -> httpx.Response:
    try:
        response = await http.client().get(
            url, headers=http.HEADERS, timeout=timeout_s, follow_redirects=True
        )
    except httpx.HTTPError as exc:
        raise UpstreamError(f"{PROVIDER} request failed. Try again later.") from exc
    if response.status_code in (429, 509):
        retry = response.headers.get("Retry-After", "")
        raise UpstreamRateLimited(
            PROVIDER,
            None,
            int(retry) if retry.isdigit() else 3600,
            f"{PROVIDER} is limiting requests. Try again later.",
        )
    return response


async def latest_sequence() -> int:
    response = await _get(f"{REPLICATION_URL}/state.txt", 60.0)
    response.raise_for_status()
    sequence, _stamp = rules.parse_state(response.text)
    return sequence


async def apply_day(sequence: int) -> Changes:
    response = await _get(f"{REPLICATION_URL}/{rules.change_path(sequence)}", DOWNLOAD_TIMEOUT_S)
    response.raise_for_status()
    changes = await asyncio.to_thread(read_changes, response.content)
    await apply(changes, sequence)
    log.info(
        "Applied day file %d: %d edited or deleted, %d placed, %d kept without a point",
        sequence,
        sum(len(ids) for ids in changes.touched.values()),
        len(changes.placed),
        len(changes.unplaced),
    )
    return changes


Key = tuple[str, int]


def _centres_query(waiting: Iterable[Key]) -> str:
    """Every waiting way and relation by id, with its tags and Overpass's centre."""
    ways = ",".join(str(i) for element, i in waiting if element == "way")
    relations = ",".join(str(i) for element, i in waiting if element == "relation")
    clauses = (f"way(id:{ways});" if ways else "") + (f"rel(id:{relations});" if relations else "")
    return f"[out:json][timeout:{SERVER_TIMEOUT_TOKEN}];({clauses});out tags center;"


def _nested_query(relations: Iterable[int]) -> str:
    """Every relation inside these, at any depth, each with its own box and its members."""
    ids = ",".join(str(i) for i in relations)
    return f"[out:json][timeout:{SERVER_TIMEOUT_TOKEN}];(rel(id:{ids});>>;);rel._;out bb;"


def _nested_boxes(elements: Iterable[dict[str, Any]]) -> dict[int, rules.Box]:
    """Each relation's box by the fill's rule, from a `_nested_query` answer.

    Overpass sends a relation's box around its own nodes and ways as `bounds`,
    so that box stands in as one way member under the relation's negated id,
    and `rules.relation_boxes` applies the one rule unchanged.
    """
    members: dict[int, list[tuple[str, int]]] = {}
    own: dict[int, rules.Box] = {}
    for e in elements:
        if e.get("type") != "relation":
            continue
        rel = int(e["id"])
        items = [("r", int(m["ref"])) for m in e.get("members", []) if m.get("type") == "relation"]
        bounds = e.get("bounds")
        if bounds:
            own[-rel] = (bounds["minlon"], bounds["minlat"], bounds["maxlon"], bounds["maxlat"])
            items.insert(0, ("w", -rel))
        members[rel] = items
    return rules.relation_boxes(members, lambda _ref: None, own)


async def place_shapes(waiting: Sequence[Key]) -> dict[Key, rules.Row | None]:
    """Each waiting way's and relation's places row as Overpass has it now.

    None drops the place: OpenStreetMap no longer has the shape, the rules no
    longer keep it, or nothing under it has a point.
    """
    data = await osm.mirrors._post_with_fallback(_centres_query(waiting), path="update")
    found = {(e.get("type"), e.get("id")): e for e in data.get("elements", [])}
    rows: dict[Key, rules.Row | None] = {}
    unboxed: dict[int, dict[str, str]] = {}
    for element, osm_id in waiting:
        e = found.get((element, osm_id))
        if e is None:
            rows[(element, osm_id)] = None
            continue
        tags = e.get("tags", {})
        centre = e.get("center")
        if centre is not None:
            rows[(element, osm_id)] = rules.place_row(
                element, osm_id, tags, (centre["lon"], centre["lat"])
            )
        elif element == "relation":
            unboxed[osm_id] = tags
        else:
            rows[(element, osm_id)] = None
    if unboxed:
        data = await osm.mirrors._post_with_fallback(_nested_query(unboxed), path="update")
        boxes = _nested_boxes(data.get("elements", []))
        for osm_id, tags in unboxed.items():
            box = boxes.get(osm_id)
            rows[("relation", osm_id)] = (
                None if box is None else rules.place_row("relation", osm_id, tags, rules.centre(box))
            )
    return rows


async def place_pending() -> int:
    """Place the oldest PENDING_PER_QUERY waiting shapes from Overpass. Returns how many."""
    async with db.connection() as conn:
        waiting: list[Key] = [
            (element, int(osm_id))
            for element, osm_id in await (
                await conn.execute(
                    "SELECT osm_type, osm_id FROM places_pending"
                    " ORDER BY queued_at, osm_type, osm_id LIMIT %s",
                    (PENDING_PER_QUERY,),
                )
            ).fetchall()
        ]
    if not waiting:
        return 0
    rows = await place_shapes(waiting)
    async with db.connection() as conn, conn.transaction():
        cur = conn.cursor()
        await cur.executemany(
            "DELETE FROM places WHERE osm_type = %s AND osm_id = %s",
            [key for key, row in rows.items() if row is None],
        )
        await cur.executemany(
            "INSERT INTO places (osm_type, osm_id, kind, name, ele_ft, rank, geom)"
            " VALUES (%s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))"
            " ON CONFLICT (osm_type, osm_id) DO UPDATE SET kind = excluded.kind,"
            "   name = excluded.name, ele_ft = excluded.ele_ft, rank = excluded.rank,"
            "   geom = excluded.geom",
            [row for row in rows.values() if row is not None],
        )
        await cur.executemany(
            "DELETE FROM places_pending WHERE osm_type = %s AND osm_id = %s", list(rows)
        )
    return len(rows)


async def _current_sequence() -> int | None:
    async with db.connection() as conn:
        row = await (await conn.execute("SELECT sequence FROM osm_state")).fetchone()
    return int(row[0]) if row and row[0] is not None else None


async def run() -> None:
    """One refresh: every day file not yet applied, then the shapes waiting on Overpass."""
    if not await places.is_filled():
        return
    loop = asyncio.get_running_loop()
    started = loop.time()
    current = await _current_sequence()
    if current is None:
        raise RuntimeError("the places table was filled without a change-file sequence")
    latest = await latest_sequence()
    for sequence in _days(current, latest):
        if loop.time() - started > FILES_BUDGET_S:
            log.info("Day files caught up to %d of %d; the rest next run", sequence - 1, latest)
            break
        await apply_day(sequence)
    try:
        placed = await place_pending()
    except (UpstreamError, ratelimit.BudgetExhausted, TimeoutError) as exc:
        # Ordinary weather for a donated server, and nothing is lost: the
        # shapes keep their old points and wait for the next run.
        log.warning("Waiting shapes stay where they stood; Overpass did not answer (%s)", exc)
        return
    if placed:
        log.info("Placed %d shape(s) from Overpass", placed)


def _days(current: int, latest: int) -> Iterable[int]:
    return range(current + 1, latest + 1)


SOURCE = refresh.Source("osm", INTERVAL_S, run, deadline_s=DEADLINE_S)
refresh.register(SOURCE)
