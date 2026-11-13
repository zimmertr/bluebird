"""A year of daily snow depth at every place, and what a window reads from it (#849).

`snodas.py` holds today's grid. This module keeps the days before it: one pod
at a time, under the refresh lock, it downloads NSIDC's daily file for every
day of the last `KEEP_DAYS` it has not dealt with, samples the cell under
every place the places table holds inside the grid, and writes one row per
cell per month to `snow_depth_days`. The newest month fills first, a few days
a run, so a fresh database has the last weeks within the hour and the whole
year in about four hours, at two NSIDC downloads a minute. After that a run
costs one HEAD for a day not published yet.

Only cells that hold a place are kept: 181,417 of the grid's 33.5 million on
2026-11-12, which is what makes a year about 350 MB rather than the 24 GB the
grid itself would be. A pasted coordinate in a cell no place shares reads
today's depth and no history.

A window reads each of its UTC days up to the newest day the history holds,
and every day after that as that newest depth (TJ, 2026-11-12): a trip next
week is ranked on the snow there now, where no source forecasts depth a reader
could trust (Open-Meteo's, measured 2026-11-12: GFS 28 m at Paradise while its
SNOTEL station read 0 to 2 in). The daily list it returns stops at that newest
day, so the chart draws only what was measured.

Nothing here may fail a route. A pod with no database, or one whose schema is
older than this release, reads today's grid alone.
"""

from __future__ import annotations

import asyncio
import logging
import struct
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

import httpx
from psycopg import AsyncConnection

from app import db
from app.db import refresh
from app.limits import ARCHIVE_DATA_DAYS
from app.services import snodas
from app.services.http import HEADERS

log = logging.getLogger(__name__)

# The unmasked grid's shape, as every file since 2009 declares it. The cell
# numbers in the table are positions in this grid, so a file of another shape
# is refused rather than written into the wrong cells.
COLUMNS = 8192
ROWS = 4096
MIN_X = -130.516666666661
MAX_Y = 58.233333333331
RES = 1 / 120
_TOLERANCE = 1e-6
MAX_X = MIN_X + COLUMNS * RES
MIN_Y = MAX_Y - ROWS * RES

# A year back, the calendar's own reach, so every past window it offers has
# depth, plus today.
KEEP_DAYS = ARCHIVE_DATA_DAYS + 1
# Days fetched per run, and how often a run comes round. Eight days of 5 to 40
# MB at most every five minutes is about two downloads a minute.
DAYS_PER_RUN = 8
INTERVAL_S = 300.0
DEADLINE_S = 900.0
# A file NSIDC has not published by then never will be: a 404 for a day older
# than this is recorded as missing rather than asked again.
PUBLISH_GRACE_DAYS = 2

_SAMPLE = struct.Struct(">h")


def cell_of(latitude: float, longitude: float) -> int | None:
    """The grid cell under a coordinate, or None outside the grid's box."""
    column = int((longitude - MIN_X) // RES)
    row = int((MAX_Y - latitude) // RES)
    if not (0 <= column < COLUMNS and 0 <= row < ROWS):
        return None
    return row * COLUMNS + column


def inches(mm: int | None) -> float | None:
    """Stored millimetres as inches, by the conversion `Snapshot.depth_in` uses,
    so a day read from the table and today's grid agree to the hundredth."""
    return None if mm is None else round(mm / 1000 * snodas.INCHES_PER_METER, 2)


def _same_grid(snap: snodas.Snapshot) -> bool:
    return (
        snap.columns == COLUMNS
        and snap.rows == ROWS
        and abs(snap.min_x - MIN_X) < _TOLERANCE
        and abs(snap.max_y - MAX_Y) < _TOLERANCE
        and abs(snap.res_x - RES) < _TOLERANCE
        and abs(snap.res_y - RES) < _TOLERANCE
        and snap.units_divisor == 1000
    )


def sample(snap: snodas.Snapshot, cells: list[int]) -> list[int | None]:
    """Each cell's depth in millimetres, None where the file has no data."""
    out: list[int | None] = []
    for cell in cells:
        value = _SAMPLE.unpack_from(snap.samples, 2 * cell)[0]
        out.append(None if value == snap.no_data or value < 0 else value)
    return out


# --- writing ---------------------------------------------------------------


_CELLS_SQL = """
SELECT DISTINCT
    (floor((%(max_y)s - ST_Y(geom)) / %(res)s)::int * %(columns)s
     + floor((ST_X(geom) - %(min_x)s) / %(res)s)::int) AS cell
FROM places
WHERE geom && ST_MakeEnvelope(%(min_x)s, %(min_y)s, %(max_x)s, %(max_y)s, 4326)
ORDER BY cell
"""

_UPSERT_SQL = """
INSERT INTO snow_depth_days (cell, month, depth_mm)
SELECT v.cell, %(month)s::date, v.depths::smallint[]
FROM unnest(%(cells)s::int[], %(depths)s::text[]) AS v(cell, depths)
ON CONFLICT (cell, month) DO UPDATE SET depth_mm = ARRAY(
    SELECT coalesce(t.fresh, t.held)
    FROM unnest(EXCLUDED.depth_mm, snow_depth_days.depth_mm) WITH ORDINALITY AS t(fresh, held, i)
    ORDER BY t.i
)
"""


def pending_days(done: set[date], today: date) -> list[date]:
    """The days to fetch next: the newest month with any undone, its newest first.

    One month a run, so each row is written once per run rather than once per
    day, and the newest weeks fill before the oldest.
    """
    first = today - timedelta(days=KEEP_DAYS - 1)
    todo = [today - timedelta(days=n) for n in range(KEEP_DAYS) if today - timedelta(days=n) not in done]
    todo = [d for d in todo if d >= first]
    if not todo:
        return []
    month = (todo[0].year, todo[0].month)
    return [d for d in todo if (d.year, d.month) == month][:DAYS_PER_RUN]


def _array_literal(values: list[int | None]) -> str:
    return "{" + ",".join("NULL" if v is None else str(v) for v in values) + "}"


async def _fetch_day(client: httpx.AsyncClient, day: date, today: date) -> snodas.Snapshot | str | None:
    """A day's grid, an outcome to record (`refused`, `missing`), or None to ask later."""
    held = snodas.GRID.snapshot_or_none
    if isinstance(held, snodas.Snapshot) and held.analysis_date == day.isoformat():
        return held if _same_grid(held) else "refused"
    url = snodas.tar_url(day)
    probe = await client.head(url)
    if probe.status_code == 404:
        return "missing" if (today - day).days > PUBLISH_GRACE_DAYS else None
    probe.raise_for_status()
    try:
        payload = await snodas._download(client, url)
        snap = await asyncio.to_thread(snodas.read_tar, payload, day)
    except snodas.RefusedGrid as exc:
        log.warning("SNODAS file for %s refused for the history: %s", day.isoformat(), exc)
        return "refused"
    if not _same_grid(snap):
        log.warning("SNODAS file for %s is not the unmasked grid; not kept", day.isoformat())
        return "refused"
    return snap


async def run(now: datetime | None = None) -> None:
    """One refresh: fill up to `DAYS_PER_RUN` days, then drop what is past a year."""
    today = (now or datetime.now(UTC)).date()
    first = today - timedelta(days=KEEP_DAYS - 1)
    async with db.connection() as conn:
        rows = await (
            await conn.execute("SELECT day FROM snow_depth_filled WHERE day >= %s", (first,))
        ).fetchall()
        days = pending_days({r[0] for r in rows}, today)
        if days:
            await _fill(conn, days, today)
        await conn.execute(
            "DELETE FROM snow_depth_days WHERE month < %s",
            (first.replace(day=1),),
        )
        await conn.execute("DELETE FROM snow_depth_filled WHERE day < %s", (first,))


async def _fill(conn: AsyncConnection, days: list[date], today: date) -> None:
    params = {
        "min_x": MIN_X,
        "max_x": MAX_X,
        "min_y": MIN_Y,
        "max_y": MAX_Y,
        "res": RES,
        "columns": COLUMNS,
    }
    cells = [r[0] for r in await (await conn.execute(_CELLS_SQL, params)).fetchall()]
    month = days[0].replace(day=1)
    by_cell: list[list[int | None]] = [[None] * 31 for _ in cells]
    outcomes: dict[date, str] = {}
    async with httpx.AsyncClient(timeout=snodas.REQUEST_TIMEOUT_S, headers=HEADERS) as client:
        for day in days:
            got = await _fetch_day(client, day, today)
            if got is None:
                continue
            if isinstance(got, str):
                outcomes[day] = got
                continue
            values = await asyncio.to_thread(sample, got, cells)
            for i, mm in enumerate(values):
                by_cell[i][day.day - 1] = mm
            outcomes[day] = "filled"
    # One transaction, so a day is never recorded as filled without its depths.
    async with conn.transaction():
        if any(o == "filled" for o in outcomes.values()):
            await conn.execute(
                _UPSERT_SQL,
                {"month": month, "cells": cells, "depths": [_array_literal(v) for v in by_cell]},
            )
        for day, outcome in outcomes.items():
            await conn.execute(
                "INSERT INTO snow_depth_filled (day, outcome) VALUES (%s, %s)"
                " ON CONFLICT (day) DO UPDATE SET outcome = EXCLUDED.outcome, filled_at = now()",
                (day, outcome),
            )
    log.info(
        "Snow depth history: %s for %d cells",
        ", ".join(f"{d.isoformat()} {o}" for d, o in sorted(outcomes.items())) or "nothing new",
        len(cells),
    )


SOURCE = refresh.Source("snow-history", INTERVAL_S, run, deadline_s=DEADLINE_S)
refresh.register(SOURCE)


# --- reading ---------------------------------------------------------------


@dataclass(frozen=True)
class WindowDepth:
    """What a window reads at one point.

    `days` runs from the window's first UTC day to its last or the newest day
    measured, whichever is sooner, each with its depth in inches or None. The
    three aggregates also count every day after the newest as the newest depth.
    """

    avg_in: float | None
    min_in: float | None
    max_in: float | None
    days: list[tuple[date, float | None]]


def window_days(start: datetime, end: datetime) -> list[date]:
    first, last = start.astimezone(UTC).date(), end.astimezone(UTC).date()
    return [first + timedelta(days=n) for n in range((last - first).days + 1)]


def summarize(days: list[date], depths: dict[date, float | None], newest: date | None) -> WindowDepth:
    """The window's daily list and its aggregates, from one point's depths by day."""
    measured = [(d, depths.get(d)) for d in days if newest is not None and d <= newest]
    latest = depths.get(newest) if newest is not None else None
    counted = [v for _, v in measured if v is not None]
    counted += [latest for d in days if (newest is None or d > newest) and latest is not None]
    if not counted:
        return WindowDepth(None, None, None, measured)
    return WindowDepth(
        avg_in=round(sum(counted) / len(counted), 2),
        min_in=min(counted),
        max_in=max(counted),
        days=measured,
    )


async def _stored(cells: list[int], first: date, last: date) -> tuple[dict[int, dict[date, float | None]], date | None]:
    """The stored depths of these cells between two days, and the newest day filled."""
    out: dict[int, dict[date, float | None]] = {}
    async with db.connection() as conn:
        newest_row = await (
            await conn.execute("SELECT max(day) FROM snow_depth_filled WHERE outcome = 'filled'")
        ).fetchone()
        rows = await (
            await conn.execute(
                "SELECT cell, month, depth_mm FROM snow_depth_days"
                " WHERE cell = ANY(%s) AND month BETWEEN %s AND %s",
                (cells, first.replace(day=1), last.replace(day=1)),
            )
        ).fetchall()
    for cell, month, depth_mm in rows:
        by_day = out.setdefault(cell, {})
        for i, mm in enumerate(depth_mm):
            try:
                day = month.replace(day=i + 1)
            except ValueError:
                break
            by_day[day] = inches(mm)
    return out, (newest_row[0] if newest_row else None)


async def window_depths(
    points: list[tuple[float, float]], start: datetime, end: datetime
) -> tuple[list[WindowDepth], date | None]:
    """What the window reads at each point, and the newest day measured.

    Today's grid answers for its own day wherever the history has no row, and
    is the newest day when the history has not caught up with it, so a pod
    with no database still ranks a window on today's depth.
    """
    days = window_days(start, end)
    cells = [cell_of(lat, lon) for lat, lon in points]
    stored: dict[int, dict[date, float | None]] = {}
    newest: date | None = None
    if db.available():
        try:
            wanted = sorted({c for c in cells if c is not None})
            stored, newest = await _stored(wanted, days[0], max(days[-1], days[0]))
        except Exception as exc:  # noqa: BLE001 — history is one column; it must never fail the route
            log.warning("Snow depth history could not be read: %r", exc)
            stored, newest = {}, None

    grid = snodas.GRID.current_or_schedule()
    grid_day = date.fromisoformat(grid.analysis_date) if isinstance(grid, snodas.Snapshot) else None
    if grid_day is not None and (newest is None or grid_day > newest):
        newest = grid_day

    # The newest day's depth needs its own row when the window does not reach it.
    if newest is not None and newest not in days and db.available():
        try:
            extra, _ = await _stored(sorted({c for c in cells if c is not None}), newest, newest)
            for cell, by_day in extra.items():
                stored.setdefault(cell, {}).update(by_day)
        except Exception as exc:  # noqa: BLE001 — as above
            log.warning("Snow depth history could not be read: %r", exc)

    results: list[WindowDepth] = []
    for (lat, lon), at in zip(points, cells, strict=True):
        depths = dict(stored.get(at, {})) if at is not None else {}
        if grid_day is not None and depths.get(grid_day) is None and isinstance(grid, snodas.Snapshot):
            try:
                depths[grid_day] = grid.depth_in(lat, lon)
            except Exception:  # noqa: BLE001 — a bad grid reads as no depth
                depths[grid_day] = None
        results.append(summarize(days, depths, newest))
    return results, newest
