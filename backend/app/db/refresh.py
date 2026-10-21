"""Keeping each cached source current, one pod at a time (#760).

Every pod runs the same loop, and a PostgreSQL advisory lock per source decides
which pod does the work: the first to take it refreshes, the others find it
held and move on. A lock dies with its connection, so a pod that crashes
mid-refresh hands the source to whichever pod ticks next, with no leader to
elect and nothing to configure.

When a source is due and how long it backs off after a failure live in
`refresh_state`, shared, so a failure on one pod is not retried at once by the
next. The backoff doubles from a minute to an hour, with a fifth either way of
jitter so pods that started together drift apart; a refresh still backing off
when its next interval comes round simply is that interval, so a source never
has two attempts in flight. A pod whose database is read-only or missing runs
no refresh at all.
"""

from __future__ import annotations

import asyncio
import logging
import random
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime

from app import db, telemetry
from app.services.errors import log_reason

log = logging.getLogger(__name__)

# How often each pod looks for due work. The cost of a tick is one indexed read
# per source, and a due source waits at most this long past its time.
TICK_S = 30.0
BACKOFF_FIRST_S = 60.0
BACKOFF_MAX_S = 3600.0


@dataclass(frozen=True)
class Source:
    name: str
    interval_s: float
    run: Callable[[], Awaitable[None]]
    # A refresh that outruns this is a failure, so a hung upstream cannot hold
    # the lock, and the pooled connection under it, for good.
    deadline_s: float = 300.0


@dataclass(frozen=True)
class RefreshState:
    last_success: datetime | None
    failures: int
    last_error: str | None
    retry_after_s: int | None


_sources: dict[str, Source] = {}
_loop_tasks: list[asyncio.Task[None]] = []


def register(source: Source) -> None:
    _sources[source.name] = source


def backoff_s(failures: int, *, rand: Callable[[float, float], float] = random.uniform) -> float:
    """The wait after `failures` consecutive failures, jittered by a fifth."""
    base = min(BACKOFF_FIRST_S * 2 ** max(failures - 1, 0), BACKOFF_MAX_S)
    return base * rand(0.8, 1.2)


async def run_if_due(source: Source) -> bool:
    """Refresh `source` if it is due and no other pod holds it. True if it ran."""
    key = db.lock_key(f"refresh:{source.name}")
    async with db.connection() as conn:
        row = await (await conn.execute("SELECT pg_try_advisory_lock(%s)", (key,))).fetchone()
        if not row or not row[0]:
            return False
        try:
            await conn.execute(
                "INSERT INTO refresh_state (source) VALUES (%s) ON CONFLICT DO NOTHING",
                (source.name,),
            )
            due = await (
                await conn.execute(
                    "SELECT next_due <= now(), failures FROM refresh_state WHERE source = %s",
                    (source.name,),
                )
            ).fetchone()
            if not due or not due[0]:
                return False
            failures = int(due[1])
            await conn.execute(
                "UPDATE refresh_state SET last_attempt = now() WHERE source = %s", (source.name,)
            )
            try:
                await asyncio.wait_for(source.run(), source.deadline_s)
            except Exception as exc:  # noqa: BLE001  a failed refresh is recorded, never raised
                failures += 1
                wait = backoff_s(failures)
                message = log_reason(exc)
                log.warning(
                    "Refresh of %s failed (%s); next try in %.0f s", source.name, message, wait
                )
                telemetry.REFRESHES.labels(cache=source.name, outcome="failure").inc()
                await conn.execute(
                    "UPDATE refresh_state SET failures = %s, last_error = %s,"
                    " retry_after_s = %s, next_due = now() + make_interval(secs => %s)"
                    " WHERE source = %s",
                    (failures, message[:500], getattr(exc, "retry_after_s", None), wait, source.name),
                )
                return True
            telemetry.REFRESHES.labels(cache=source.name, outcome="success").inc()
            await conn.execute(
                "UPDATE refresh_state SET failures = 0, last_error = NULL, retry_after_s = NULL,"
                " last_success = now(), next_due = now() + make_interval(secs => %s)"
                " WHERE source = %s",
                (source.interval_s, source.name),
            )
            return True
        finally:
            await conn.execute("SELECT pg_advisory_unlock(%s)", (key,))


async def state(name: str) -> RefreshState | None:
    async with db.connection() as conn:
        row = await (
            await conn.execute(
                "SELECT last_success, failures, last_error, retry_after_s"
                " FROM refresh_state WHERE source = %s",
                (name,),
            )
        ).fetchone()
    if row is None:
        return None
    return RefreshState(last_success=row[0], failures=row[1], last_error=row[2], retry_after_s=row[3])


async def _loop(source: Source) -> None:
    # One loop per source, so the daily OpenStreetMap update, which runs for
    # minutes, never holds up a wildfire refresh on the same pod.
    while True:
        await asyncio.sleep(TICK_S * random.uniform(0.8, 1.2))
        if not db.writable():
            continue
        try:
            await run_if_due(source)
        except db.DatabaseUnavailable:
            continue
        except Exception:  # noqa: BLE001  the loop must outlive any one bug
            log.exception("Refresh loop error for %s", source.name)


def start() -> None:
    if db.configured() and not db.READ_ONLY and not _loop_tasks:
        for source in _sources.values():
            _loop_tasks.append(asyncio.create_task(_loop(source), name=f"refresh-{source.name}"))


async def stop() -> None:
    for task in _loop_tasks:
        task.cancel()
    await asyncio.gather(*_loop_tasks, return_exceptions=True)
    _loop_tasks.clear()
