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
header missing any of them, holding a number that is not finite, or declaring
anything other than two bytes per pixel, refuses the file, because an array
read with the wrong geometry answers confident nonsense rather than nothing.

**A refused file is no grid for its day, not yesterday's grid.** The download,
the outer archive and each member are bounded before they are read, and a file
that breaks a bound or a header check is held as :class:`Refused` for its
analysis date: every row reads null until the next day's file, and the hourly
check finds the day in hand rather than downloading the same file again. The
grid before it is not kept, because its date would caption a column the reader
takes for today's (decision 0104). An NSIDC that cannot be reached is a
different case, and still leaves the last good grid standing with its date.
"""

from __future__ import annotations

import asyncio
import io
import logging
import math
import struct
import tarfile
import time
import zlib
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import IO, NamedTuple

import httpx

from app import telemetry
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

# The most of one day's archive the pod will download. Measured 2026-10-06 by
# HEAD at NSIDC over thirteen days: 6.3 MB on 2026-10-05, 35 to 45 MB through
# the 2023 to 2026 winters, and 48.0 MB at the largest, 2026-01-25. Twice that,
# so a bigger winter is still read, while a file that is not the archive cannot
# be held in memory whole: the download sits beside the grid in the pod's
# memory until it is parsed.
MAX_ARCHIVE_BYTES = 96 * 2**20

# The most the header member may inflate to. The real one is 3,381 bytes
# (2026-10-05), sixty-odd `key: value` lines, so this is about twenty times
# that and still nothing a pod notices.
MAX_HEADER_BYTES = 64 * 2**10

# The largest grid the header may declare, and so the most the data member may
# inflate to. Today's is 8192 by 4096 two-byte samples, 64 MiB (#449); twice
# that leaves room for NSIDC to widen the extent, which it has done to the
# masked product once, without letting a header claim an array the pod cannot
# hold. The bound is checked against the header before any sample is read.
MAX_GRID_BYTES = 128 * 2**20

# How much compressed input each step of the bounded inflate takes. Small,
# because one step can inflate a long run of zeros a thousandfold before the
# output bound stops it.
_INFLATE_STEP_BYTES = 64 * 2**10

INCHES_PER_METER = 39.3701

# The largest depth the file can carry, in inches, and the number a glaciated
# summit therefore reads. Depth is int16 millimetres, so 32,767 mm is the
# ceiling and the header states it as `Maximum data value`; through the
# `Meters / 1000` divisor and the factor above that is 1290.0400667 in, rounded
# to the two decimals `depth_in` rounds to. The model holds more than this over
# deep ice and the file clips it: NOAA's map service reported 68.62 m at Mount
# Rainier's summit on 2026-09-16 where the tar read 32.77 m. Nothing here
# corrects that, because the correction is not in the file; the browser marks a
# row at the ceiling as "at least" instead, which is why this is a mirrored
# constant rather than a private one.
_INT16_MAX_MM = 32767
SNOW_DEPTH_CEILING_IN = round(_INT16_MAX_MM / 1000 * INCHES_PER_METER, 2)

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
    "maximum data value",
)

# Two bytes per sample, big-endian signed. Anything else is a different file
# than the one this reader was written against, and is refused rather than
# guessed at.
_BYTES_PER_PIXEL = 2
_SAMPLE = struct.Struct(">h")


class RefusedGrid(UpstreamError):
    """The day's file broke a bound or a header check.

    Its own class because the fetch answers it differently from an NSIDC that
    cannot be reached: a refusal stands for its day as :class:`Refused`, where
    an outage leaves the last good grid standing.
    """


def _bad(detail: str) -> RefusedGrid:
    """A refusal a person can act on, carrying the user-facing sentence.

    The message is the overlays' own: nothing about a malformed grid is a thing
    a reader can fix, and the fetch turns this into a null column for the day
    rather than into anything on screen.
    """
    log.warning("SNODAS grid rejected: %s", detail)
    return RefusedGrid("Snow depth data is unavailable. Try again later.")


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
    if not math.isfinite(value) or value <= 0:
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
        binary noise (``1290.0400667000001`` at the ceiling below) and every
        surface that shows the number shows fewer digits than that.

        **The answer saturates at 1290.04 in.** Depth is int16 millimetres, so
        32,767 mm is the largest the file can carry, and the header says so
        (``Maximum data value: 32767``). Over deep ice the model holds more and
        the file clips it: NOAA's map service reported 68.62 m at Mount
        Rainier's summit on 2026-09-16, where the tar reads 32.77 m. Measured
        2026-09-22, 86 of the grid's 13,128 snow-bearing cells sit on that
        ceiling. Nothing here corrects it, because the correction is not in the
        file; a row at 1290.04 means "at least this much, and permanent ice".
        """
        column = math.floor((longitude - self.min_x) / self.res_x)
        row = math.floor((self.max_y - latitude) / self.res_y)
        if not (0 <= column < self.columns and 0 <= row < self.rows):
            return None
        value = _SAMPLE.unpack_from(self.samples, _BYTES_PER_PIXEL * (row * self.columns + column))[0]
        if value == self.no_data:
            return None
        return round(value / self.units_divisor * INCHES_PER_METER, 2)


@dataclass(frozen=True)
class Refused:
    """A day whose file was refused, held in the grid's place.

    Held by the cache like a grid, for two reasons. The hourly check compares
    the held date before it downloads anything, so the same bad file is not
    fetched again every backoff. And the grid before it is replaced rather than
    kept, so no row reads yesterday's depth under today's report.
    """

    analysis_date: str


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


def _inflate(member: IO[bytes], name: str, limit: int) -> bytes:
    """A gzip member's content, refused the moment it passes ``limit`` bytes.

    ``gzip.decompress`` inflates the whole member before anyone can look at its
    size, so a member that inflates to gigabytes is in memory before it is
    refused. This feeds the compressed bytes through in small steps and asks
    each step for no more output than the bound has left, so nothing past the
    bound is ever produced. Several gzip members back to back are read as one,
    as ``gzip.decompress`` reads them, because the format allows it.
    """
    out: list[bytes] = []
    size = 0
    inflater = zlib.decompressobj(wbits=31)
    pending = b""
    try:
        while True:
            if not pending:
                pending = member.read(_INFLATE_STEP_BYTES)
                if not pending:
                    break
            if inflater.eof:
                inflater = zlib.decompressobj(wbits=31)
            chunk = inflater.decompress(pending, limit + 1 - size)
            size += len(chunk)
            if size > limit:
                raise _bad(f"{name} inflates past {limit} bytes")
            out.append(chunk)
            pending = inflater.unconsumed_tail or inflater.unused_data
    except zlib.error as exc:
        raise _bad(f"{name} is not gzip: {exc}") from exc
    if not inflater.eof:
        raise _bad(f"{name} ends before its gzip stream does")
    return b"".join(out)


def _read(archive: tarfile.TarFile, name: str, limit: int) -> bytes:
    member = archive.extractfile(name)
    if member is None:
        raise _bad(f"{name} is not a readable member")
    return _inflate(member, name, limit)


class _Geometry(NamedTuple):
    columns: int
    rows: int
    min_x: float
    max_y: float
    res_x: float
    res_y: float
    no_data: int
    units_divisor: float


def _geometry(header: dict[str, str]) -> _Geometry:
    """Everything the header must say before a sample is read, checked.

    Every number must be finite. ``float()`` reads ``nan`` and ``inf``, NaN
    passes every ``<= 0`` check below, and a grid built on either answered each
    lookup with a ``ValueError`` from ``math.floor``, which reached the routes
    as a 500 until the next day's file (#629).
    """
    missing = [key for key in _REQUIRED if key not in header]
    if missing:
        raise _bad(f"header is missing {', '.join(missing)}")
    if header["data bytes per pixel"] != str(_BYTES_PER_PIXEL):
        raise _bad(f"{header['data bytes per pixel']} bytes per pixel, expected {_BYTES_PER_PIXEL}")
    # Refused for the same reason as the byte width, and it matters more: a
    # file with another ceiling would still read as plausible numbers, and the
    # browser's "at least" mark would then be attached to the wrong depth with
    # nothing on screen saying so. Compared as a number because the header
    # writes it as `32767.0000000000`.
    declared_max = header["maximum data value"]
    try:
        ceiling_mm = int(float(declared_max))
    except (ValueError, OverflowError) as exc:
        raise _bad(f"maximum data value {declared_max!r} is not a number") from exc
    if ceiling_mm != _INT16_MAX_MM:
        raise _bad(f"maximum data value {ceiling_mm}, expected {_INT16_MAX_MM}")

    try:
        columns = int(header["number of columns"])
        rows = int(header["number of rows"])
        min_x = float(header["minimum x-axis coordinate"])
        max_y = float(header["maximum y-axis coordinate"])
        res_x = float(header["x-axis resolution"])
        res_y = float(header["y-axis resolution"])
        # `int(inf)` is an OverflowError rather than a ValueError.
        no_data = int(float(header["no data value"]))
    except (ValueError, OverflowError) as exc:
        raise _bad(f"header holds an unreadable number: {exc}") from exc
    if not all(math.isfinite(v) for v in (min_x, max_y, res_x, res_y)):
        raise _bad(f"header places the grid at {min_x}, {max_y} by {res_x}x{res_y} degrees")
    if columns <= 0 or rows <= 0 or res_x <= 0 or res_y <= 0:
        raise _bad(f"header describes a {columns}x{rows} grid at {res_x}x{res_y} degrees")
    if columns * rows * _BYTES_PER_PIXEL > MAX_GRID_BYTES:
        raise _bad(f"header declares a {columns}x{rows} grid, past {MAX_GRID_BYTES} bytes")

    return _Geometry(
        columns=columns,
        rows=rows,
        min_x=min_x,
        max_y=max_y,
        res_x=res_x,
        res_y=res_y,
        no_data=no_data,
        units_divisor=_units_divisor(header["data units"]),
    )


def read_tar(payload: bytes, day: date) -> Snapshot:
    """One day's archive as a snapshot, or a refusal naming what was wrong.

    Synchronous, and run off the event loop by its caller: decompressing 64 MiB
    is CPU work, and an ``async`` function holding the loop blocks every other
    request on the pod while it runs.

    The header is read and checked before the data member is touched, because
    the size it declares is the bound the data member is inflated against.
    The archive is opened as a plain tar: NSIDC publishes one uncompressed, and
    ``tarfile.open``'s default would unwrap a gzip, bz2 or xz layer around it,
    a second expansion that no bound here would see.
    """
    try:
        with tarfile.open(fileobj=io.BytesIO(payload), mode="r:") as archive:
            data_name, header_name = _members(archive)
            header = parse_header(
                _read(archive, header_name, MAX_HEADER_BYTES).decode("utf-8", "replace")
            )
            geometry = _geometry(header)
            expected = geometry.columns * geometry.rows * _BYTES_PER_PIXEL
            samples = _read(archive, data_name, expected)
    except tarfile.TarError as exc:
        raise _bad(f"the archive is not a plain tar: {exc}") from exc

    if len(samples) != expected:
        raise _bad(f"{len(samples)} bytes of samples where the header says {expected}")

    return Snapshot(
        analysis_date=day.isoformat(),
        fetched_at_ms=int(time.time() * 1000),
        samples=samples,
        **geometry._asdict(),
    )


async def _download(client: httpx.AsyncClient, url: str) -> bytes:
    """One archive, refused past ``MAX_ARCHIVE_BYTES`` before it is all held.

    Streamed rather than read with ``.content``, which buffers whatever the
    server sends. A declared length over the bound refuses before any body is
    read, and the count of bytes received refuses an answer that declares none.
    """
    async with client.stream("GET", url) as response:
        response.raise_for_status()
        declared = response.headers.get("content-length")
        if declared is not None and declared.isdigit() and int(declared) > MAX_ARCHIVE_BYTES:
            raise _bad(f"{url} declares {declared} bytes, past {MAX_ARCHIVE_BYTES}")
        chunks: list[bytes] = []
        received = 0
        async for chunk in response.aiter_bytes():
            received += len(chunk)
            if received > MAX_ARCHIVE_BYTES:
                raise _bad(f"{url} runs past {MAX_ARCHIVE_BYTES} bytes")
            chunks.append(chunk)
    return b"".join(chunks)


def _held() -> Snapshot | Refused | None:
    """Whatever the module's own cache holds. Passed as a default rather than
    read inline so a test can hand the fetch a grid of its own."""
    return GRID.snapshot_or_none


async def fetch_snapshot(
    held: Callable[[], Snapshot | Refused | None] = _held,
    now: datetime | None = None,
) -> Snapshot | Refused:
    """The current analysis, downloading only when the held one is not it.

    Two days are tried, today and yesterday, because the day's archive is
    published mid-morning UTC and before then yesterday's grid IS the current
    analysis. Each is checked with a HEAD first — NSIDC answers those in
    milliseconds — so the hourly refresh of an unchanged day costs one small
    request rather than 4.9 MB.

    The held-date check is what makes the refresh cheap on the common path: for
    most of the day the answer is "the grid you already have", and re-reading
    64 MiB to learn that would be the whole cost of the TTL. A refused day is
    held the same way, so it costs NSIDC one download rather than one per
    hourly check.

    A refused file answers :class:`Refused` for its own day. It does not fall
    back to the day before, which would serve an older grid in its place, and
    it is counted as a failed refresh, so the refresh-failure panel sees it.
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
            try:
                payload = await _download(client, url)
                return await asyncio.to_thread(read_tar, payload, day)
            except RefusedGrid:
                telemetry.SNAPSHOT_REFRESH_FAILURES.labels(provider=PROVIDER).inc()
                return Refused(day.isoformat())
    raise UpstreamError("Snow depth data is unavailable. Try again later.")


def _describe(held: Snapshot | Refused) -> str:
    if isinstance(held, Refused):
        return f"no grid for {held.analysis_date}: the file was refused"
    return f"{held.columns}x{held.rows} grid analyzed {held.analysis_date}"


snow_cache = cache_factory(
    label=PROVIDER,
    fetch=fetch_snapshot,
    ttl_s=TTL_S,
    retry_after_failure_s=RETRY_AFTER_FAILURE_S,
    describe=_describe,
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

    A refused day, and a grid whose lookup raises, read the same as no grid:
    null on every row and no date. Snow depth is one column of a report, and
    nothing about the grid may fail the discovery or the analysis it rides on
    (#629). The header checks are what keep a grid that raises out of the
    cache; this is the backstop if one gets past them.
    """
    held = GRID.current_or_schedule()
    depths: list[float | None] = [None] * len(destinations)
    analysis_date: str | None = None
    if isinstance(held, Snapshot):
        try:
            depths = [held.depth_in(d["latitude"], d["longitude"]) for d in destinations]
            analysis_date = held.analysis_date
        except Exception as exc:  # noqa: BLE001 — a bad grid must never fail the route it rides on
            log.warning("SNODAS grid for %s could not answer a lookup: %r", held.analysis_date, exc)
            depths = [None] * len(destinations)
    for destination, depth in zip(destinations, depths, strict=True):
        destination["snow_depth_in"] = depth
    return analysis_date


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
