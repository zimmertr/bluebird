"""The shared cache's connection, migrations and refresh loop (#760)."""

from __future__ import annotations

import asyncio
import os

import psycopg
import pytest

from app import db
from app.db import refresh

pytestmark = pytest.mark.db


async def test_migrations_bring_the_schema_to_this_release(database):
    async with db.connection() as conn:
        assert await db.current_version(conn) == db.SCHEMA_VERSION
        row = await (await conn.execute("SELECT postgis_version()")).fetchone()
    assert row and row[0]


async def test_migrating_again_changes_nothing(database):
    async with db.connection() as conn:
        assert await db.migrate(conn) == db.SCHEMA_VERSION


async def test_a_due_source_runs_once_and_is_not_due_again(database):
    calls: list[str] = []

    async def run() -> None:
        calls.append("ran")

    source = refresh.Source(name="test-source", interval_s=3600, run=run)
    assert await refresh.run_if_due(source) is True
    assert await refresh.run_if_due(source) is False
    assert calls == ["ran"]
    state = await refresh.state("test-source")
    assert state and state.failures == 0 and state.last_success is not None


async def test_a_failed_refresh_backs_off_and_records_why(database):
    async def run() -> None:
        raise RuntimeError("upstream said no")

    source = refresh.Source(name="test-failing", interval_s=60, run=run)
    assert await refresh.run_if_due(source) is True
    state = await refresh.state("test-failing")
    assert state and state.failures == 1 and state.last_error == "upstream said no"
    # Backing off: not due again straight away, so no second attempt.
    assert await refresh.run_if_due(source) is False


async def test_a_held_lock_turns_a_second_pod_away(database):
    started = asyncio.Event()
    release = asyncio.Event()

    async def slow() -> None:
        started.set()
        await release.wait()

    source = refresh.Source(name="test-held", interval_s=3600, run=slow)
    first = asyncio.create_task(refresh.run_if_due(source))
    await started.wait()
    # A second caller on another connection plays the second pod.
    assert await refresh.run_if_due(source) is False
    release.set()
    assert await first is True


async def test_a_connection_the_server_dropped_is_not_handed_out(database):
    # The mesh closes a connection idle for an hour, and a preview's pool keeps
    # one with nothing to wake it. pg_terminate_backend plays the mesh for every
    # connection the pool holds, so none of them can answer the next caller.
    async with db.connection() as conn:
        row = await (await conn.execute("SELECT pg_backend_pid()")).fetchone()
    assert row
    async with await psycopg.AsyncConnection.connect(os.environ["TEST_DATABASE_URL"], autocommit=True) as other:
        cut = await (
            await other.execute(
                "SELECT pid, pg_terminate_backend(pid, 5000) FROM pg_stat_activity"
                " WHERE datname = current_database() AND backend_type = 'client backend'"
                " AND pid <> pg_backend_pid()"
            )
        ).fetchall()
    assert (row[0], True) in cut and all(done for _, done in cut)
    # The pool's check finds them dead and hands out a new one.
    async with db.connection() as conn:
        after = await (await conn.execute("SELECT pg_backend_pid()")).fetchone()
    assert after and after[0] not in {pid for pid, _ in cut}


def test_backoff_doubles_from_a_minute_to_an_hour():
    mid = lambda lo, hi: 1.0  # noqa: E731  no jitter
    assert refresh.backoff_s(1, rand=mid) == 60
    assert refresh.backoff_s(2, rand=mid) == 120
    assert refresh.backoff_s(7, rand=mid) == 3600
    assert refresh.backoff_s(20, rand=mid) == 3600


def test_lock_keys_are_stable_and_distinct():
    assert db.lock_key("refresh:wildfires") == db.lock_key("refresh:wildfires")
    assert db.lock_key("refresh:wildfires") != db.lock_key("refresh:closures")
