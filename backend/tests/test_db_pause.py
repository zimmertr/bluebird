"""The shared cache in a pod whose database stops answering (docs/RELIABILITY.md, mitigation 7).

A database that cannot be reached is noticed once and skipped for
`db.PAUSE_S`, then one call tries it again. Every `psycopg.Error` a call
raises is the one `DatabaseUnavailable` its caller falls back on. These need
no PostgreSQL: a stand-in pool plays the database, and the clock is moved by
hand. What the real server does with the timeouts is in test_db.py.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any

import httpx
import psycopg
import pytest
from psycopg_pool import PoolTimeout

from app import db
from app.main import app
from app.models import DestinationType, GeoPolygon
from app.ratelimit import shared
from app.services import candidates, osm, places

RING = GeoPolygon(
    type="Polygon",
    coordinates=[[[-121.6, 47.4], [-121.4, 47.4], [-121.4, 47.6], [-121.6, 47.6], [-121.6, 47.4]]],
)


class _Clock:
    def __init__(self, now: float = 1000.0):
        self.now = now

    def __call__(self) -> float:
        return self.now


class _Cursor:
    def __init__(self, row: tuple[Any, ...] | None):
        self._row = row

    async def fetchone(self):
        return self._row

    async def fetchall(self):
        return [] if self._row is None else [self._row]


class _Conn:
    """A connection whose every statement is answered by `answer(sql)`.

    `answer` returns the row to hand back, or raises what the database would.
    """

    def __init__(self, answer):
        self._answer = answer
        self.statements: list[str] = []

    async def execute(self, sql, params=None):
        self.statements.append(sql)
        result = self._answer(sql)
        if asyncio.iscoroutine(result):
            result = await result
        return _Cursor(result)


class _Pool:
    """The pool `db.connection()` checks out of, or refuses with `refuse`."""

    def __init__(self, answer=lambda sql: (True,), refuse: Exception | None = None):
        self.conn = _Conn(answer)
        self.refuse = refuse
        self.checkouts = 0

    @asynccontextmanager
    async def connection(self, timeout=None):
        self.checkouts += 1
        if self.refuse is not None:
            raise self.refuse
        yield self.conn


@pytest.fixture
def clock(monkeypatch) -> _Clock:
    clock = _Clock()
    monkeypatch.setattr(db.BREAKER, "_clock", clock)
    return clock


@pytest.fixture
def pool(monkeypatch):
    """Install a stand-in pool as a connected shared cache; returns a setter."""

    def install(**kwargs) -> _Pool:
        fake = _Pool(**kwargs)
        monkeypatch.setattr(db, "_pool", fake)
        return fake

    monkeypatch.setattr(db, "_ready", True)
    places._forget()
    yield install
    places._forget()


# ── The pause ───────────────────────────────────────────────────────────────


def test_the_pause_is_the_guards_thirty_seconds():
    # One number for every pause on a pod: the readers' and the guards'.
    assert db.PAUSE_S == 30.0
    assert shared._PAUSE.pause_s == db.PAUSE_S


async def test_a_database_with_no_connection_to_give_is_skipped_for_the_pause(pool, clock):
    fake = pool(refuse=PoolTimeout("couldn't get a connection after 5.00 sec"))
    with pytest.raises(db.DatabaseUnavailable):
        async with db.connection():
            pass
    assert not db.available() and not db.writable()

    # Every call inside the pause is refused at once, without a checkout.
    with pytest.raises(db.DatabaseUnavailable):
        async with db.connection():
            pass
    assert fake.checkouts == 1

    clock.now += db.PAUSE_S - 1
    assert not db.available()
    clock.now += 1
    assert db.available()


async def test_once_the_pause_passes_one_call_tries_again_and_the_rest_wait_on_it(pool, clock):
    fake = pool(refuse=PoolTimeout("timeout"))
    with pytest.raises(db.DatabaseUnavailable):
        async with db.connection():
            pass
    clock.now += db.PAUSE_S
    fake.refuse = None

    async with db.connection() as conn:
        # While the probe is out, every other caller still skips.
        assert not db.available()
        with pytest.raises(db.DatabaseUnavailable):
            async with db.connection():
                pass
        await conn.execute("SELECT 1")
    # It answered, so the database is back for everyone.
    assert db.available()
    async with db.connection():
        pass
    assert fake.checkouts == 3


async def test_a_probe_that_fails_pauses_again(pool, clock):
    fake = pool(refuse=psycopg.OperationalError("connection refused"))
    for _ in range(2):
        with pytest.raises(db.DatabaseUnavailable):
            async with db.connection():
                pass
        clock.now += db.PAUSE_S - 1
        assert not db.available()
        clock.now += 1
    assert fake.checkouts == 2


async def test_a_cancelled_probe_leaves_the_next_call_to_try(pool, clock):
    fake = pool(refuse=PoolTimeout("timeout"))
    with pytest.raises(db.DatabaseUnavailable):
        async with db.connection():
            pass
    clock.now += db.PAUSE_S
    fake.refuse = None
    started = asyncio.Event()

    async def hold():
        async with db.connection():
            started.set()
            await asyncio.sleep(30)

    task = asyncio.create_task(hold())
    await started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    # A cancellation says nothing about the database: the pause stays over
    # and the next call is the probe.
    assert db.available()
    async with db.connection():
        pass
    assert db.available()


async def test_a_connection_that_breaks_mid_call_pauses_every_reader(pool, clock):
    def broken(sql):
        raise psycopg.OperationalError("server closed the connection unexpectedly")

    pool(answer=broken)
    with pytest.raises(db.DatabaseUnavailable):
        async with db.connection() as conn:
            await conn.execute("SELECT 1")
    assert not db.available()


async def test_a_call_past_its_deadline_pauses_every_reader(pool, clock, monkeypatch):
    # The server enforces the statement timeout only while it can answer, so a
    # half-open connection is ended by the pod's own deadline.
    async def hung(sql):
        await asyncio.sleep(30)

    pool(answer=hung)
    monkeypatch.setattr(db, "CALL_DEADLINE_S", 0.05)
    with pytest.raises(db.DatabaseUnavailable, match="no answer"):
        async with db.connection() as conn:
            await conn.execute("SELECT 1")
    assert not db.available()


async def test_an_unbounded_call_has_no_deadline_and_lifts_the_statement_timeout(pool, clock, monkeypatch):
    async def slow(sql):
        await asyncio.sleep(0.1)
        return (True,)

    fake = pool(answer=slow)
    monkeypatch.setattr(db, "CALL_DEADLINE_S", 0.01)
    async with db.connection(unbounded=True) as conn:
        await conn.execute("SELECT 1")
    assert db.available()
    assert fake.conn.statements[0] == "SET statement_timeout = 0"
    # Returned to the pool, the connection gets the readers' timeout back.
    await db._reset(fake.conn)
    assert fake.conn.statements[-1] == f"SET statement_timeout = {int(db.STATEMENT_TIMEOUT_S * 1000)}"
    # A connection that was never lifted costs its return no round trip.
    count = len(fake.conn.statements)
    await db._reset(fake.conn)
    assert len(fake.conn.statements) == count


async def test_an_error_in_the_callers_own_code_is_not_the_databases(pool, clock):
    pool()
    with pytest.raises(KeyError):
        async with db.connection():
            raise KeyError("row")
    assert db.available()


# ── Every psycopg.Error is the one fallback ─────────────────────────────────


async def test_a_statement_past_its_timeout_fails_that_call_alone(pool, clock):
    # A box drawn round the world reads too much; the database is fine, so
    # nothing else on the pod is sent down its per-pod path.
    def cancelled(sql):
        raise psycopg.errors.QueryCanceled("canceling statement due to statement timeout")

    pool(answer=cancelled)
    with pytest.raises(db.DatabaseUnavailable):
        async with db.connection() as conn:
            await conn.execute("SELECT 1")
    assert db.available()


async def test_a_statement_the_database_refuses_falls_back_and_is_logged_as_a_bug(pool, clock, caplog):
    def refused(sql):
        raise psycopg.errors.UndefinedColumn('column "rank" does not exist')

    pool(answer=refused)
    with caplog.at_level(logging.ERROR, logger="app.db"), pytest.raises(db.DatabaseUnavailable):
        async with db.connection() as conn:
            await conn.execute("SELECT rank FROM places")
    assert db.available()
    [record] = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert record.exc_info is not None


def _refusing_after_fill(sql):
    # The fill state reads; the search after it hits a schema it cannot read.
    if "osm_state" in sql:
        return (True,)
    raise psycopg.errors.InternalError("could not open relation")


async def test_a_refused_search_asks_overpass_rather_than_failing(pool, clock, monkeypatch):
    pool(answer=_refusing_after_fill)
    asked = []

    async def overpass(polygon, types, on_status=None, **kwargs):
        asked.append(types)
        return [{"name": "Live", "type": "peak", "latitude": 47.5, "longitude": -121.5,
                 "elevation_ft": None, "osm_id": "node/1"}]

    monkeypatch.setattr(osm, "query_osm", overpass)
    rows = await candidates.discover(RING, [DestinationType.peak])
    assert [r["name"] for r in rows] == ["Live"]
    assert asked == [[DestinationType.peak]]


async def test_a_refused_lookup_or_marker_read_steps_aside(pool, clock):
    pool(answer=_refusing_after_fill)
    assert await places.summits_near([{"latitude": 47.5, "longitude": -121.5}], 300.0) is None
    assert await places.landmarks((-121.6, 47.4, -121.4, 47.6)) is None


async def test_capabilities_answer_with_a_database_that_refuses(pool, clock):
    def refused(sql):
        raise psycopg.errors.InternalError("could not open relation")

    pool(answer=refused)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/capabilities")
    assert response.status_code == 200
    assert response.json()["discovery_source"] == "overpass"


async def test_while_paused_no_reader_waits_on_the_database(pool, clock, monkeypatch):
    fake = pool(refuse=PoolTimeout("timeout"))
    assert not await places.is_filled()
    checkouts = fake.checkouts
    assert await places.discover(RING, [DestinationType.peak]) is None
    assert await places.summits_near([{"latitude": 47.5, "longitude": -121.5}], 300.0) is None
    assert await places.landmarks((-121.6, 47.4, -121.4, 47.6)) is None
    assert fake.checkouts == checkouts


# ── The guards keep a pause of their own ────────────────────────────────────


async def test_a_guard_too_slow_for_its_bound_leaves_the_readers_alone(monkeypatch):
    # A database that misses a guard's half second still answers a ring in
    # time, so only the guards stop asking it.
    @asynccontextmanager
    async def slow():
        await asyncio.sleep(10)
        yield None

    monkeypatch.setattr(db, "writable", lambda: True)
    monkeypatch.setattr(db, "connection", slow)
    monkeypatch.setattr(shared, "TIMEOUT_S", 0.01)
    shared.reset()
    try:
        with pytest.raises(db.DatabaseUnavailable):
            await shared.run("test", lambda conn: asyncio.sleep(0))
        assert not shared.usable()
        assert not db.BREAKER.skipping()
    finally:
        shared.reset()


# ── The connection's own settings ───────────────────────────────────────────


def test_the_pool_connects_with_a_timeout_and_keepalives(monkeypatch):
    monkeypatch.setattr(db, "DATABASE_URL", "postgresql://app@db.invalid/bluebird")
    assert db._connect_kwargs() == {
        "autocommit": True,
        "connect_timeout": 3,
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 3,
    }


def test_a_setting_the_connection_string_names_is_left_to_it(monkeypatch):
    monkeypatch.setattr(
        db, "DATABASE_URL", "postgresql://app@db.invalid/bluebird?connect_timeout=10&keepalives_idle=5"
    )
    kwargs = db._connect_kwargs()
    assert "connect_timeout" not in kwargs and "keepalives_idle" not in kwargs
    assert kwargs["keepalives_count"] == 3


def test_the_bounds_fit_inside_each_other():
    # A new connection gives up before the reader waiting on it would; a
    # statement the server cancels ends before the pod's own deadline does,
    # so the server's clearer error is the one normally seen.
    assert db.CONNECT_TIMEOUT_S < db.POOL_WAIT_S
    assert db.STATEMENT_TIMEOUT_S < db.CALL_DEADLINE_S
