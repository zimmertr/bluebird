"""The cache every pod shares (#760): one PostgreSQL database with PostGIS.

It holds what the app would otherwise ask an upstream for again and again: the
places a search finds (filled from the OpenStreetMap planet and kept current
from its daily change files), the wildfire, closure and smoke snapshots, and the
counters that make a rate limit or an upstream budget exact across pods.

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
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

import psycopg
from psycopg import AsyncConnection
from psycopg_pool import AsyncConnectionPool, PoolTimeout

from app.env import env_int

log = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
READ_ONLY = os.environ.get("DATABASE_READ_ONLY", "").strip().lower() in ("1", "true", "yes")
POOL_MAX = env_int("DATABASE_POOL_MAX", 10)
# How long a reader waits for a pooled connection before it takes its per-pod
# path. Short, because every caller has one and a search should not stall on a
# database that is restarting.
CONNECT_TIMEOUT_S = 5.0

MIGRATIONS = Path(__file__).with_name("migrations")
# The newest migration this release carries, read off the files so the number
# cannot drift from them.
SCHEMA_VERSION = max(int(p.name.split("_", 1)[0]) for p in MIGRATIONS.glob("*.sql"))


class DatabaseUnavailable(Exception):
    """The cache cannot answer now; the caller takes its per-pod path."""


_pool: AsyncConnectionPool | None = None
_ready = False
_connector: asyncio.Task[None] | None = None


def configured() -> bool:
    return bool(DATABASE_URL)


def available() -> bool:
    """Connected, with a schema this release can read."""
    return _ready


def writable() -> bool:
    """Available and allowed to write: refreshes, counters and migrations."""
    return _ready and not READ_ONLY


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
        kwargs={"autocommit": True},
        check=AsyncConnectionPool.check_connection,
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
            async with _pool.connection(timeout=CONNECT_TIMEOUT_S) as conn:
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
    if _connector is not None:
        _connector.cancel()
        _connector = None
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def connection() -> AsyncIterator[AsyncConnection]:
    """A pooled connection, or DatabaseUnavailable.

    A dropped connection mid-query surfaces as DatabaseUnavailable too, so a
    caller handles one exception for every way the cache can be missing.
    """
    if not _ready or _pool is None:
        raise DatabaseUnavailable("the shared cache is not available")
    try:
        async with _pool.connection(timeout=CONNECT_TIMEOUT_S) as conn:
            yield conn
    except (PoolTimeout, psycopg.OperationalError) as exc:
        raise DatabaseUnavailable(str(exc)) from exc


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
