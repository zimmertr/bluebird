"""A year of daily snow depth, and what a window reads from it (#849)."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from test_snodas import a_snapshot, hold_grid

from app import db
from app.main import app
from app.services import snow_history
from app.services.snow_history import WindowDepth, pending_days, summarize, window_days

client = TestClient(app)


# ── The grid's cells ───────────────────────────────────────────────────────


def test_a_cell_is_its_row_and_column_in_the_unmasked_grid():
    # The grid's north-west corner is cell 0, and the next cell east is 1.
    eps = snow_history.RES / 2
    assert snow_history.cell_of(snow_history.MAX_Y - eps, snow_history.MIN_X + eps) == 0
    assert snow_history.cell_of(snow_history.MAX_Y - eps, snow_history.MIN_X + 3 * eps) == 1
    assert snow_history.cell_of(snow_history.MAX_Y - 3 * eps, snow_history.MIN_X + eps) == snow_history.COLUMNS


def test_a_coordinate_outside_the_grid_has_no_cell():
    assert snow_history.cell_of(10.0, 10.0) is None
    assert snow_history.cell_of(60.0, -121.0) is None


def test_stored_millimetres_read_as_the_grid_reads_them():
    # 1000 mm is the 39.37 in today's grid answers for one metre, and the
    # file's ceiling is the ceiling the browser marks.
    assert snow_history.inches(1000) == 39.37
    assert snow_history.inches(32767) == 1290.04
    assert snow_history.inches(None) is None


# ── Which days to fetch ────────────────────────────────────────────────────


def test_the_newest_month_fills_first_a_few_days_a_run():
    today = date(2026, 11, 12)
    days = pending_days(set(), today)
    assert days == [date(2026, 11, 12 - n) for n in range(snow_history.DAYS_PER_RUN)]


def test_a_month_with_nothing_left_hands_over_to_the_one_before():
    today = date(2026, 11, 3)
    done = {date(2026, 11, d) for d in (1, 2, 3)}
    assert pending_days(done, today)[0] == date(2026, 10, 31)


@pytest.mark.db
async def test_a_day_not_published_yet_does_not_hold_the_older_months(database, monkeypatch):
    # The rehearsal on 2026-11-13: November filled, then every run asked for
    # today alone, which NSIDC publishes at about 13:15 UTC, and October never
    # started. A run that records nothing moves on to the month before.
    now = datetime(2026, 11, 14, 2, tzinfo=UTC)
    async with db.connection() as conn:
        for d in range(1, 14):
            await conn.execute(
                "INSERT INTO snow_depth_filled (day, outcome) VALUES (%s, 'filled')", (date(2026, 11, d),)
            )
    asked: list[list[date]] = []

    async def fake_fill(_conn, days, _today):
        asked.append(days)
        return date(2026, 11, 14) not in days

    monkeypatch.setattr(snow_history, "_fill", fake_fill)
    await snow_history.run(now)
    assert asked == [
        [date(2026, 11, 14)],
        [date(2026, 10, 31) - timedelta(days=n) for n in range(snow_history.DAYS_PER_RUN)],
    ]


@pytest.mark.db
async def test_one_failed_download_costs_its_own_day_and_ends_the_run(database, monkeypatch):
    # NSIDC answered one archive with a 500 on 2026-11-13 and the same file a
    # minute later. The days read around it are kept, the failed one is asked
    # again next run, and the run does not walk back into older months.
    now = datetime(2026, 11, 14, 20, tzinfo=UTC)
    bad = date(2026, 11, 12)

    async def fake_fetch(_client, day, _today):
        if day == bad:
            raise httpx.ConnectError("boom")
        return "missing"

    monkeypatch.setattr(snow_history, "_fetch_day", fake_fetch)
    await snow_history.run(now)
    async with db.connection() as conn:
        days = {r[0] for r in await (await conn.execute("SELECT day FROM snow_depth_filled")).fetchall()}
    asked = [date(2026, 11, 14) - timedelta(days=n) for n in range(snow_history.DAYS_PER_RUN)]
    assert days == set(asked) - {bad}


def test_nothing_older_than_a_year_is_asked_for():
    today = date(2026, 11, 12)
    done = {today - timedelta(days=n) for n in range(snow_history.KEEP_DAYS - 1)}
    assert pending_days(done, today) == [today - timedelta(days=snow_history.KEEP_DAYS - 1)]
    done.add(today - timedelta(days=snow_history.KEEP_DAYS - 1))
    assert pending_days(done, today) == []


# ── What a window reads ────────────────────────────────────────────────────


def test_a_window_reads_its_own_days_and_every_later_one_as_the_newest():
    # A week from four days ago to three days ahead (TJ, 2026-11-12): the
    # measured days are the window's own, and the three ahead read the newest.
    today = date(2026, 11, 12)
    days = [today + timedelta(days=n) for n in range(-4, 4)]
    depths = {today - timedelta(days=4): 10.0, today - timedelta(days=3): 12.0,
              today - timedelta(days=2): 20.0, today - timedelta(days=1): 18.0, today: 16.0}
    got = summarize(days, depths, today)
    assert [d for d, _ in got.days] == days[:5]
    counted = [10.0, 12.0, 20.0, 18.0, 16.0, 16.0, 16.0, 16.0]
    assert (got.min_in, got.max_in) == (10.0, 20.0)
    assert got.avg_in == round(sum(counted) / len(counted), 2)


def test_a_window_wholly_ahead_reads_the_newest_depth_on_every_day():
    today = date(2026, 11, 12)
    days = [today + timedelta(days=n) for n in range(5, 8)]
    got = summarize(days, {today: 42.0}, today)
    assert got == WindowDepth(42.0, 42.0, 42.0, [])


def test_a_day_with_no_depth_is_left_out_rather_than_read_as_bare_ground():
    days = [date(2026, 1, 1), date(2026, 1, 2)]
    got = summarize(days, {date(2026, 1, 2): 30.0}, date(2026, 1, 2))
    assert got.days == [(date(2026, 1, 1), None), (date(2026, 1, 2), 30.0)]
    assert (got.avg_in, got.min_in, got.max_in) == (30.0, 30.0, 30.0)


def test_nothing_measured_reads_null():
    got = summarize([date(2026, 1, 1)], {}, None)
    assert got == WindowDepth(None, None, None, [])


def test_a_window_is_its_utc_days():
    start = datetime(2026, 11, 10, 22, tzinfo=UTC)
    end = datetime(2026, 11, 12, 1, tzinfo=UTC)
    assert window_days(start, end) == [date(2026, 11, 10), date(2026, 11, 11), date(2026, 11, 12)]


# ── The route ──────────────────────────────────────────────────────────────


def _window(days_ahead: int = 1) -> tuple[str, str]:
    start = datetime.now(UTC).replace(minute=0, second=0, microsecond=0) + timedelta(days=days_ahead)
    return start.isoformat(), (start + timedelta(hours=23)).isoformat()


def test_the_route_reads_each_point_in_request_order(monkeypatch):
    hold_grid(monkeypatch, a_snapshot("2026-09-22"))
    start, end = _window()
    body = client.post(
        "/api/snow-depth",
        json={
            "points": [{"latitude": 38.5, "longitude": -99.5}, {"latitude": 10.0, "longitude": 10.0}],
            "start_datetime": start,
            "end_datetime": end,
        },
    ).json()
    assert body["snow_analysis_date"] == "2026-09-22"
    hundred, outside = body["points"]
    assert hundred["max_in"] == pytest.approx(100.0)
    assert hundred["days"] == []
    assert outside == {"avg_in": None, "min_in": None, "max_in": None, "days": []}


_HOUR = {"start_datetime": "2026-11-12T00:00:00Z", "end_datetime": "2026-11-12T01:00:00Z"}
_POINT = [{"latitude": 0, "longitude": 0}]


@pytest.mark.parametrize(
    "body",
    [
        {"points": [], **_HOUR},
        {"points": [{"latitude": 91, "longitude": 0}], **_HOUR},
        {"points": _POINT, "start_datetime": "2026-11-12T02:00:00Z", "end_datetime": "2026-11-12T01:00:00Z"},
        {"points": _POINT, "start_datetime": "2000-01-01T00:00:00Z", "end_datetime": "2000-01-02T00:00:00Z"},
        {"points": [{"latitude": 0, "longitude": 0, "name": "x"}], **_HOUR},
    ],
    ids=["no points", "latitude out of range", "end before start", "past the archive", "unknown field"],
)
def test_the_route_refuses_a_malformed_request(body):
    assert client.post("/api/snow-depth", json=body).status_code == 422


# ── The table (needs PostgreSQL) ───────────────────────────────────────────


async def _place(conn, osm_id: int, lat: float, lon: float) -> None:
    await conn.execute(
        "INSERT INTO places (osm_type, osm_id, kind, name, ele_ft, rank, geom)"
        " VALUES ('node', %s, 'peak', %s, 8000, 0, ST_SetSRID(ST_MakePoint(%s, %s), 4326))",
        (osm_id, f"Peak {osm_id}", lon, lat),
    )


@pytest.mark.db
async def test_a_run_writes_each_place_cells_days_and_a_window_reads_them_back(database, monkeypatch):
    today = date(2026, 11, 12)
    async with database.connection() as conn:
        await _place(conn, 1, 46.85, -121.76)
        await _place(conn, 2, 48.78, -121.81)
    # Each day's grid answers its day of the month in millimetres at every
    # cell, so a stored depth names the day it came from.
    async def fetch_day(_client, day, _today):
        return SimpleNamespace(day=day)

    monkeypatch.setattr(snow_history, "_fetch_day", fetch_day)
    monkeypatch.setattr(snow_history, "sample", lambda snap, cells: [snap.day.day * 100 for _ in cells])
    await snow_history.run(now=datetime(2026, 11, 12, 18, tzinfo=UTC))

    async with database.connection() as conn:
        filled = await (await conn.execute("SELECT day, outcome FROM snow_depth_filled ORDER BY day")).fetchall()
        rows = await (await conn.execute("SELECT count(*) FROM snow_depth_days")).fetchone()
    assert [d for d, _ in filled] == [today - timedelta(days=n) for n in range(snow_history.DAYS_PER_RUN)][::-1]
    assert {o for _, o in filled} == {"filled"}
    assert rows[0] == 2

    start = datetime(2026, 11, 10, tzinfo=UTC)
    end = datetime(2026, 11, 14, 12, tzinfo=UTC)
    (rainier, baker, valley), newest = await snow_history.window_depths(
        [(46.85, -121.76), (48.78, -121.81), (47.0, -100.0)], start, end
    )
    assert newest == today
    assert rainier.days == [(date(2026, 11, d), snow_history.inches(d * 100)) for d in (10, 11, 12)]
    # The 13th and 14th read the 12th's depth.
    assert rainier.max_in == snow_history.inches(1200)
    assert rainier.min_in == snow_history.inches(1000)
    assert baker == rainier
    # A cell no place shares has no history.
    assert valley == WindowDepth(None, None, None, [(date(2026, 11, d), None) for d in (10, 11, 12)])


@pytest.mark.db
async def test_a_second_run_merges_its_days_into_the_month_without_losing_the_first(database, monkeypatch):
    async with database.connection() as conn:
        await _place(conn, 1, 46.85, -121.76)

    async def fetch_day(_client, day, _today):
        return SimpleNamespace(day=day)

    monkeypatch.setattr(snow_history, "_fetch_day", fetch_day)
    monkeypatch.setattr(snow_history, "sample", lambda snap, cells: [snap.day.day * 10 for _ in cells])
    monkeypatch.setattr(snow_history, "DAYS_PER_RUN", 3)
    await snow_history.run(now=datetime(2026, 11, 12, 18, tzinfo=UTC))
    await snow_history.run(now=datetime(2026, 11, 12, 18, tzinfo=UTC))
    async with database.connection() as conn:
        row = await (await conn.execute("SELECT depth_mm FROM snow_depth_days")).fetchone()
    assert row[0][6:12] == [70, 80, 90, 100, 110, 120]


@pytest.mark.db
async def test_a_day_nsidc_never_published_is_recorded_and_not_asked_again(database, monkeypatch):
    async def fetch_day(_client, day, _today):
        return "missing"

    monkeypatch.setattr(snow_history, "_fetch_day", fetch_day)
    monkeypatch.setattr(snow_history, "DAYS_PER_RUN", 2)
    await snow_history.run(now=datetime(2026, 11, 12, 18, tzinfo=UTC))
    async with database.connection() as conn:
        filled = await (await conn.execute("SELECT outcome FROM snow_depth_filled")).fetchall()
        rows = await (await conn.execute("SELECT count(*) FROM snow_depth_days")).fetchone()
    assert [o for (o,) in filled] == ["missing", "missing"]
    assert rows[0] == 0


@pytest.mark.db
async def test_months_past_a_year_are_dropped(database):
    async with database.connection() as conn:
        await conn.execute(
            "INSERT INTO snow_depth_days (cell, month, depth_mm) "
            "VALUES (1, '2025-01-01', '{1}'), (1, '2026-11-01', '{1}')"
        )
        await conn.execute("INSERT INTO snow_depth_filled (day, outcome) SELECT d::date, 'filled'"
                           " FROM generate_series('2025-11-12'::date, '2026-11-12'::date, '1 day') d")
    await snow_history.run(now=datetime(2026, 11, 12, 18, tzinfo=UTC))
    async with database.connection() as conn:
        months = await (await conn.execute("SELECT month FROM snow_depth_days")).fetchall()
    assert [m for (m,) in months] == [date(2026, 11, 1)]
