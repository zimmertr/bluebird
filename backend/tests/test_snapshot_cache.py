"""`SnapshotCache`, the stale-tolerant cache the wildfire, smoke and closure
overlays are built on.

Its generic behavior is tested here once, against a plain cache: a snapshot
is refetched once it ages out and served while its refresh runs behind the
caller, concurrent readers cost one upstream fetch, and a failed refresh backs
off rather than retrying per request. Each overlay keeps one serve-stale case
through its own factory.

Then a pod that has never filled (review of #552), and one whose refreshes
have failed for a day or hang (#580). A failed refresh sets a backoff, and
`get()` honoured it only once a snapshot existed. On a cold pod every request
during an outage became its own upstream attempt, in series behind the lock.
These pin that the cold path waits out the same backoff and then tries again.
"""

from __future__ import annotations

import asyncio
import logging

import httpx
import pytest
from prometheus_client import REGISTRY

from app.error_codes import ApiError
from app.services.errors import UpstreamError
from app.services.snapshot import MAX_STALE_S, SnapshotCache, snapshot_or_503


class _Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def _cache(clock: _Clock, answers: list[object]) -> tuple[SnapshotCache[str], list[int]]:
    calls: list[int] = []

    async def fetch() -> str:
        calls.append(1)
        answer = answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return str(answer)

    cache = SnapshotCache(
        label="test", fetch=fetch, ttl_s=600, retry_after_failure_s=60, clock=clock
    )
    return cache, calls


# ── Ageing, singleflight and backoff ─────────────────────────────────────────


async def test_a_snapshot_is_refetched_once_it_ages_out():
    clock = _Clock()
    cache, calls = _cache(clock, ["first", "second"])
    assert await cache.get() == "first"
    clock.now += 599
    assert await cache.get() == "first"
    clock.now += 2
    await cache.get()
    await cache.settle()
    assert await cache.get() == "second"
    assert len(calls) == 2


def _gated(release: asyncio.Event) -> tuple[SnapshotCache[str], list[int], _Clock]:
    """A cache whose first fetch answers at once and whose later ones wait
    for `release`, so a test can hold a refresh in flight."""
    clock = _Clock()
    calls: list[int] = []

    async def fetch() -> str:
        calls.append(1)
        n = len(calls)
        if n > 1:
            await release.wait()
        return f"fetch {n}"

    cache = SnapshotCache(
        label="test", fetch=fetch, ttl_s=600, retry_after_failure_s=60, clock=clock
    )
    return cache, calls, clock


async def test_an_aged_snapshot_is_served_without_waiting_for_its_refresh():
    # A national wildfire fetch measured 6.7 seconds against the live service.
    # Blocking on it would hand that wait to one unlucky visitor every TTL, to
    # tell them what the previous visitor already knew.
    release = asyncio.Event()
    cache, calls, clock = _gated(release)
    assert await cache.get() == "fetch 1"

    clock.now += 601
    # Returns the aged copy while the refresh is still blocked on `release`.
    # If get() waited on the refresh, this line would hang rather than fail.
    assert await cache.get() == "fetch 1"

    # One yield is enough for the scheduled refresh to reach its own await, so
    # the caller was served ahead of an upstream fetch still in flight.
    await asyncio.sleep(0)
    assert len(calls) == 2

    release.set()
    await cache.settle()
    assert await cache.get() == "fetch 2"


async def test_concurrent_cold_misses_cost_one_upstream_fetch():
    # The thundering herd this exists to stop: on a cold pod every visitor
    # would otherwise be its own query against a quota shared with the rest
    # of the internet.
    started = asyncio.Event()
    release = asyncio.Event()
    calls: list[int] = []

    async def fetch() -> str:
        calls.append(1)
        started.set()
        await release.wait()
        return "only"

    cache = SnapshotCache(label="test", fetch=fetch, ttl_s=600, retry_after_failure_s=60)
    waiters = [asyncio.create_task(cache.get()) for _ in range(5)]
    await started.wait()
    release.set()
    results = await asyncio.gather(*waiters)

    assert len(calls) == 1
    assert all(r is results[0] for r in results)


async def test_concurrent_aged_reads_schedule_one_background_refresh():
    release = asyncio.Event()
    cache, calls, clock = _gated(release)
    await cache.get()

    clock.now += 601
    await asyncio.gather(*(cache.get() for _ in range(5)))
    release.set()
    await cache.settle()
    assert len(calls) == 2


async def test_a_failed_refresh_backs_off_instead_of_retrying_per_request():
    clock = _Clock()
    cache, calls = _cache(clock, ["first", UpstreamError("down"), "second"])
    await cache.get()
    clock.now += 601
    await cache.get()
    await cache.settle()  # the second fetch, which fails
    for _ in range(3):
        await cache.get()  # inside the backoff: must not become a third
        await cache.settle()
    assert len(calls) == 2
    clock.now += 61
    await cache.get()
    await cache.settle()
    assert len(calls) == 3


# ── A pod that has never filled (review of #552) ─────────────────────────────


async def test_a_cold_cache_waits_out_the_failure_backoff():
    clock = _Clock()
    cache, calls = _cache(clock, [UpstreamError("down"), "ok"])

    with pytest.raises(UpstreamError):
        await cache.get()
    assert len(calls) == 1

    # Inside the backoff: the same error, and no second upstream attempt.
    clock.now += 30
    with pytest.raises(UpstreamError):
        await cache.get()
    assert len(calls) == 1

    # Past it: one more attempt, which lands.
    clock.now += 31
    assert await cache.get() == "ok"
    assert len(calls) == 2


async def test_a_filled_cache_still_serves_through_a_failed_refresh():
    clock = _Clock()
    cache, calls = _cache(clock, ["first", UpstreamError("down")])
    assert await cache.get() == "first"
    clock.now += 601
    assert await cache.get() == "first"
    await cache.settle()
    assert len(calls) == 2
    assert await cache.get() == "first"


# ── The age limit and the deadline (#580) ────────────────────────────────────

def _failures(label: str) -> float:
    value = REGISTRY.get_sample_value(
        "bluebird_forecast_snapshot_refresh_failures_total", {"provider": label}
    )
    return value or 0.0


async def test_a_snapshot_past_the_age_limit_raises_the_held_error():
    # Every refresh after the first fails. Up to the limit the old snapshot is
    # served; past it the route answers the cold cache's 503 with the error the
    # refreshes failed with, rather than a fire map days out of date.
    clock = _Clock()
    down = UpstreamError("down")
    cache, calls = _cache(clock, ["first"] + [down] * 50)
    assert await cache.get() == "first"

    clock.now += MAX_STALE_S - 1
    assert await cache.get() == "first"
    await cache.settle()

    clock.now += 2
    with pytest.raises(UpstreamError) as raised:
        await cache.get()
    assert raised.value is down
    with pytest.raises(ApiError) as answered:
        await snapshot_or_503(cache, event="test")
    assert answered.value.status_code == 503
    assert answered.value.detail == "down"


async def test_an_old_snapshot_with_no_failure_is_refreshed_in_front_of_the_caller():
    # Nobody asked for a day, so nothing has failed: the caller waits for the
    # one refresh rather than being handed yesterday.
    clock = _Clock()
    cache, calls = _cache(clock, ["first", "second"])
    assert await cache.get() == "first"
    clock.now += MAX_STALE_S + 1
    assert await cache.get() == "second"
    assert len(calls) == 2


async def test_the_age_limit_respects_the_failure_backoff():
    clock = _Clock()
    cache, calls = _cache(clock, ["first", UpstreamError("down"), "second"])
    assert await cache.get() == "first"
    clock.now += MAX_STALE_S + 1
    with pytest.raises(UpstreamError):
        await cache.get()
    assert len(calls) == 2
    # Inside the backoff: the held error again, and no upstream attempt.
    clock.now += 30
    with pytest.raises(UpstreamError):
        await cache.get()
    assert len(calls) == 2
    clock.now += 31
    assert await cache.get() == "second"


async def test_a_cold_refresh_ends_at_its_deadline_with_the_timeout_sentence():
    async def hang() -> str:
        await asyncio.sleep(30)
        return "never"

    cache = SnapshotCache(
        label="Hanging upstream",
        fetch=hang,
        ttl_s=600,
        retry_after_failure_s=60,
        refresh_deadline_s=0.05,
    )
    before = _failures("Hanging upstream")
    with pytest.raises(ApiError) as answered:
        await asyncio.wait_for(snapshot_or_503(cache, event="test"), timeout=5)
    assert answered.value.status_code == 503
    assert answered.value.detail == "Hanging upstream took too long. Try again later."
    assert _failures("Hanging upstream") == before + 1


async def test_a_background_refresh_queued_behind_a_cold_fetch_does_not_fetch_again():
    # An aged read schedules a refresh behind the request. Before it runs, the
    # snapshot passes its age limit and a cold read fetches under the lock;
    # the queued refresh then finds the cache fresh and asks nothing.
    clock = _Clock()
    clock.now = 0.0
    fetched_at: list[float] = []

    async def fetch() -> str:
        fetched_at.append(clock.now)
        return f"at {clock.now}"

    cache = SnapshotCache(
        label="test", fetch=fetch, ttl_s=10, retry_after_failure_s=60, clock=clock,
        max_stale_s=100,
    )
    assert await cache.get() == "at 0.0"
    clock.now = 50.0
    assert await cache.get() == "at 0.0"  # aged: served, refresh scheduled
    clock.now = 200.0
    assert await cache.get() == "at 200.0"  # cold: fetched in front of the read
    await cache.settle()

    assert fetched_at == [0.0, 200.0]


async def test_a_refresh_past_its_deadline_logs_the_deadline(caplog):
    # The deadline's TimeoutError carries no text of its own, so both the
    # refresh's line and the route's would otherwise end in nothing.
    async def hang() -> str:
        await asyncio.sleep(30)
        return "never"

    cache = SnapshotCache(
        label="Hanging upstream", fetch=hang, ttl_s=600, retry_after_failure_s=60,
        refresh_deadline_s=0.05,
    )
    with caplog.at_level(logging.WARNING), pytest.raises(ApiError):
        await asyncio.wait_for(snapshot_or_503(cache, event="test"), timeout=5)
    messages = [r.getMessage() for r in caplog.records]
    assert any("nothing cached to fall back on: no answer within" in m for m in messages)
    assert any(m.startswith("event=test error=no answer within") for m in messages)


async def test_a_silent_refresh_failure_logs_its_type_not_the_deadline(caplog):
    # A connection the server reset carries no message either, and it is not
    # a timeout: read as one, it sends whoever reads the log the wrong way.
    clock = _Clock()
    cache, _ = _cache(clock, [httpx.ReadError("")])
    with caplog.at_level(logging.WARNING), pytest.raises(ApiError):
        await snapshot_or_503(cache, event="test")
    messages = [r.getMessage() for r in caplog.records]
    assert "test fetch failed with nothing cached to fall back on: ReadError" in messages
    assert "event=test error=ReadError" in messages
    assert not any("no answer within" in m for m in messages)


async def test_a_background_refresh_past_its_deadline_keeps_serving_the_snapshot():
    clock = _Clock()
    answers: list[str] = ["first"]

    async def fetch() -> str:
        if answers:
            return answers.pop(0)
        await asyncio.sleep(30)
        return "never"

    cache = SnapshotCache(
        label="Slow refresh", fetch=fetch, ttl_s=600, retry_after_failure_s=60,
        clock=clock, refresh_deadline_s=0.05,
    )
    before = _failures("Slow refresh")
    assert await cache.get() == "first"
    clock.now += 601
    assert await cache.get() == "first"
    await asyncio.wait_for(cache.settle(), timeout=5)
    assert await cache.get() == "first"
    assert _failures("Slow refresh") == before + 1


def test_a_new_cache_starts_its_failure_series_at_zero():
    # Born at 0, so the first failure is an increase an alert can see.
    SnapshotCache(label="Fresh series", fetch=_never, ttl_s=1, retry_after_failure_s=1)
    assert REGISTRY.get_sample_value(
        "bluebird_forecast_snapshot_refresh_failures_total", {"provider": "Fresh series"}
    ) == 0.0


async def _never() -> str:
    raise AssertionError("not fetched")
