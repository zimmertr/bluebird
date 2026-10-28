"""Satellite fire detections from NASA FIRMS, fetched by the server for every visitor.

FIRMS (Fire Information for Resource Management System) publishes the active
fire detections of the VIIRS and MODIS instruments as plain CSV files, keyless,
refreshed every 60 minutes and about 3 hours behind each pass. A detection is
one hot pixel: 375 m across for VIIRS and 1 km for MODIS. It says something
was burning there when the satellite went over, not where a fire's edge is,
which is what the NIFC perimeters (``nifc.py``) say.

Four facts about the source shape everything below.

**The files have no CORS header**, so a browser cannot read them. The pod
fetches them and serves a view's slice, the way it serves the perimeters.

**The world fits.** Measured 2026-10-27: the three 48-hour Global files are
13.3 MB (NOAA-20), 12.5 MB (NOAA-21) and 1.8 MB (MODIS), 27.7 MB together and
about 2.5 s each to download. So the pod reads Global and nothing is outside
coverage, where the regional files would have needed an outline and a greyed
Layers row. The files held 334,585 detections on that day, 198,575 of them
inside 48 hours.

**Each file is a rolling window.** A "48h" file reaches back over three
calendar days (its oldest row was 74 hours old when measured), so the parse
keeps only what was acquired inside ``MAX_AGE_S`` of the fetch. The browser
draws nothing older than that either.

**Suomi NPP's feed ends on 2026-11-02**, so the two VIIRS files read are
NOAA-20's and NOAA-21's. GOES is left out: its detections are 2 km pixels
every few minutes from geostationary orbit, a different kind of picture that
the maintainer did not ask for (2026-10-27).

Held as columns rather than as feature objects or feature text. Two hundred
thousand points as Python objects are about 80 MB, and as stored text about
45 MB; as typed arrays they are about 7 MB, and a view's slice is formatted
when it is asked for. The rows are sorted into 1° cells, so a view reads the
cells it covers rather than every detection on Earth.

Each pod fetches the files for itself unless the shared cache is on (#760),
when one pod at a time does and every pod reads the snapshot from the
database (``snapshot.py``).
"""

from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import math
import time
from array import array
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from typing import Any

import httpx

from app.db import refresh
from app.services.errors import UpstreamError, finite_float
from app.services.http import HEADERS
from app.services.snapshot import Shared, cache_factory

log = logging.getLogger("bluebird_forecast.fire_activity")

PROVIDER = "NASA FIRMS (fire detections)"

BASE_URL = "https://firms.modaps.eosdis.nasa.gov/data/active_fire"


@dataclass(frozen=True)
class Feed:
    """One FIRMS file: its directory, its file prefix and the instrument it carries."""

    directory: str
    prefix: str
    instrument: str

    @property
    def url(self) -> str:
        return f"{BASE_URL}/{self.directory}/csv/{self.prefix}_Global_48h.csv"


# NOAA-20 and NOAA-21 carry VIIRS, and Terra and Aqua carry MODIS, in one file.
# Suomi NPP's file is left out: its feed ends on 2026-11-02.
FEEDS = (
    Feed("noaa-20-viirs-c2", "J1_VIIRS_C2", "VIIRS"),
    Feed("noaa-21-viirs-c2", "J2_VIIRS_C2", "VIIRS"),
    Feed("modis-c6.1", "MODIS_C6_1", "MODIS"),
)

# How old a detection may be and still be kept, from the moment of the fetch.
# The browser colours three bands under it (12, 24 and 48 hours) and draws
# nothing past it (the maintainer, 2026-10-27).
MAX_AGE_S = 48 * 60 * 60

# FIRMS rewrites the files every 60 minutes, so a shorter interval would fetch
# the same bytes again. Never shorter, and so no env knob: the one way to make
# it faster is the one that buys nothing.
TTL_S = 60 * 60

# How long a failed per-pod refresh suppresses the next attempt, the other
# overlays' value: without it every request during an outage would be its own
# 28 MB download.
RETRY_AFTER_FAILURE_S = 60

# Where a row's fire radiative power is missing. Never a reading, since power
# is never negative, and not NaN, because NaN is unequal to itself and a
# snapshot must equal itself after a trip through the shared cache.
MISSING_FRP = -1.0

# One operation of a fetch (a connect, or a read between chunks), as for the
# other overlays. `snapshot.REFRESH_DEADLINE_S` bounds the whole refresh.
REQUEST_TIMEOUT_S = 60.0

# The columns every row needs. MODIS names its brightness columns differently
# from VIIRS, and neither is read, so the two files share this list.
_COLUMNS = ("latitude", "longitude", "acq_date", "acq_time", "satellite", "confidence", "frp")

def _cell(lon: float, lat: float) -> int:
    """The 1° cell a point stands in, as one integer; 180°E and 90°N fold into the last.

    A view at the browser's lowest zoom is about 60° wide, so it reads a few
    thousand cells at most, and the densest cell measured held a few thousand
    detections (southern Africa, 2026-10-27).
    """
    x = min(int(math.floor(lon)) + 180, 359)
    y = min(int(math.floor(lat)) + 90, 179)
    return y * 360 + x


@lru_cache(maxsize=8192)
def _iso(epoch_s: int) -> str:
    """An acquisition time as ISO 8601 UTC. Cached: a pass stamps thousands of rows alike."""
    return datetime.fromtimestamp(epoch_s, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def acquired_at(acq_date: str, acq_time: str) -> datetime:
    """When the satellite saw the pixel, from FIRMS's date and its UTC ``HHMM``.

    ``acq_time`` drops its leading zeros in some exports (``5`` for 00:05),
    so it is padded before it is read.
    """
    clock = acq_time.strip().zfill(4)
    if len(clock) != 4 or not clock.isdigit():
        raise ValueError(f"acq_time {acq_time!r} is not HHMM")
    day = datetime.strptime(acq_date.strip(), "%Y-%m-%d")
    return day.replace(hour=int(clock[:2]), minute=int(clock[2:]), tzinfo=UTC)


@dataclass(frozen=True, slots=True)
class Detection:
    """One parsed row, before the snapshot sorts it into its cell.

    Slotted, and its stamp and strings shared between the rows of one pass,
    because a refresh holds two hundred thousand of these for a moment.
    """

    lon: float
    lat: float
    acquired: datetime
    instrument: str
    satellite: str
    confidence: str
    frp: float | None


def parse_csv(text: str, instrument: str, *, since_s: int | None = None) -> list[Detection]:
    """Every usable row of one FIRMS file, acquired at or after ``since_s`` when given.

    A file without the columns this reads is not a FIRMS file, and fails the
    refresh. A row that cannot be read (a coordinate that is not a number, a
    time that is not ``HHMM``) is dropped and the rest kept, the way the smoke
    parse drops a plume it cannot draw. Nothing is dropped for its
    confidence: a low-confidence pixel is still a pixel the satellite flagged.
    """
    reader = csv.DictReader(io.StringIO(text))
    missing = [c for c in _COLUMNS if c not in (reader.fieldnames or ())]
    if missing:
        raise UpstreamError(f"{PROVIDER} request failed. Try again later.")
    # One object per distinct stamp and code: a pass stamps thousands of rows
    # with one minute, and the codes are a handful of short strings.
    stamps: dict[tuple[str, str], datetime | None] = {}
    words: dict[str, str] = {}
    detections: list[Detection] = []
    dropped = 0
    for row in reader:
        stamp_key = (row["acq_date"] or "", row["acq_time"] or "")
        if stamp_key not in stamps:
            try:
                stamps[stamp_key] = acquired_at(*stamp_key)
            except ValueError:
                stamps[stamp_key] = None
        acquired = stamps[stamp_key]
        lat = finite_float(row["latitude"])
        lon = finite_float(row["longitude"])
        if acquired is None or lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            dropped += 1
            continue
        if since_s is not None and acquired.timestamp() < since_s:
            continue
        satellite = (row["satellite"] or "").strip()
        confidence = (row["confidence"] or "").strip()
        detections.append(
            Detection(
                lon=lon,
                lat=lat,
                acquired=acquired,
                instrument=instrument,
                satellite=words.setdefault(satellite, satellite),
                confidence=words.setdefault(confidence, confidence),
                frp=finite_float(row["frp"]),
            )
        )
    if dropped:
        log.info("%s: %d unreadable rows dropped", instrument, dropped)
    return detections


@dataclass(frozen=True)
class Snapshot:
    """Every kept detection, as columns sorted by cell.

    ``kinds`` is each distinct (instrument, satellite, confidence), and
    ``kind`` indexes it per row; there are about two hundred, because MODIS
    states its confidence as a number from 0 to 100. ``frp`` holds
    ``MISSING_FRP`` where FIRMS gave no number. ``cells`` maps a cell to the slice of rows in it.
    ``fetched_at_ms`` is wall time, shown to API callers; freshness is
    tracked on the monotonic clock, as for the other overlays.
    """

    fetched_at_ms: int
    lon: array[float]
    lat: array[float]
    acquired: array[int]
    frp: array[float]
    kind: array[int]
    kinds: tuple[tuple[str, str, str], ...]
    cells: dict[int, tuple[int, int]]

    @property
    def count(self) -> int:
        return len(self.lon)

    def within(self, bbox: tuple[float, float, float, float]) -> list[int]:
        """The rows inside ``bbox``, edges included.

        A west greater than its east is a box across the antimeridian, read as
        the two boxes either side of it.
        """
        west, south, east, north = bbox
        if west > east:
            return self._within(west, south, 180.0, north) + self._within(-180.0, south, east, north)
        return self._within(west, south, east, north)

    def _within(self, west: float, south: float, east: float, north: float) -> list[int]:
        rows: list[int] = []
        x0, x1 = _cell(west, 0) % 360, _cell(east, 0) % 360
        y0, y1 = _cell(0, south) // 360, _cell(0, north) // 360
        lon, lat = self.lon, self.lat
        for y in range(y0, y1 + 1):
            # A cell wholly inside the box needs no test of its rows.
            inner_y = y - 90 >= south and y - 89 <= north
            for x in range(x0, x1 + 1):
                span = self.cells.get(y * 360 + x)
                if span is None:
                    continue
                start, end = span
                if inner_y and x - 180 >= west and x - 179 <= east:
                    rows.extend(range(start, end))
                    continue
                rows.extend(
                    i for i in range(start, end) if west <= lon[i] <= east and south <= lat[i] <= north
                )
        return rows


def build_snapshot(detections: Iterable[Detection], fetched_at_ms: int) -> Snapshot:
    """The kept detections as a snapshot: those inside ``MAX_AGE_S`` of the fetch, sorted by cell."""
    oldest = fetched_at_ms // 1000 - MAX_AGE_S
    kept = sorted(
        (d for d in detections if d.acquired.timestamp() >= oldest),
        key=lambda d: (_cell(d.lon, d.lat), d.acquired, d.lon, d.lat),
    )
    kinds: dict[tuple[str, str, str], int] = {}
    lon, lat, frp = array("d"), array("d"), array("d")
    acquired, kind = array("q"), array("H")
    cells: dict[int, tuple[int, int]] = {}
    for i, d in enumerate(kept):
        key = (d.instrument, d.satellite, d.confidence)
        lon.append(d.lon)
        lat.append(d.lat)
        acquired.append(int(d.acquired.timestamp()))
        frp.append(MISSING_FRP if d.frp is None else d.frp)
        kind.append(kinds.setdefault(key, len(kinds)))
        cell = _cell(d.lon, d.lat)
        start, _ = cells.get(cell, (i, i))
        cells[cell] = (start, i + 1)
    return Snapshot(
        fetched_at_ms=fetched_at_ms,
        lon=lon,
        lat=lat,
        acquired=acquired,
        frp=frp,
        kind=kind,
        kinds=tuple(kinds),
        cells=cells,
    )


def _frp(value: float) -> str:
    return "null" if value == MISSING_FRP else repr(value)


def collection_json(snapshot: Snapshot, rows: list[int]) -> str:
    """A GeoJSON FeatureCollection of the given rows, with ``fetched_at`` as a foreign member.

    Written as text rather than through ``json.dumps`` per feature: every
    feature has the same shape, so only its numbers and its stamp change, and
    the strings it carries come from about two hundred kinds, each encoded
    once here.
    """
    tails = [
        f'"instrument":{json.dumps(i)},"satellite":{json.dumps(s)},"confidence":{json.dumps(c)}'
        for i, s, c in snapshot.kinds
    ]
    lon, lat, acquired, frp, kind = (
        snapshot.lon,
        snapshot.lat,
        snapshot.acquired,
        snapshot.frp,
        snapshot.kind,
    )
    features = ",".join(
        '{"type":"Feature","geometry":{"type":"Point","coordinates":['
        f'{lon[i]!r},{lat[i]!r}]}},"properties":{{"acquired":"{_iso(acquired[i])}",'
        f'{tails[kind[i]]},"frp":{_frp(frp[i])}}}}}'
        for i in rows
    )
    return (
        '{"type":"FeatureCollection","fetched_at":'
        + str(snapshot.fetched_at_ms)
        + ',"features":['
        + features
        + "]}"
    )


async def _fetch_feed(client: httpx.AsyncClient, feed: Feed, since_s: int) -> list[Detection]:
    response = await client.get(feed.url)
    response.raise_for_status()
    # Off the event loop: reading 160,000 rows is a second of CPU, and an
    # `async` function holding the loop stalls every other request on the pod.
    return await asyncio.to_thread(parse_csv, response.text, feed.instrument, since_s=since_s)


async def fetch_snapshot() -> Snapshot:
    """The three files at once, as one snapshot.

    All three or none: a refresh that lost a file would serve a map with a
    third or more of its detections missing and nothing saying so, where a
    failed one keeps serving the last whole snapshot for up to a day.
    """
    since_s = int(time.time()) - MAX_AGE_S
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S, headers=HEADERS) as client:
        parts = await asyncio.gather(*(_fetch_feed(client, feed, since_s) for feed in FEEDS))
    fetched_at_ms = int(time.time() * 1000)
    detections = [d for part in parts for d in part]
    return await asyncio.to_thread(build_snapshot, detections, fetched_at_ms)


def _encode(snapshot: Snapshot) -> dict[str, Any]:
    return {
        "fetched_at_ms": snapshot.fetched_at_ms,
        "lon": snapshot.lon.tolist(),
        "lat": snapshot.lat.tolist(),
        "acquired": snapshot.acquired.tolist(),
        "frp": snapshot.frp.tolist(),
        "kind": snapshot.kind.tolist(),
        "kinds": [list(k) for k in snapshot.kinds],
        "cells": [[cell, start, end] for cell, (start, end) in snapshot.cells.items()],
    }


def _decode(data: dict[str, Any]) -> Snapshot:
    return Snapshot(
        fetched_at_ms=data["fetched_at_ms"],
        lon=array("d", data["lon"]),
        lat=array("d", data["lat"]),
        acquired=array("q", data["acquired"]),
        frp=array("d", data["frp"]),
        kind=array("H", data["kind"]),
        kinds=tuple((i, s, c) for i, s, c in data["kinds"]),
        cells={cell: (start, end) for cell, start, end in data["cells"]},
    )


def _describe(snapshot: Snapshot) -> str:
    instruments: dict[str, int] = {}
    for k in snapshot.kind:
        name = snapshot.kinds[k][0]
        instruments[name] = instruments.get(name, 0) + 1
    counts = ", ".join(f"{n} {name}" for name, n in sorted(instruments.items()))
    return f"{snapshot.count} detections in 48 hours ({counts or 'none'})"


# The snapshot as the shared cache's `snapshots` row holds it (#760): the
# columns as JSON lists, about 7 MB before the row's gzip. Bump `format`
# whenever `_encode` changes shape.
SHARED = Shared(source="fire_activity", format=1, encode=_encode, decode=_decode)

# The shared snapshot cache, wired to this module's fetch and knobs.
detection_cache = cache_factory(
    label=PROVIDER,
    fetch=fetch_snapshot,
    ttl_s=TTL_S,
    retry_after_failure_s=RETRY_AFTER_FAILURE_S,
    describe=_describe,
    shared=SHARED,
)

DETECTIONS = detection_cache()

# With the shared cache on, the one fetch every pod reads (#760).
refresh.register(DETECTIONS.source())
