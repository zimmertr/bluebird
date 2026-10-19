"""`SnapshotCache` on a pod that has never filled (review of #552), and on one
whose refreshes have failed for a day or hang (#580).

A failed refresh sets a backoff, and `get()` honoured it only once a snapshot
existed. On a cold pod every request during an outage became its own upstream
attempt, in series behind the lock. These pin that the cold path waits out the
same backoff and then tries again.

The second half is the shared cache's side (#760) that needs no database: the
envelope a snapshot is written in, and what a shared refresh says when it
fails. The database half is test_snapshot_shared.py.
"""

from __future__ import annotations

import asyncio
import gzip
import json
import random

import httpx
import pytest
from prometheus_client import REGISTRY

from app.db import refresh
from app.error_codes import ApiError
from app.services import hms, nifc, snapshot, usfs_closures, usfs_coverage
from app.services.errors import UpstreamError, UpstreamRateLimited
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
    assert await cache.get() == "first"
    clock.now += 601
    assert await cache.get() == "first"
    await asyncio.wait_for(cache.settle(), timeout=5)
    assert await cache.get() == "first"
    assert _failures("Slow refresh") == 1


def test_a_new_cache_starts_its_failure_series_at_zero():
    # Born at 0, so the first failure is an increase an alert can see.
    SnapshotCache(label="Fresh series", fetch=_never, ttl_s=1, retry_after_failure_s=1)
    assert REGISTRY.get_sample_value(
        "bluebird_forecast_snapshot_refresh_failures_total", {"provider": "Fresh series"}
    ) == 0.0


async def _never() -> str:
    raise AssertionError("not fetched")


# ── The shared cache's envelope (#760) ───────────────────────────────────────

# Characters a feature's text can carry that JSON has to escape, or that a
# careless framing would split on.
_AWKWARD = ['"', "\\", "\n", "\t", "/", "é", "火", "\u2028", "{", "]", ",", " ", "a", "0"]


def _name(rng: random.Random) -> str:
    return "".join(rng.choice(_AWKWARD) for _ in range(rng.randint(0, 16)))


def _box(rng: random.Random) -> tuple[float, float, float, float]:
    west, east = sorted(rng.uniform(-180, 180) for _ in range(2))
    south, north = sorted(rng.uniform(-90, 90) for _ in range(2))
    return west, south, east, north


def _blob(rng: random.Random, box: tuple[float, float, float, float]) -> str:
    west, south, east, north = box
    feature = {
        "type": "Feature",
        "properties": {"name": _name(rng), "acres": rng.choice([None, rng.random() * 1e6])},
        "geometry": {"type": "LineString", "coordinates": [[west, south], [east, north]]},
    }
    # Both spellings a feature can arrive in: escaped, and raw UTF-8.
    return json.dumps(feature, separators=(",", ":"), ensure_ascii=rng.random() < 0.5)


def _stored(rng: random.Random, cls):
    return tuple(cls(*box, _blob(rng, box)) for box in (_box(rng) for _ in range(rng.randint(0, 6))))


def _random_snapshot(rng: random.Random, module):
    fetched_at_ms = rng.randint(0, 2**53)
    if module is nifc:
        return nifc.Snapshot(
            fetched_at_ms=fetched_at_ms,
            full=_stored(rng, nifc.Fire),
            coarse=_stored(rng, nifc.Fire),
        )
    if module is usfs_closures:
        regions = [r for r in sorted(usfs_coverage.ALL_REGIONS) if rng.random() < 0.7]
        return usfs_closures.Snapshot(
            fetched_at_ms=fetched_at_ms,
            areas_full=_stored(rng, usfs_closures.Closure),
            areas_coarse=_stored(rng, usfs_closures.Closure),
            trails_full=_stored(rng, usfs_closures.Closure),
            trails_coarse=_stored(rng, usfs_closures.Closure),
            regions=frozenset(regions),
        )
    return hms.Snapshot(
        fetched_at_ms=fetched_at_ms,
        analysis_date=f"2026-{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}",
        plumes=rng.randint(0, 400),
        body=_blob(rng, _box(rng)),
    )


@pytest.mark.parametrize("module", [nifc, usfs_closures, hms], ids=lambda m: m.SHARED.source)
def test_every_snapshot_reads_back_from_the_shared_cache_unchanged(module):
    # Property-style: two hundred generated snapshots per overlay, each one
    # equal after a trip through the row's body, and the same bytes when
    # written twice, so an unchanged snapshot is an unchanged row.
    rng = random.Random(760)
    for _ in range(200):
        original = _random_snapshot(rng, module)
        body = module.SHARED.pack(original)
        assert module.SHARED.unpack(body) == original
        assert module.SHARED.pack(original) == body


def test_the_three_overlays_name_three_rows():
    assert [m.SHARED.source for m in (nifc, usfs_closures, hms)] == ["wildfires", "closures", "smoke"]


def _envelope(payload: object) -> bytes:
    return gzip.compress(json.dumps(payload).encode())


@pytest.mark.parametrize(
    "body",
    [
        _envelope({"format": 2, "snapshot": {}}),
        _envelope({"snapshot": {}}),
        _envelope({"format": 1}),
        _envelope({"format": 1, "snapshot": {"fetched_at_ms": 1}}),
        _envelope([1, 2, 3]),
        b"not gzip at all",
        gzip.compress(b"not json"),
    ],
    ids=["newer-format", "no-format", "no-snapshot", "missing-fields", "not-an-object", "not-gzip", "not-json"],
)
def test_a_row_this_release_cannot_read_is_refused_rather_than_misread(body):
    with pytest.raises(snapshot.SharedSnapshotUnreadable):
        nifc.SHARED.unpack(body)


def test_every_overlay_registers_its_refresh_at_its_own_ttl():
    # The interval is the TTL knob each pod refreshed on alone, so the pods
    # together ask the upstream as often as one did. The source's own deadline
    # sits past `publish`'s, which is the one that words the failure.
    for module in (nifc, usfs_closures, hms):
        source = refresh._sources[module.SHARED.source]
        assert source.interval_s == module.TTL_S
        assert source.deadline_s > snapshot.SHARED_REFRESH_DEADLINE_S


def _publisher(fetch) -> SnapshotCache[nifc.Snapshot]:
    return nifc.perimeter_cache(fetch=fetch)


async def test_a_failed_shared_refresh_counts_and_says_why_in_the_503s_words():
    # The refresh records the message for every reader's 503, so it has to be
    # the sentence, never the exception's own text with a URL in it.
    async def unreachable() -> nifc.Snapshot:
        raise httpx.ConnectError("[Errno -2] Name or service not known")

    before = _failures(nifc.PROVIDER)
    with pytest.raises(UpstreamError) as raised:
        await _publisher(unreachable).publish()
    assert raised.value.message == f"Cannot reach {nifc.PROVIDER}. Try again later."
    assert _failures(nifc.PROVIDER) == before + 1


async def test_a_refused_shared_refresh_keeps_the_upstreams_wait():
    refusal = UpstreamRateLimited(nifc.PROVIDER, "minutely", 120, "Wildfire data is rate-limited. Try again later.")

    async def refused() -> nifc.Snapshot:
        raise refusal

    with pytest.raises(UpstreamRateLimited) as raised:
        await _publisher(refused).publish()
    # The same object, so `refresh` records its `retry_after_s`.
    assert raised.value is refusal


async def test_a_hung_shared_refresh_ends_at_its_deadline(monkeypatch):
    monkeypatch.setattr(snapshot, "SHARED_REFRESH_DEADLINE_S", 0.05)

    async def hang() -> nifc.Snapshot:
        await asyncio.sleep(30)
        raise AssertionError("not reached")

    with pytest.raises(UpstreamError) as raised:
        await asyncio.wait_for(_publisher(hang).publish(), timeout=5)
    assert raised.value.message == f"{nifc.PROVIDER} took too long. Try again later."
