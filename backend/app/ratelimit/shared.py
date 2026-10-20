"""What the guards share when the cache every pod reads can hold their counts (#760).

With the shared cache available and writable, the per-address buckets, the
Nominatim gate, the Open-Meteo budgets and the geocode cache keep their state
in PostgreSQL, so each one is a single limit for the whole deployment rather
than one per pod. Each keeps its in-memory state as well, and that is the
per-pod path: a pod with no database, a read-only preview, and any call the
database cannot answer use it exactly as before #760.

This module holds the parts they have in common: whether to ask the database
at all, the bound on how long a guard may wait for it, and the hourly sweep of
the rows they leave behind. Each guard's statement sits beside the guard,
where its per-pod half can be read against it.

It imports nothing from the guards, because they import it.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable

import psycopg
from psycopg import AsyncConnection

from app import db
from app.db import refresh

log = logging.getLogger("bluebird_forecast.ratelimit")

# How long one guard may wait for the database before it counts on its own pod
# instead. Every request to a limited route pays this round trip, so the bound
# is what a slow database can add to a request, and a check measured at around
# a millisecond has no business near it.
TIMEOUT_S = 0.5
# How long the guards leave the database alone after a call it could not
# answer. Without it, an outage would add the pool's wait to every request
# while the database restarts, where with it one request in this window pays
# and the rest count per pod straight away.
PAUSE_S = 30.0

_paused_until = 0.0


def usable() -> bool:
    """Whether a guard should count in the shared cache right now.

    A read-only pod (a PR preview, reading production's cache) keeps its
    counts to itself: its login cannot write them, and a preview's traffic is
    not production's to spend.
    """
    return db.writable() and time.monotonic() >= _paused_until


def reset() -> None:
    """Forget a pause (tests)."""
    global _paused_until
    _paused_until = 0.0


async def run[T](what: str, op: Callable[[AsyncConnection], Awaitable[T]]) -> T:
    """Run ``op`` on a pooled connection, or raise ``db.DatabaseUnavailable``.

    Every way the database can fail a guard, including a statement error and
    the time bound above, comes out as the one exception the caller falls back
    on, so a guard can never turn a database problem into a 500. The first
    failure pauses the shared path for every guard on this pod.
    """
    global _paused_until
    try:
        async with asyncio.timeout(TIMEOUT_S), db.connection() as conn:
            return await op(conn)
    except (db.DatabaseUnavailable, psycopg.Error, TimeoutError) as exc:
        _paused_until = time.monotonic() + PAUSE_S
        log.warning(
            "event=shared_cache_fallback what=%s error=%s pause_s=%.0f",
            what,
            str(exc) or type(exc).__name__,
            PAUSE_S,
        )
        raise db.DatabaseUnavailable(str(exc)) from exc


# ── Housekeeping ──────────────────────────────────────────────────────────────

# A bucket untouched this long has refilled to its burst under any rate the
# knobs could plausibly be set to, and a full bucket is the same as no bucket,
# so dropping it loses nothing. Each bucket writes only when it spends, so
# this counts from the last request it let through.
#
# The privacy page promises these two numbers: a bucket, which is keyed by the
# client's address, is gone within an hour of the last request, and a searched
# place name within 20 minutes (`GEOCODE_TTL_S` plus one sweep). Each sweep
# can start up to a refresh tick late, so both leave room for it, and
# legal.test.ts holds the sums to the page's words.
IDLE_BUCKET_S = 45 * 60
SWEEP_INTERVAL_S = 9 * 60


async def sweep() -> None:
    """Delete the rows the guards no longer read.

    The guards ignore these rows already: a booking that has left its window,
    a geocode answer past its expiry. This only keeps the tables small. Each
    table is unlogged, so the deletes write nothing to the WAL.
    """
    async with db.connection() as conn:
        await conn.execute(
            "DELETE FROM rate_buckets WHERE updated < now() - make_interval(secs => %s)",
            (IDLE_BUCKET_S,),
        )
        await conn.execute("DELETE FROM weight_bookings WHERE leaves_at <= now()")
        await conn.execute("DELETE FROM geocode_cache WHERE expires_at <= now()")


HOUSEKEEPING = refresh.Source(name="counters", interval_s=SWEEP_INTERVAL_S, run=sweep)
refresh.register(HOUSEKEEPING)
