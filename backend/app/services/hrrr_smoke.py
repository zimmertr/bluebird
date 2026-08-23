"""NOAA HRRR near-surface smoke, as one national forecast this pod holds.

``hms.py`` is where the smoke *is*. This is where it is *going*: HRRR carries
smoke as a tracer, seeded from satellite fire radiative power, so unlike the
analyst-drawn HMS plumes it has hours in front of it. That is the whole reason
this module exists, and it is why the map can play a smoke forecast at all.

Everything below was measured against the live archive on 2026-08-23.

**The source is AWS Open Data, not NOMADS.** ``noaa-hrrr-bdp-pds`` is anonymous
S3 with no key and no published quota, and NOAA sponsors the egress. NOMADS
serves the same model and throttles and blocks heavy clients; it must not be
used here. One refresh is about 100 byte-range requests and 37 MB, four times a
day. No visitor ever talks to NOAA: they read this pod.

**Only one field is fetched, not the file.** A surface file is 171 MB and
carries 173 fields. ``MASSDEN`` at 8 m is 700 KB of it, and the ``.idx`` NOAA
publishes beside each file gives its byte range, so the fetch is one ranged GET.

**Only the four long cycles are used.** ``00/06/12/18Z`` run to 48 hours; the
hourly cycles between them stop at 18. Playback follows an analyzed window that
can be days long, so reach is worth more here than being an hour fresher. The
last hour of a cycle publishes about 1 h 56 min after cycle time, which is what
:data:`CYCLE_READY_MINUTES` encodes.

**A snapshot is tiny once it is binned.** The values are quantized to the three
HMS density classes and compressed, which measured 56 times smaller than the raw
bytes: 34 KB per hour, so all 49 hours cost about 1.7 MB of pod memory. Holding
real numbers instead would cost 373 MB. Requests decompress the hours they
need, which measured about 5 ms each.

**The field is never zero**, so "no smoke" is a floor rather than a zero test:
the smallest value in a real hour measured 3.5e-10 ug/m3. :data:`FLOOR_UGM3` is
what separates absent from merely tiny.
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import time
import zlib
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import httpx
import numpy as np

from app.services.errors import UpstreamError, classify_http_error
from app.services.grib import (
    GribError,
    LambertGrid,
    decode_values,
    lambert_grid,
    split_sections,
)
from app.services.snapshot import SnapshotCache

log = logging.getLogger(__name__)

PROVIDER = "NOAA HRRR (forecast smoke)"

BASE_URL = "https://noaa-hrrr-bdp-pds.s3.amazonaws.com"

HEADERS = {"User-Agent": "Bluebird/1.0 (bluebirdforecast.com; personal weather tool)"}

# The variable and level as the .idx names them. Matched as text because that
# index is the only description of the file NOAA publishes.
VARIABLE = "MASSDEN"
LEVEL = "8 m above ground"

# Cycles that run to 48 hours, and how far they run.
LONG_CYCLE_HOURS = (0, 6, 12, 18)
MAX_FORECAST_HOUR = 48

# How long after cycle time the last forecast hour is published. Measured on the
# 2026-08-22 00Z cycle: f00 landed at 00:53, f24 at 01:21, f48 at 01:56. The
# margin above that is deliberate, because a late run is normal and asking early
# only earns a 404 on the tail of a cycle that is otherwise fine.
CYCLE_READY_MINUTES = 150

# The HMS density classes, as concentrations. Published mapping: Light covers
# 0 to 10 ug/m3, Medium 10 to 21, Heavy above that. Using it is what lets the
# forecast layer carry the same three words as the observed one instead of
# inventing a second vocabulary for the same thing.
FLOOR_UGM3 = 1.0
LIGHT_UGM3 = 10.0
MEDIUM_UGM3 = 21.0

# What a cell can say. OUTSIDE is not a fourth density: it means the lattice
# cell fell off the model's grid, which is a different statement from "no
# smoke here" and has to stay distinguishable, the way a wildfire check
# distinguishes "clear" from "never looked".
CLASS_NONE = 0
CLASS_OUTSIDE = 255

# The model's own grid spacing. A lattice is never finer than this: asking for
# more samples than the model has grid points invents detail.
NATIVE_PITCH_KM = 3.0

# The most cells one response may carry. 4,096 is a 64 by 64 lattice, which at
# the native pitch covers about 190 km on a side and is comfortably more than a
# polygon this app will analyze. Past it the lattice coarsens and says so.
MAX_CELLS = 4096

# The sphere GRIB shape-of-earth code 6 names, which is what HRRR is defined on.
EARTH_RADIUS_M = 6371229.0

REQUEST_TIMEOUT_S = 60.0

# How many hours are fetched at once. Small on purpose: this is a donated file
# server, the win from more parallelism is seconds on a refresh nobody waits
# for, and the decode behind it is the real cost anyway.
FETCH_CONCURRENCY = 6


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        log.warning("Ignoring non-integer %s=%r; using default %d", name, raw, default)
        return default


# A cycle every six hours means a snapshot is at most a few minutes staler than
# the newest run for most of its life. 30 minutes bounds how long after a run
# lands before visitors see it, at 48 checks a day against a file server with no
# quota.
TTL_S = _env_int("HRRR_SMOKE_CACHE_TTL_S", 1800)

# How long a failed refresh suppresses the next attempt, for the reason hms.py's
# twin spells out: without it every request during an outage becomes its own
# upstream attempt.
RETRY_AFTER_FAILURE_S = _env_int("HRRR_SMOKE_RETRY_AFTER_FAILURE_S", 300)


@dataclass(frozen=True)
class Snapshot:
    """One model cycle, binned to density classes and compressed.

    ``hours`` maps a valid time in epoch milliseconds to the zlib-compressed
    class array for that hour, in the grid's own row-major order. Compressed
    because the whole point is that the country fits in a pod; see the module
    docstring for the measurement.
    """

    fetched_at_ms: int
    cycle: datetime
    grid: LambertGrid
    hours: dict[int, bytes]

    @property
    def cycle_iso(self) -> str:
        return self.cycle.strftime("%Y-%m-%dT%H:%M:%SZ")

    def classes(self, valid_ms: int) -> np.ndarray:
        """One hour's classes, as a 2-D array indexed [row, column]."""
        raw = zlib.decompress(self.hours[valid_ms])
        return np.frombuffer(raw, dtype=np.uint8).reshape(self.grid.ny, self.grid.nx)


def newest_ready_cycle(now: datetime | None = None) -> datetime:
    """The most recent long cycle that should have finished publishing.

    Walks back from the current time in six-hour steps until one is old enough
    by :data:`CYCLE_READY_MINUTES`. Never guesses forward: a cycle that is still
    running has no f48 to fetch, and asking for one is a 404 rather than a wait.
    """
    moment = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    candidate = moment.replace(minute=0, second=0, microsecond=0)
    while candidate.hour not in LONG_CYCLE_HOURS:
        candidate -= timedelta(hours=1)
    while moment - candidate < timedelta(minutes=CYCLE_READY_MINUTES):
        candidate -= timedelta(hours=6)
    return candidate


def _hour_path(cycle: datetime, forecast_hour: int) -> str:
    return (
        f"/hrrr.{cycle:%Y%m%d}/conus/hrrr.t{cycle:%H}z.wrfsfcf{forecast_hour:02d}.grib2"
    )


def idx_url(cycle: datetime, forecast_hour: int) -> str:
    return f"{BASE_URL}{_hour_path(cycle, forecast_hour)}.idx"


def grib_url(cycle: datetime, forecast_hour: int) -> str:
    return f"{BASE_URL}{_hour_path(cycle, forecast_hour)}"


def field_range(index_text: str) -> tuple[int, int | None]:
    """The byte range of our field, from the ``.idx`` beside the file.

    Each line is ``number:offset:date:variable:level:forecast:``. A field's
    length is the next line's offset, so the last field in a file has no end and
    reads to EOF; that is the ``None``, not an error.
    """
    lines = [line for line in index_text.splitlines() if line.strip()]
    for position, line in enumerate(lines):
        parts = line.split(":")
        if len(parts) < 5 or parts[3] != VARIABLE or parts[4] != LEVEL:
            continue
        start = int(parts[1])
        for following in lines[position + 1 :]:
            nxt = following.split(":")
            if len(nxt) > 1:
                return start, int(nxt[1])
        return start, None
    raise UpstreamError(f"{VARIABLE} at {LEVEL} is not in the index.")


def classify(values_ugm3: np.ndarray) -> np.ndarray:
    """Concentrations to HMS density classes."""
    out = np.zeros(values_ugm3.shape, dtype=np.uint8)
    out[values_ugm3 >= FLOOR_UGM3] = 1
    out[values_ugm3 >= LIGHT_UGM3] = 2
    out[values_ugm3 >= MEDIUM_UGM3] = 3
    return out


def decode_hour(message: bytes) -> tuple[LambertGrid, bytes]:
    """One ranged GRIB message to a compressed class array.

    Runs on a worker thread. Decoding 1.9 million points measured 0.41 s, and 49
    of those on the event loop would stall the pod for twenty seconds while it
    served nothing.
    """
    sections = split_sections(message)
    missing = {3, 5, 6, 7} - sections.keys()
    if missing:
        raise GribError(f"message is missing section(s) {sorted(missing)}")
    grid = lambert_grid(sections[3])
    values = decode_values(sections[5], sections[6], sections[7])
    if values.size != grid.size:
        raise GribError(f"{values.size} values for a {grid.nx}x{grid.ny} grid")
    # kg/m3 on the wire, ug/m3 everywhere a person reads it.
    classes = classify(values * 1e9)
    return grid, zlib.compress(classes.tobytes(), 6)


async def _fetch_hour(
    client: httpx.AsyncClient, cycle: datetime, forecast_hour: int
) -> tuple[int, LambertGrid, bytes] | None:
    """One forecast hour, or None when NOAA has not published it.

    Missing hours are skipped rather than fatal. A cycle can be published with a
    gap, and 48 good hours with one hole is a better answer than no layer.
    """
    index = await client.get(idx_url(cycle, forecast_hour))
    if index.status_code == 404:
        log.info("HRRR %s f%02d is not published", cycle.isoformat(), forecast_hour)
        return None
    index.raise_for_status()

    start, end = field_range(index.text)
    span = f"bytes={start}-" if end is None else f"bytes={start}-{end - 1}"
    body = await client.get(grib_url(cycle, forecast_hour), headers={"Range": span})
    body.raise_for_status()

    grid, packed = await asyncio.to_thread(decode_hour, body.content)
    valid_ms = int((cycle + timedelta(hours=forecast_hour)).timestamp() * 1000)
    return valid_ms, grid, packed


async def fetch_snapshot(now: datetime | None = None) -> Snapshot:
    """Every forecast hour of the newest ready cycle.

    Falls back one cycle when the newest turns out to be unpublished, which is
    the same shape as ``hms.py`` falling back a day and for the same reason: a
    run that is late is a normal morning, not an outage.
    """
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S, headers=HEADERS) as client:
        first = newest_ready_cycle(now)
        for cycle in (first, first - timedelta(hours=6)):
            hours, grid = await _fetch_cycle(client, cycle)
            if hours:
                return Snapshot(
                    fetched_at_ms=int(time.time() * 1000),
                    cycle=cycle,
                    grid=grid,
                    hours=hours,
                )
            log.info("HRRR cycle %s had no usable hours; falling back", cycle.isoformat())
    raise UpstreamError("Forecast smoke is unavailable. Try again later.")


async def _fetch_cycle(
    client: httpx.AsyncClient, cycle: datetime
) -> tuple[dict[int, bytes], LambertGrid | None]:
    semaphore = asyncio.Semaphore(FETCH_CONCURRENCY)

    async def one(forecast_hour: int) -> tuple[int, LambertGrid, bytes] | None:
        async with semaphore:
            try:
                return await _fetch_hour(client, cycle, forecast_hour)
            except Exception as exc:  # noqa: BLE001 — one bad hour must not lose the cycle
                log.warning("HRRR f%02d failed: %s", forecast_hour, exc)
                return None

    results = await asyncio.gather(*(one(h) for h in range(MAX_FORECAST_HOUR + 1)))
    hours: dict[int, bytes] = {}
    grid: LambertGrid | None = None
    for result in results:
        if result is None:
            continue
        valid_ms, hour_grid, packed = result
        hours[valid_ms] = packed
        grid = hour_grid
    return hours, grid


# ── Projection ────────────────────────────────────────────────────────────────


def _cone(grid: LambertGrid) -> tuple[float, float]:
    """The cone constant and the scale factor for this grid's projection.

    HRRR is tangent (both standard parallels are 38.5), where the secant formula
    is zero over zero. Both branches are kept because the tangent case is the
    grid's property rather than this module's assumption.
    """
    lat1, lat2 = math.radians(grid.latin1), math.radians(grid.latin2)
    if abs(grid.latin1 - grid.latin2) < 1e-9:
        n = math.sin(lat1)
    else:
        n = math.log(math.cos(lat1) / math.cos(lat2)) / math.log(
            math.tan(math.pi / 4 + lat2 / 2) / math.tan(math.pi / 4 + lat1 / 2)
        )
    f = math.cos(lat1) * math.tan(math.pi / 4 + lat1 / 2) ** n / n
    return n, f


def _rho(f: float, n: float, lat_deg: float | np.ndarray) -> np.ndarray:
    return EARTH_RADIUS_M * f / np.tan(np.pi / 4 + np.radians(lat_deg) / 2) ** n


def grid_indices(
    grid: LambertGrid, lon: np.ndarray, lat: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """Nearest grid column and row for each longitude and latitude.

    Returned as integers that may be out of range; callers mask them. Scan mode
    64 means the first point is the south-west corner and both axes increase,
    which is why the row index adds rather than subtracts.
    """
    n, f = _cone(grid)
    rho0 = _rho(f, n, grid.lad)

    def to_xy(lon_deg, lat_deg):
        theta = n * np.radians((np.asarray(lon_deg) - grid.lov + 180.0) % 360.0 - 180.0)
        rho = _rho(f, n, lat_deg)
        return rho * np.sin(theta), rho0 - rho * np.cos(theta)

    x0, y0 = to_xy(grid.lo1, grid.la1)
    x, y = to_xy(lon, lat)
    col = np.rint((x - x0) / grid.dx_m).astype(np.int64)
    row = np.rint((y - y0) / grid.dy_m).astype(np.int64)
    return col, row


# ── Sampling ──────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Lattice:
    """A longitude and latitude grid covering exactly the requested box.

    The map draws this as an image stretched over ``bbox``, so the cells must
    tile the box exactly and the pitch is descriptive rather than structural.
    """

    west: float
    south: float
    east: float
    north: float
    cols: int
    rows: int
    pitch_km: float


def build_lattice(
    west: float, south: float, east: float, north: float, max_cells: int = MAX_CELLS
) -> Lattice:
    """A lattice over the box, never finer than the model and never larger than
    the cap.

    The coarsening is a loop rather than one division because the counts come
    out of :func:`math.ceil`: a lattice a few cells over the cap is not fixed by
    scaling the pitch by the ratio. Same reasoning as the forecast grid's.
    """
    mid_lat = (south + north) / 2
    km_per_deg_lat = 111.32
    km_per_deg_lon = 111.32 * max(math.cos(math.radians(mid_lat)), 0.05)
    width_km = max((east - west) * km_per_deg_lon, 1e-6)
    height_km = max((north - south) * km_per_deg_lat, 1e-6)

    pitch = NATIVE_PITCH_KM
    while True:
        # Floor, not ceil. Rounding the counts up makes the cells *smaller*
        # than the pitch that produced them, which is the exact thing this is
        # meant to prevent: it would sample between two model grid points and
        # draw the result as if it were data.
        cols = max(1, math.floor(width_km / pitch))
        rows = max(1, math.floor(height_km / pitch))
        if cols * rows <= max_cells:
            break
        pitch *= 1.25
    # What the reader is shown is the box divided by the counts, and never a
    # claim finer than the model itself: a box smaller than one grid cell still
    # gets a cell, and calling that half a kilometre would be inventing detail.
    effective = max(width_km / cols, height_km / rows, NATIVE_PITCH_KM)
    return Lattice(west, south, east, north, cols, rows, round(effective, 1))


def sample(snapshot: Snapshot, lattice: Lattice, valid_ms: int) -> np.ndarray:
    """One hour's classes on the lattice, row-major from the south-west corner.

    Cells off the model's grid come back as :data:`CLASS_OUTSIDE`, which the map
    draws as nothing and the legend reads as "we do not cover this", rather than
    as clean air.
    """
    lon_centers = lattice.west + (np.arange(lattice.cols) + 0.5) * (
        (lattice.east - lattice.west) / lattice.cols
    )
    lat_centers = lattice.south + (np.arange(lattice.rows) + 0.5) * (
        (lattice.north - lattice.south) / lattice.rows
    )
    lon = np.repeat(lon_centers[None, :], lattice.rows, axis=0)
    lat = np.repeat(lat_centers[:, None], lattice.cols, axis=1)

    col, row = grid_indices(snapshot.grid, lon, lat)
    inside = (col >= 0) & (col < snapshot.grid.nx) & (row >= 0) & (row < snapshot.grid.ny)

    out = np.full((lattice.rows, lattice.cols), CLASS_OUTSIDE, dtype=np.uint8)
    if inside.any():
        classes = snapshot.classes(valid_ms)
        out[inside] = classes[row[inside], col[inside]]
    return out


def hours_within(snapshot: Snapshot, start_ms: int, end_ms: int) -> list[int]:
    """The snapshot's valid times inside a window, in order."""
    return sorted(t for t in snapshot.hours if start_ms <= t <= end_ms)


def smoke_forecast_cache(
    *,
    ttl_s: float = TTL_S,
    retry_after_failure_s: float = RETRY_AFTER_FAILURE_S,
    clock: Callable[[], float] = time.monotonic,
    fetch: Callable[[], Awaitable[Snapshot]] = fetch_snapshot,
) -> SnapshotCache[Snapshot]:
    """The shared snapshot cache, wired to this module's fetch and knobs."""
    return SnapshotCache(
        label=PROVIDER,
        fetch=fetch,
        ttl_s=ttl_s,
        retry_after_failure_s=retry_after_failure_s,
        describe=lambda s: f"{len(s.hours)} hours from cycle {s.cycle_iso}",
        clock=clock,
    )


FORECAST = smoke_forecast_cache()


def unavailable_message(exc: Exception) -> str:
    """The user-facing sentence for a cold-start failure."""
    if isinstance(exc, UpstreamError):
        return exc.message
    return classify_http_error(exc, PROVIDER)
