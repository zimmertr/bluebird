"""The overlay snapshots in the shared cache (#760): written by one pod's
refresh, read by every pod, and never the reason a request fails.

What is pinned here is the reader's side of record 0077 with the row's age in
place of the pod's own: a row a day old is the 503 a cold pod gives, an
unchanged row is the same object (so `HeldBodies` gzips it once), and a
database that cannot answer sends the pod back to the upstream as if there
were none. The envelope itself, and a shared refresh's failure wording, need
no database and are in test_snapshot_cache.py.
"""

from __future__ import annotations

import gzip
import json
from contextlib import asynccontextmanager
from datetime import date

import httpx
import pytest
from test_fire_activity import _snapshot as _detections
from test_hms import _kml, _placemark
from test_nifc import _polygon, _snapshot, counting_calls
from test_usfs_closures import _mixed

from app import db
from app.db import refresh
from app.error_codes import ApiError
from app.main import app
from app.services import fire_activity, hms, nifc, usfs_closures
from app.services.errors import UpstreamRateLimited
from app.services.snapshot import SHARED_POLL_S, Shared, snapshot_or_503

pytestmark = pytest.mark.db


class _Clock:
    def __init__(self, t: float = 1000.0):
        self.t = t

    def __call__(self) -> float:
        return self.t


class _Upstream:
    """A fetch that answers `snapshot` and counts how often it was asked."""

    def __init__(self, snapshot=None):
        self.snapshot = snapshot
        self.calls = 0

    async def __call__(self):
        self.calls += 1
        if self.snapshot is None:
            raise AssertionError("a reader reached the upstream")
        return self.snapshot


def _fire(name: str = "Goat Rocks Fire", fetched_at_ms: int = 1_722_470_000_000) -> nifc.Snapshot:
    return _snapshot(_polygon(-121.9, 46.7, -121.5, 47.0, name=name), fetched_at_ms=fetched_at_ms)


async def _publish(snapshot: nifc.Snapshot) -> None:
    """One refresh by the pod holding the lock, with this answer from NIFC."""
    await nifc.perimeter_cache(fetch=_Upstream(snapshot)).publish()


async def _execute(sql: str, params: tuple = ()) -> None:
    async with db.connection() as conn:
        await conn.execute(sql, params)  # type: ignore[arg-type]


def _smoke() -> hms.Snapshot:
    features = hms.parse_kml(_kml(_placemark(), _placemark(style="#Smoke_Heavy_style")))
    return hms.Snapshot(
        fetched_at_ms=1_722_470_000_000,
        analysis_date="2026-08-04",
        plumes=len(features),
        body=hms.collection_json(1_722_470_000_000, date(2026, 8, 4), features),
    )


# ── The writer ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("module", "factory", "build"),
    [
        (nifc, nifc.perimeter_cache, _fire),
        (usfs_closures, usfs_closures.closure_cache, _mixed),
        (hms, hms.smoke_cache, _smoke),
        (fire_activity, fire_activity.detection_cache, _detections),
    ],
    ids=["wildfires", "closures", "smoke", "fire_activity"],
)
async def test_a_refresh_writes_the_row_every_pod_reads(database, module, factory, build):
    snapshot = build()
    writer = factory(fetch=_Upstream(snapshot))
    assert await refresh.run_if_due(writer.source()) is True

    shared = module.SHARED
    async with db.connection() as conn:
        row = await (
            await conn.execute(
                "SELECT now() - fetched_at < interval '1 minute', body FROM snapshots WHERE source = %s",
                (shared.source,),
            )
        ).fetchone()
    assert row is not None and row[0]
    assert shared.unpack(row[1]) == snapshot

    # Another pod, which never asks the upstream, serves the same snapshot
    # with the upstream's own fetch time.
    reader = factory(fetch=_Upstream())
    served = await reader.get()
    assert served == snapshot
    assert served.fetched_at_ms == snapshot.fetched_at_ms


async def test_a_preview_reads_the_row_too(database, monkeypatch):
    await _publish(_fire())
    monkeypatch.setattr(db, "READ_ONLY", True)
    upstream = _Upstream()
    assert await nifc.perimeter_cache(fetch=upstream).get() == _fire()
    assert upstream.calls == 0


async def test_the_route_serves_the_shared_snapshot(database):
    await _publish(_fire(fetched_at_ms=1_790_000_000_000))
    # ASGITransport runs no lifespan, so the app neither opens a second pool
    # nor starts the refresh loop against the real upstreams.
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/wildfires", params={"bbox": "-122.5,46.0,-121.0,47.5"})
    assert response.status_code == 200
    body = response.json()
    assert body["fetched_at"] == 1_790_000_000_000
    assert [f["properties"]["attr_IncidentName"] for f in body["features"]] == ["Goat Rocks Fire"]


async def test_the_fire_activity_route_serves_the_shared_snapshot(database):
    # The detections ride the row as columns, so this is the one overlay whose
    # served text is written after the read rather than stored.
    await fire_activity.detection_cache(fetch=_Upstream(_detections())).publish()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/fire-activity", params={"bbox": "-117,45.5,-116,46.5"})
    assert response.status_code == 200
    body = response.json()
    assert [f["geometry"]["coordinates"] for f in body["features"]] == [[-116.47974, 46.09978]]


# ── The reader ────────────────────────────────────────────────────────────────


async def test_an_unchanged_row_is_the_same_object_and_is_not_read_again(database, monkeypatch):
    await _publish(_fire())
    unpacks = counting_calls(monkeypatch, Shared, "unpack")
    clock = _Clock()
    reader = nifc.perimeter_cache(clock=clock, fetch=_Upstream())
    first = await reader.get()
    assert len(unpacks) == 1

    clock.t += SHARED_POLL_S + 1
    assert await reader.get() is first
    await reader.settle()
    assert await reader.get() is first
    # The row was asked about again, and its body never crossed the wire.
    assert len(unpacks) == 1


async def test_a_newer_row_replaces_the_object(database):
    await _publish(_fire("Old Fire", fetched_at_ms=1))
    clock = _Clock()
    reader = nifc.perimeter_cache(clock=clock, fetch=_Upstream())
    old = await reader.get()

    await _publish(_fire("New Fire", fetched_at_ms=2))
    # Inside the poll window the pod still serves what it read.
    assert await reader.get() is old
    clock.t += SHARED_POLL_S + 1
    # Past it the old copy is served while the row is read behind the request.
    assert await reader.get() is old
    await reader.settle()
    new = await reader.get()
    assert new is not old
    assert new == _fire("New Fire", fetched_at_ms=2)


async def test_a_row_older_than_a_day_answers_the_503_with_the_refreshs_reason(database):
    # One good refresh, then a day of failures: the row ages past record 0077's
    # limit and every reader answers what the refreshing pod last heard.
    await _publish(_fire())
    await _execute("UPDATE snapshots SET fetched_at = now() - interval '25 hours'")
    refusal = UpstreamRateLimited(nifc.PROVIDER, "minutely", 120, "Wildfire data is rate-limited. Try again later.")

    async def refused():
        raise refusal

    failing = nifc.perimeter_cache(fetch=refused)
    assert await refresh.run_if_due(failing.source()) is True

    upstream = _Upstream(_fire("Never served"))
    reader = nifc.perimeter_cache(fetch=upstream)
    with pytest.raises(ApiError) as answered:
        await snapshot_or_503(reader, event="test")
    assert answered.value.status_code == 503
    assert answered.value.code == "snapshot_unavailable"
    assert answered.value.detail == "Wildfire data is rate-limited. Try again later."
    assert answered.value.headers == {"Retry-After": "120"}
    assert upstream.calls == 0


async def test_the_age_is_the_rows_not_the_moment_a_pod_read_it(database):
    # A row ten minutes old, read for the first time just now: a pod that
    # counted from its own read would call it fresh. Against a five-minute
    # limit it is already too old, and against a fifteen-minute one it serves.
    await _publish(_fire())
    await _execute("UPDATE snapshots SET fetched_at = now() - interval '10 minutes'")
    strict = nifc.perimeter_cache(fetch=_Upstream(), max_stale_s=5 * 60)
    with pytest.raises(ApiError) as answered:
        await snapshot_or_503(strict, event="test")
    assert answered.value.status_code == 503
    lenient = nifc.perimeter_cache(fetch=_Upstream(), max_stale_s=15 * 60)
    assert await lenient.get() == _fire()


async def test_no_row_yet_answers_the_503_without_asking_the_upstream(database):
    upstream = _Upstream(_fire())
    reader = nifc.perimeter_cache(fetch=upstream)
    with pytest.raises(ApiError) as answered:
        await snapshot_or_503(reader, event="test")
    assert answered.value.status_code == 503
    assert answered.value.detail == f"{nifc.PROVIDER} is unavailable."
    assert answered.value.headers == {"Retry-After": "60"}
    assert upstream.calls == 0


async def test_the_route_answers_503_with_retry_after_when_no_row_exists(database):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/smoke")
    assert response.status_code == 503
    assert response.headers["Retry-After"] == "60"
    assert response.json()["error"] == {"code": "snapshot_unavailable", "retryable": True}


# ── A database that cannot answer ─────────────────────────────────────────────


async def test_a_database_that_cannot_answer_sends_the_pod_to_the_upstream(database, monkeypatch):
    await _publish(_fire("Shared Fire"))

    @asynccontextmanager
    async def down():
        raise db.DatabaseUnavailable("connection refused")
        yield

    monkeypatch.setattr(db, "connection", down)
    upstream = _Upstream(_fire("Own Fire"))
    reader = nifc.perimeter_cache(fetch=upstream)
    assert await reader.get() == _fire("Own Fire")
    assert upstream.calls == 1


async def test_a_row_in_another_format_sends_the_pod_to_the_upstream(database):
    # What a pod of this release meets while a canary of the next one writes.
    body = gzip.compress(json.dumps({"format": nifc.SHARED.format + 1, "snapshot": {}}).encode())
    await _execute(
        "INSERT INTO snapshots (source, fetched_at, body) VALUES ('wildfires', now(), %s)", (body,)
    )
    upstream = _Upstream(_fire("Own Fire"))
    reader = nifc.perimeter_cache(fetch=upstream)
    assert await reader.get() == _fire("Own Fire")
    assert upstream.calls == 1
