"""Today's snow depth for any coordinate, from one national grid the pod holds.

SNODAS is the National Operational Hydrologic Remote Sensing Center's snow
model: one 1 km grid a day, assimilating airborne, satellite and ground
observations. It is the same product the map's snow overlay draws (#446), and
the only source that answers "how much snow is on the ground here" honestly at
a summit — the eight forecast models Open-Meteo carries disagree by three
orders of magnitude over Mount Rainier (issue #449).

Four facts about the file shape everything below.

**It is a dated tar, not a query.** One archive per day at NSIDC, named for the
date, holding every SNODAS product for that day's 06 UTC analysis. So "today"
has to be computed rather than asked for, and the day's file does not exist
until NSIDC publishes it — measured 2026-09-22 at about 13:15 UTC. A 404
therefore falls back one day, the way ``hms.py`` does, rather than reporting an
outage: before publication, yesterday's grid is the current analysis.

**It is the UNMASKED product.** The masked variant covers the contiguous US
only. Unmasked reaches 24.1N to 58.23N and 130.5W to 62.25W, which covers the
contiguous United States, southern Canada and northern Mexico, and is what puts
the North Cascades' Canadian side inside the answer. It is the same box the
map's snow layer draws, so a marker and the layer under it agree on where the
analysis exists. Everything outside it reads null.

**It is one flat array of big-endian int16.** 8192 by 4096 samples, 67,108,864
bytes, row-major from the north-west corner, in the unit the header declares
(millimetres today). A lookup is one ``struct.unpack_from`` at a computed
offset, about 3.5 microseconds, so a 1,500-destination analysis costs about
five milliseconds of the event loop. The grid is held as ``bytes`` and never
written to disk: the pod runs ``readOnlyRootFilesystem``, and 64 MiB inside a
512Mi request is cheaper than a volume.

**Its header is a file beside it, and it is read rather than assumed.** NSIDC
has changed the masked product's extent once already, so the columns, rows,
origin, resolution and no-data value all come out of the ``.txt.gz`` member. A
header missing any of them, or declaring anything other than two bytes per
pixel, fails the fetch — which leaves the last good snapshot standing, because
an array read with the wrong geometry answers confident nonsense rather than
nothing.
"""

from __future__ import annotations

import asyncio
import gzip
import io
import logging
import math
import struct
import tarfile
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import httpx

from app.env import env_int
from app.services.errors import UpstreamError
from app.services.http import HEADERS
from app.services.snapshot import cache_factory

log = logging.getLogger(__name__)

PROVIDER = "NOAA NOHRSC SNODAS"

BASE_URL = "https://noaadata.apps.nsidc.org/NOAA/G02158/unmasked"

# SNODAS names each product by a code inside the member's filename; 1036 is the
# modelled snow depth. Selected by the code rather than by position in the
# archive, because a tar's member order is whatever the producer wrote and the
# day's file carries eight other products beside this one.
DEPTH_PRODUCT_CODE = "1036"

# One tar a day, so an hourly check is one HEAD request that almost always
# answers with the date already held. It is deliberately not daily: the file
# lands mid-morning UTC, and a pod started before then would otherwise serve
# yesterday's grid for a whole day after today's was published.
TTL_S = env_int("SNODAS_CACHE_TTL_S", 3600)

# How long a failed refresh suppresses the next attempt, for the reason
# nifc.py's and hms.py's twins spell out: without it every request during an
# outage becomes its own upstream attempt. Longer than theirs because the
# product changes once a day, so nothing is lost by waiting.
RETRY_AFTER_FAILURE_S = env_int("SNODAS_RETRY_AFTER_FAILURE_S", 300)

# Generous: the September archive measured 4.9 MB and a midwinter one is larger,
# off a government file server rather than a tuned API.
REQUEST_TIMEOUT_S = 120.0

INCHES_PER_METER = 39.3701

# The header keys this module cannot work without. Named as a set so a missing
# one fails the fetch by name, rather than as a KeyError three functions later.
_REQUIRED = (
    "number of columns",
    "number of rows",
    "no data value",
    "minimum x-axis coordinate",
    "maximum y-axis coordinate",
    "x-axis resolution",
    "y-axis resolution",
    "data bytes per pixel",
    "data units",
)

# Two bytes per sample, big-endian signed. Anything else is a different file
# than the one this reader was written against, and is refused rather than
# guessed at.
_BYTES_PER_PIXEL = 2
_SAMPLE = struct.Struct(">h")


def _bad(detail: str) -> UpstreamError:
    """A refusal a person can act on, carrying the user-facing sentence.

    The message is the overlays' own: nothing about a malformed grid is a thing
    a reader can fix, and the snapshot cache is what turns this into "keep
    serving what we have" rather than into anything on screen.
    """
    log.warning("SNODAS grid rejected: %s", detail)
    return UpstreamError("Snow depth data is unavailable. Try again later.")


def parse_header(text: str) -> dict[str, str]:
    """The ``key: value`` lines of a SNODAS header, lower-cased and trimmed.

    Every value stays a string. The caller converts the handful it needs, so a
    field this module does not use cannot fail the parse by being written in a
    shape nobody anticipated.
    """
    fields: dict[str, str] = {}
    for line in text.splitlines():
        key, sep, value = line.partition(":")
        if sep:
            fields[key.strip().lower()] = value.strip()
    return fields


def _units_divisor(declared: str) -> float:
    """What the stored integers are divided by to give metres.

    The header states this as ``Meters / 1000.000000``, so the divisor is read
    rather than baked in: the product has been published in other units before,
    and a hard-coded 1000 would silently report millimetres as metres if it
    ever is again.
    """
    base, sep, divisor = declared.partition("/")
    if not sep or base.strip().lower() not in ("meter", "meters"):
        raise _bad(f"data units {declared!r} are not metres")
    try:
        value = float(divisor)
    except ValueError as exc:
        raise _bad(f"data units {declared!r} carry no divisor") from exc
    if value <= 0:
        raise _bad(f"data units {declared!r} divide by {value}")
    return value


@dataclass(frozen=True)
class Snapshot:
    """One day's snow depth grid, with everything needed to index it.

    ``fetched_at_ms`` is wall time because it is a fact about this pod;
    freshness is tracked on the monotonic clock inside the cache, which is the
    one that must not move when the host's clock is corrected.
    """

    analysis_date: str
    fetched_at_ms: int
    columns: int
    rows: int
    min_x: float
    max_y: float
    res_x: float
    res_y: float
    no_data: int
    units_divisor: float
    samples: bytes

    def depth_in(self, latitude: float, longitude: float) -> float | None:
        """Today's snow depth at a coordinate, in inches, or None.

        None means one of two things a caller must not tell apart by guessing:
        the coordinate is outside the grid's box, or the grid holds the no-data
        value there (open water, and everything beyond the modelled domain
        inside the box). Both are "this was never measured", which is why the
        column reads N/A rather than zero.

        Floor rather than round for the CELL: a sample owns the cell that
        starts at its origin, and rounding would shift every answer half a cell
        north-west.

        The inches themselves are rounded to two places. The grid is whole
        millimetres, so the digits past that are the conversion factor's own
        binary noise (``1290.0400667000001`` for a reading of 32766 mm) and
        every surface that shows the number shows fewer digits than that.
        """
        column = math.floor((longitude - self.min_x) / self.res_x)
        row = math.floor((self.max_y - latitude) / self.res_y)
        if not (0 <= column < self.columns and 0 <= row < self.rows):
            return None
        value = _SAMPLE.unpack_from(self.samples, _BYTES_PER_PIXEL * (row * self.columns + column))[0]
        if value == self.no_data:
            return None
        return round(value / self.units_divisor * INCHES_PER_METER, 2)


# The month segment of a path, as NSIDC spells it. Spelled here rather than
# taken from ``%b``, which reads the C library's locale: a pod whose locale is
# not English would build ``09_sept`` and get a 404 for every day of the year.
_MONTH_ABBREVIATIONS = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)


def tar_url(day: date) -> str:
    """Where a day's archive lives. The month segment carries its own name, as
    ``09_Sep``, which is NSIDC's own layout rather than a choice here."""
    month = f"{day.month:02d}_{_MONTH_ABBREVIATIONS[day.month - 1]}"
    return f"{BASE_URL}/{day:%Y}/{month}/SNODAS_unmasked_{day:%Y%m%d}.tar"


def _members(archive: tarfile.TarFile) -> tuple[str, str]:
    """The depth product's data and header member names.

    The pair is matched on the shared stem rather than on two independent
    searches, so a header from one product can never be read against another's
    array.
    """
    names = archive.getnames()
    data = next(
        (n for n in names if DEPTH_PRODUCT_CODE in n and n.endswith(".dat.gz")), None
    )
    if data is None:
        raise _bad(f"no {DEPTH_PRODUCT_CODE} data member in the archive")
    header = data[: -len(".dat.gz")] + ".txt.gz"
    if header not in names:
        raise _bad(f"no header beside {data}")
    return data, header


def _read(archive: tarfile.TarFile, name: str) -> bytes:
    member = archive.extractfile(name)
    if member is None:
        raise _bad(f"{name} is not a readable member")
    return gzip.decompress(member.read())


def read_tar(payload: bytes, day: date) -> Snapshot:
    """One day's archive as a snapshot, or a refusal naming what was wrong.

    Synchronous, and run off the event loop by its caller: decompressing 64 MiB
    is CPU work, and an ``async`` function holding the loop blocks every other
    request on the pod while it runs.
    """
    with tarfile.open(fileobj=io.BytesIO(payload)) as archive:
        data_name, header_name = _members(archive)
        header = parse_header(_read(archive, header_name).decode("utf-8", "replace"))
        samples = _read(archive, data_name)

    missing = [key for key in _REQUIRED if key not in header]
    if missing:
        raise _bad(f"header is missing {', '.join(missing)}")
    if header["data bytes per pixel"] != str(_BYTES_PER_PIXEL):
        raise _bad(f"{header['data bytes per pixel']} bytes per pixel, expected {_BYTES_PER_PIXEL}")

    try:
        columns = int(header["number of columns"])
        rows = int(header["number of rows"])
        min_x = float(header["minimum x-axis coordinate"])
        max_y = float(header["maximum y-axis coordinate"])
        res_x = float(header["x-axis resolution"])
        res_y = float(header["y-axis resolution"])
        no_data = int(float(header["no data value"]))
    except ValueError as exc:
        raise _bad(f"header holds an unreadable number: {exc}") from exc
    if columns <= 0 or rows <= 0 or res_x <= 0 or res_y <= 0:
        raise _bad(f"header describes a {columns}x{rows} grid at {res_x}x{res_y} degrees")

    expected = columns * rows * _BYTES_PER_PIXEL
    if len(samples) != expected:
        raise _bad(f"{len(samples)} bytes of samples where the header says {expected}")

    return Snapshot(
        analysis_date=day.isoformat(),
        fetched_at_ms=int(time.time() * 1000),
        columns=columns,
        rows=rows,
        min_x=min_x,
        max_y=max_y,
        res_x=res_x,
        res_y=res_y,
        no_data=no_data,
        units_divisor=_units_divisor(header["data units"]),
        samples=samples,
    )


def _held() -> Snapshot | None:
    """Whatever the module's own cache holds. Passed as a default rather than
    read inline so a test can hand the fetch a grid of its own."""
    return GRID.snapshot_or_none


async def fetch_snapshot(
    held: Callable[[], Snapshot | None] = _held,
    now: datetime | None = None,
) -> Snapshot:
    """The current analysis, downloading only when the held one is not it.

    Two days are tried, today and yesterday, because the day's archive is
    published mid-morning UTC and before then yesterday's grid IS the current
    analysis. Each is checked with a HEAD first — NSIDC answers those in
    milliseconds — so the hourly refresh of an unchanged day costs one small
    request rather than 4.9 MB.

    The held-date check is what makes the refresh cheap on the common path: for
    most of the day the answer is "the grid you already have", and re-reading
    64 MiB to learn that would be the whole cost of the TTL.
    """
    today = (now or datetime.now(UTC)).date()
    current = held()
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S, headers=HEADERS) as client:
        for day in (today, today - timedelta(days=1)):
            if current is not None and current.analysis_date == day.isoformat():
                return current
            url = tar_url(day)
            probe = await client.head(url)
            if probe.status_code == 404:
                log.info("SNODAS has no archive for %s yet; falling back a day", day.isoformat())
                continue
            probe.raise_for_status()
            response = await client.get(url)
            response.raise_for_status()
            return await asyncio.to_thread(read_tar, response.content, day)
    raise UpstreamError("Snow depth data is unavailable. Try again later.")


snow_cache = cache_factory(
    label=PROVIDER,
    fetch=fetch_snapshot,
    ttl_s=TTL_S,
    retry_after_failure_s=RETRY_AFTER_FAILURE_S,
    describe=lambda s: f"{s.columns}x{s.rows} grid analyzed {s.analysis_date}",
)

GRID = snow_cache()


def fill_snow_depth(destinations: list[dict]) -> str | None:
    """Set ``snow_depth_in`` on every row, and say which grid answered.

    **Nothing here ever waits for a grid.** A cold or aged cache schedules its
    own refresh and the call returns immediately, so the first analysis after a
    pod restart answers nulls rather than holding a visitor for a 4.9 MB
    download. Every row then reads N/A, which is the same thing a destination
    outside the grid reads and is answered by the same absent date: a report
    whose rows have no depth also has no analysis date to caption itself with.

    The return is the date the numbers came from rather than a flag, because a
    snow ranking states it on screen and a stale grid is only honest if it says
    which day it is.
    """
    snapshot = GRID.current_or_schedule()
    for destination in destinations:
        destination["snow_depth_in"] = (
            None
            if snapshot is None
            else snapshot.depth_in(destination["latitude"], destination["longitude"])
        )
    return None if snapshot is None else snapshot.analysis_date


async def warm_up() -> None:
    """Fetch the grid once at startup, behind everything else.

    Scheduled by the lifespan rather than awaited by it: a pod that cannot
    start until NSIDC answers is a pod one upstream outage keeps out of the
    load balancer, and the fill above already degrades to nulls. Every failure
    is swallowed for the same reason — the cache has already logged it, and the
    next request's schedule will try again once the backoff is up.
    """
    try:
        await GRID.get()
    except Exception as exc:  # noqa: BLE001 — a warm-up must never take the pod with it
        log.warning("SNODAS warm-up failed; the first analyses will report no snow depth: %s", exc)
