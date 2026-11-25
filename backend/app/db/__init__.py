"""The cache every pod shares (#760): one PostgreSQL database with PostGIS.

It holds what the app would otherwise ask an upstream for again and again: the
places a search finds (filled from the OpenStreetMap planet and kept current
from its daily change files), the wildfire, fire detection, closure and smoke
snapshots, and the counters that make a rate limit or an upstream budget exact
across pods.

The database is optional. With no `DATABASE_URL` the app runs as it did before
#760: discovery asks Overpass, each pod fetches its own snapshots and keeps its
own counters. That is how CI, a self-hosted instance without the chart's
database, and a database that has not come up yet all behave, so every reader
asks `available()` and keeps its per-pod path for the answer False.

`DATABASE_READ_ONLY` is for PR previews, which read production's cache with a
read-only login (the maintainer's condition, 2026-10-18: only while the
database holds cached public data). A read-only pod applies no migrations, runs
no refresh, keeps its counters to itself, and treats a schema older than its
own as no database at all, because a preview of a schema change would otherwise
query tables production does not have yet.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path

import psycopg
from psycopg import AsyncConnection
from psycopg.conninfo import conninfo_to_dict
from psycopg_pool import AsyncConnectionPool

from app.env import env_int
from app.services.errors import log_reason

log = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
READ_ONLY = os.environ.get("DATABASE_READ_ONLY", "").strip().lower() in ("1", "true", "yes")
POOL_MAX = env_int("DATABASE_POOL_MAX", 10)
# How long a reader waits for a pooled connection before it takes its per-pod
# path. Short, because every caller has one and a search should not stall on a
# database that is restarting.
POOL_WAIT_S = 5.0
# How long one new connection may take to open. Under the pool wait, so a
# connection that cannot open gives up before the reader waiting on it would;
# in the cluster one opens in milliseconds. libpq counts whole seconds.
CONNECT_TIMEOUT_S = 3
# Keepalives every 10 s after 30 s of silence, three missed, so a peer that
# vanished is noticed in about a minute rather than the kernel's two hours.
# In the mesh the socket's far end is the pod's own sidecar, which answers
# them, so there `CALL_DEADLINE_S` is what ends a call on a half-open
# connection; these serve a pod that reaches the database directly.
KEEPALIVES = {"keepalives": 1, "keepalives_idle": 30, "keepalives_interval": 10, "keepalives_count": 3}
# The server's limit on one statement. Every read here is an indexed lookup:
# discovery, which is one ring read, took 0.41 s at the 99th percentile over
# the 30 days to 2026-11-25, so 3 s is seven times that and still leaves a
# fallback most of a 20 s discovery deadline. A statement past it is one
# query too big (a box drawn round the world), not a database in trouble, so
# it fails that call alone and pauses nothing.
STATEMENT_TIMEOUT_S = 3.0
# The pod's own limit on one call, from checkout to the last row. The
# statement timeout is the server's, and a server that cannot answer cannot
# enforce it, so this is what bounds a call on a half-open connection. Long
# enough for a call of two statements near their limit.
CALL_DEADLINE_S = 5.0
# How long every reader on this pod leaves the database alone after a call it
# could not answer. Without it, an outage adds the pool's wait to every
# request while the database restarts, where with it one request in this
# window pays and the rest take their per-pod paths at once.
PAUSE_S = 30.0

MIGRATIONS = Path(__file__).with_name("migrations")
# The newest migration this release carries, read off the files so the number
# cannot drift from them.
SCHEMA_VERSION = max(int(p.name.split("_", 1)[0]) for p in MIGRATIONS.glob("*.sql"))


class DatabaseUnavailable(Exception):
    """The cache cannot answer now; the caller takes its per-pod path."""


class Breaker:
    """Skip the database for a while after it fails, then let one call try it again.

    Tripped by its owner on a failure that says the database is gone or
    stalled. While it is tripped, `skipping()` is true and `call()` refuses at
    once. Once the pause has passed, the next call goes ahead alone as the
    probe, and every other call keeps skipping until it ends: a probe that
    finishes without tripping closes the breaker, one that trips it pauses
    again, and one that was cancelled leaves the next call to probe.
    """

    def __init__(self, pause_s: float) -> None:
        self.pause_s = pause_s
        # When the pause ends, on `_clock`; None while the breaker is closed.
        self._until: float | None = None
        self._probing = False
        self._trips = 0
        # An attribute rather than a module function, so a test can move this
        # clock without moving the event loop's.
        self._clock: Callable[[], float] = time.monotonic

    def skipping(self) -> bool:
        if self._until is None:
            return False
        return self._probing or self._clock() < self._until

    def trip(self) -> None:
        self._trips += 1
        self._until = self._clock() + self.pause_s

    def reset(self) -> None:
        self._until = None
        self._probing = False

    @asynccontextmanager
    async def call(self) -> AsyncIterator[None]:
        if self.skipping():
            raise DatabaseUnavailable(f"skipped for {self.pause_s:.0f} s after a failure")
        probe = self._until is not None
        if probe:
            self._probing = True
        trips = self._trips
        finished = False
        try:
            yield
            finished = True
        except Exception:
            finished = True
            raise
        finally:
            if probe:
                self._probing = False
                if finished and self._trips == trips:
                    self._until = None


# Every call through `connection()` on this pod, readers and writers alike.
BREAKER = Breaker(PAUSE_S)

_pool: AsyncConnectionPool | None = None
_ready = False
_connector: asyncio.Task[None] | None = None
# The connections `_lift` took the statement timeout off, by id, for the pool
# to put it back on when each is returned.
_lifted: set[int] = set()


def configured() -> bool:
    return bool(DATABASE_URL)


def available() -> bool:
    """Connected, with a schema this release can read, and not paused after a failure."""
    return _ready and not BREAKER.skipping()


def writable() -> bool:
    """Available and allowed to write: refreshes, counters and migrations."""
    return available() and not READ_ONLY


def _connect_kwargs() -> dict[str, object]:
    """The pool's connection settings, each one the connection string names left to it."""
    try:
        named = conninfo_to_dict(DATABASE_URL)
    except psycopg.ProgrammingError:
        # A string libpq cannot parse fails in the connector's loop, which
        # logs it and keeps trying, rather than here, where it would stop
        # the pod starting.
        named = {}
    wanted: dict[str, object] = {"connect_timeout": CONNECT_TIMEOUT_S, **KEEPALIVES}
    return {"autocommit": True, **{k: v for k, v in wanted.items() if k not in named}}


async def _configure(conn: AsyncConnection) -> None:
    # Once per new connection, as its session's default, so a checkout costs
    # no round trip for it.
    await conn.execute(f"SET statement_timeout = {int(STATEMENT_TIMEOUT_S * 1000)}")


async def _lift(conn: AsyncConnection) -> None:
    """Take the statement timeout off this connection until it goes back to the pool."""
    await conn.execute("SET statement_timeout = 0")
    _lifted.add(id(conn))


async def _reset(conn: AsyncConnection) -> None:
    # A reset that fails makes the pool close the connection, so none goes
    # back to readers without its timeout.
    if id(conn) in _lifted:
        _lifted.discard(id(conn))
        await _configure(conn)


def lock_key(name: str) -> int:
    """A stable signed 64-bit advisory-lock key for a name.

    Advisory locks take a bigint, and Python's `hash` changes per process, so
    two pods would never contend for the same lock with it.
    """
    digest = hashlib.blake2b(name.encode(), digest_size=8).digest()
    return int.from_bytes(digest, "big", signed=True)


async def start() -> None:
    """Open the pool and bring the schema up in the background.

    Never raises and never blocks startup: a pod whose database is down serves
    on its per-pod paths and keeps trying, doubling its wait to a minute.
    """
    global _pool, _connector
    if not configured():
        log.info("No DATABASE_URL: running without the shared cache")
        return
    # `check` proves each connection on its way out of the pool. The mesh's
    # sidecars close a connection idle for an hour, and the pool's kept one
    # can sit that long: a read-only preview runs no refresh loop to wake it.
    # Without it, the next request meets the dead one, raises
    # DatabaseUnavailable and takes its per-pod path. The cost is one
    # round trip per checkout: 0.08 ms on a local PostgreSQL 17 (2026-10-20),
    # about what a shared check costs (0181).
    _pool = AsyncConnectionPool(
        DATABASE_URL,
        min_size=1,
        max_size=POOL_MAX,
        open=False,
        kwargs=_connect_kwargs(),
        configure=_configure,
        check=AsyncConnectionPool.check_connection,
        reset=_reset,
    )
    await _pool.open(wait=False)
    _connector = asyncio.create_task(_connect(), name="db-connect")


async def wait_ready(timeout_s: float) -> bool:
    """Wait for the first connection attempt to settle (tests and the fill check)."""
    if _connector is None:
        return _ready
    try:
        await asyncio.wait_for(asyncio.shield(_connector), timeout_s)
    except TimeoutError:
        pass
    return _ready


async def _connect() -> None:
    global _ready
    assert _pool is not None
    delay = 5.0
    while True:
        try:
            async with _pool.connection(timeout=POOL_WAIT_S) as conn:
                # A migration can build an index over every place.
                await _lift(conn)
                version = await current_version(conn) if READ_ONLY else await migrate(conn)
        except Exception as exc:  # noqa: BLE001  every failure here means "try again"
            log.warning("Shared cache unreachable (%s); retrying in %.0f s", exc, delay)
            await asyncio.sleep(delay)
            delay = min(delay * 2, 60.0)
            continue
        if version < SCHEMA_VERSION:
            log.warning(
                "Shared cache schema is version %d and this release needs %d; running without it",
                version,
                SCHEMA_VERSION,
            )
            return
        _ready = True
        log.info("Shared cache ready (schema %d%s)", version, ", read-only" if READ_ONLY else "")
        return


async def stop() -> None:
    global _pool, _connector, _ready
    _ready = False
    BREAKER.reset()
    if _connector is not None:
        _connector.cancel()
        _connector = None
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def connection(*, unbounded: bool = False) -> AsyncIterator[AsyncConnection]:
    """A pooled connection, or DatabaseUnavailable.

    Every `psycopg.Error` the call raises, a dropped connection mid-query
    included, surfaces as DatabaseUnavailable too, so a caller handles one
    exception for every way the cache can be missing. A failure that says the
    database is gone or stalled (no connection in `POOL_WAIT_S`, a connection
    that broke, a call past `CALL_DEADLINE_S`) also pauses every caller on
    this pod for `PAUSE_S`. One the database answered (a statement past its
    timeout, or one it refused) fails that call alone, and a refusal is
    logged with its traceback, since it is a bug here rather than weather.

    Each statement has `STATEMENT_TIMEOUT_S` and the call `CALL_DEADLINE_S`.
    Work that may run longer (a migration, a day file's changes, a snapshot
    of megabytes) passes `unbounded`, which lifts both, and bounds itself.
    """
    if not _ready or _pool is None:
        raise DatabaseUnavailable("the shared cache is not available")
    async with BREAKER.call():
        deadline = asyncio.timeout(None if unbounded else CALL_DEADLINE_S)
        try:
            async with _pool.connection(timeout=POOL_WAIT_S) as conn:
                if unbounded:
                    await _lift(conn)
                async with deadline:
                    yield conn
        except TimeoutError as exc:
            if not deadline.expired():
                raise
            _pause(exc)
            raise DatabaseUnavailable(f"no answer within {CALL_DEADLINE_S:.0f} s") from exc
        except psycopg.errors.QueryCanceled as exc:
            log.warning("Shared cache cancelled a statement past its timeout: %s", log_reason(exc))
            raise DatabaseUnavailable(str(exc)) from exc
        except psycopg.OperationalError as exc:
            _pause(exc)
            raise DatabaseUnavailable(str(exc)) from exc
        except psycopg.Error as exc:
            log.error("Shared cache refused a statement; the caller takes its per-pod path", exc_info=True)
            raise DatabaseUnavailable(str(exc)) from exc


def _pause(exc: BaseException) -> None:
    BREAKER.trip()
    log.warning(
        "event=shared_cache_paused error=%s pause_s=%.0f",
        log_reason(exc, deadline_s=CALL_DEADLINE_S),
        PAUSE_S,
    )


async def current_version(conn: AsyncConnection) -> int:
    row = await (
        await conn.execute("SELECT to_regclass('schema_migrations') IS NOT NULL")
    ).fetchone()
    if not row or not row[0]:
        return 0
    row = await (await conn.execute("SELECT coalesce(max(version), 0) FROM schema_migrations")).fetchone()
    return int(row[0]) if row else 0


async def migrate(conn: AsyncConnection) -> int:
    """Apply every migration this release carries that the database lacks.

    Under one advisory lock, so pods starting together apply each file once,
    and each file in its own transaction, so a failed one leaves the schema at
    the last good version.
    """
    key = lock_key("schema-migrations")
    await conn.execute("SELECT pg_advisory_lock(%s)", (key,))
    try:
        await conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            " version integer PRIMARY KEY,"
            " applied_at timestamptz NOT NULL DEFAULT now())"
        )
        version = await current_version(conn)
        for path in sorted(MIGRATIONS.glob("*.sql")):
            number = int(path.name.split("_", 1)[0])
            if number <= version:
                continue
            log.info("Applying shared-cache migration %s", path.name)
            async with conn.transaction():
                await conn.execute(path.read_text())
                await conn.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (number,))
            version = number
        return version
    finally:
        await conn.execute("SELECT pg_advisory_unlock(%s)", (key,))
