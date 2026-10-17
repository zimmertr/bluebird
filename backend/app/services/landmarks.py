"""Every named trailhead and crag in OpenStreetMap, fetched once per pod and served by bounding box (#734).

The basemap's tiles carry no trailhead at all and only the climbing points
that happen to be nodes, with OSM's ``climbing=`` tag dropped, so a crag, a
boulder and a single route all look alike and a crag mapped as a relation is
not there to click (measured 2026-10-15 at Index: 3 of 12 crags and 0 of 4
areas). The map draws them from here instead, through ``GET /api/landmarks``,
and the pod asks Overpass for the whole world rather than for each pan: a pan
against a donated server that was answering 504 on 2026-10-15 and 2026-10-16
would spend it for every reader, and the whole set is small.

Measured 2026-10-16 on overpass-api.de, worldwide, named features only:

    trailheads                 119.8 s     2.8 MB    12,954 (12,881 nodes)
    crags, areas, boulders     ~160 s      9.4 MB    14,630 (6,427 relations)
    both in one query          191.7 s     7.4 MB    27,584 with `out tags center`

Both halves are over the overlays' one-minute refresh deadline, so this is
not a ``SnapshotCache``. The pod fills it at startup, one kind at a time in
the order a reader misses them (trailheads, then crags), each kind retried
forever with an exponential backoff and logged at every step, and refreshes
the whole set once a day; a kind that has landed is served while the next is
still loading, and a held set is served however old it is, because a
trailhead does not move. The maintainer chose that shape on 2026-10-16. What
it costs is one Overpass slot for about five minutes per pod start, CI
containers included.

Features are held as the JSON text of a GeoJSON Feature each, beside the
point it stands at, so a request is a filter and a join, the way ``nifc.py``
holds perimeters.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from app import telemetry
from app.env import env_int
from app.models import DestinationType
from app.services import osm
from app.services.errors import UpstreamError

log = logging.getLogger(__name__)

PROVIDER = "OpenStreetMap (landmarks)"

# The kinds the snapshot holds, in the order they are fetched: the order a
# reader misses them, since a trailhead is where most trips start.
STAGES: tuple[DestinationType, ...] = (DestinationType.trailhead, DestinationType.crag)

# The whole of one mirror attempt, and the `[timeout:N]` the query carries on
# that mirror. The mirror table's 25 s is for a polygon; the worldwide crag
# query measured 160 s and the trailhead one 120 s on 2026-10-16, with the
# server at capacity, so 300 s leaves the slower one room without holding a
# slot through a mirror that has stopped answering.
ATTEMPT_TIMEOUT_S = 300.0

# How long a complete set stands before the pod asks again. A day: OSM edits
# a trailhead or a crag rarely, and each refresh is about five minutes of a
# donated server's time.
REFRESH_S = env_int("LANDMARKS_REFRESH_S", 24 * 60 * 60)

# The backoff after a failed fetch of one kind: a minute, doubling to an hour,
# and never giving up. The first minute matches the mirror chain's own
# cooldown; the hour keeps a pod that boots into an Overpass outage from
# asking more than a few times an hour for as long as it lasts.
BACKOFF_FIRST_S = 60.0
BACKOFF_MAX_S = 60.0 * 60.0

# What the route says while nothing has landed yet. The loader's own last
# error, when it has one, says why instead.
LOADING_DETAIL = "Trailheads and crags are still loading. Try again later."


@dataclass(frozen=True)
class Landmark:
    """One feature: where it stands, and the GeoJSON text the route sends for it."""

    lat: float
    lon: float
    blob: str

    def inside(self, west: float, south: float, east: float, north: float) -> bool:
        return west <= self.lon <= east and south <= self.lat <= north


@dataclass(frozen=True)
class Snapshot:
    """What the pod holds now, with the wall clock of the last kind to land.

    ``fetched_at_ms`` is wall time because it is shown to a person; the
    loader's own schedule runs on the event loop's clock.
    """

    fetched_at_ms: int
    features: tuple[Landmark, ...]

    def within(self, bbox: tuple[float, float, float, float]) -> list[Landmark]:
        west, south, east, north = bbox
        return [f for f in self.features if f.inside(west, south, east, north)]


def collection_json(snapshot: Snapshot, features: list[Landmark]) -> str:
    """A GeoJSON FeatureCollection from the stored feature text.

    ``fetched_at`` rides as a foreign member for the reason the wildfire route
    gives: it survives a save to a file, and a map library ignores it.
    """
    return (
        '{"type":"FeatureCollection","fetched_at":'
        + str(snapshot.fetched_at_ms)
        + ',"features":['
        + ",".join(f.blob for f in features)
        + "]}"
    )


def parse_elements(elements: list[dict[str, Any]], kind: DestinationType) -> tuple[Landmark, ...]:
    """The landmarks of one kind in an Overpass answer, deduplicated by OSM id.

    Classified by their own tags through the discovery query's ``_classify``,
    so a feature here is a feature a polygon search would type the same way,
    and an element the clauses matched but the classifier does not know (a
    tagging change upstream) is dropped rather than typed wrong. Identity is
    the OSM id rather than the name: a polygon search dedups by name because
    OSM carries duplicate nodes for one summit, but a marker stands where its
    feature is, and two trailheads of one name on two trails are two places.
    """
    out: list[Landmark] = []
    seen: set[str] = set()
    for element in elements:
        tags = element.get("tags") or {}
        name = tags.get("name")
        if not name or osm._classify(tags) != kind.value:
            continue
        if element.get("type") == "node":
            lat, lon = element.get("lat"), element.get("lon")
        else:
            center = element.get("center") or {}
            lat, lon = center.get("lat"), center.get("lon")
        if lat is None or lon is None:
            continue
        osm_id = f"{element.get('type')}/{element.get('id')}"
        if osm_id in seen:
            continue
        seen.add(osm_id)
        feature = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "name": name,
                "kind": kind.value,
                "osm_id": osm_id,
                "elevation_ft": osm._ele_ft(tags),
            },
        }
        out.append(Landmark(lat=lat, lon=lon, blob=json.dumps(feature, separators=(",", ":"))))
    return tuple(out)


async def fetch_stage(kind: DestinationType) -> tuple[Landmark, ...]:
    """Every named feature of one kind, worldwide, through the mirror chain."""
    # Through the package rather than `osm.mirrors`, the way every caller
    # outside the package reaches the chain, so a test's stub on the package
    # is the function this calls.
    data = await osm._post_with_fallback(
        osm.build_world_query(kind), path="snapshot", attempt_timeout_s=ATTEMPT_TIMEOUT_S
    )
    return parse_elements(data.get("elements", []), kind)


class LandmarkLoader:
    """The startup task that fills the snapshot and keeps it filled.

    ``fetch``, ``sleep`` and ``clock`` are injectable so a test can run the
    loop against canned answers without waiting out a backoff.
    """

    def __init__(
        self,
        *,
        fetch: Callable[[DestinationType], Awaitable[tuple[Landmark, ...]]] = fetch_stage,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
        clock: Callable[[], float] = time.time,
        refresh_s: float = REFRESH_S,
        backoff_first_s: float = BACKOFF_FIRST_S,
        backoff_max_s: float = BACKOFF_MAX_S,
    ) -> None:
        self._fetch = fetch
        self._sleep = sleep
        self._clock = clock
        self._refresh_s = refresh_s
        self._backoff_first_s = backoff_first_s
        self._backoff_max_s = backoff_max_s
        self._held: dict[DestinationType, tuple[Landmark, ...]] = {}
        self._task: asyncio.Task[None] | None = None
        self.snapshot: Snapshot | None = None
        self.last_error: Exception | None = None
        # Created at 0 so the first failure is an increase an alert can see,
        # for the reason `telemetry.init_canary_series` gives.
        telemetry.SNAPSHOT_REFRESH_FAILURES.labels(provider=PROVIDER)

    def start(self) -> None:
        """Begin filling, behind the pod's startup. Idempotent."""
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self.run(), name="landmarks")

    async def stop(self) -> None:
        """End the loop, for shutdown and for tests."""
        task = self._task
        if task is None or task.done():
            return
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)

    async def run(self, *, forever: bool = True) -> None:
        """Fill every kind in order, then refresh the set on the interval.

        ``forever=False`` stops after one pass, for tests.
        """
        while True:
            for kind in STAGES:
                await self._fill(kind)
            if not forever:
                return
            log.info("Landmarks complete; next refresh in %.0f s", self._refresh_s)
            await self._sleep(self._refresh_s)

    async def _fill(self, kind: DestinationType) -> None:
        delay = self._backoff_first_s
        attempt = 1
        while True:
            log.info("Fetching every named %s worldwide from Overpass (attempt %d)", kind.value, attempt)
            try:
                features = await self._fetch(kind)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 — the loop must outlive any one failure
                self.last_error = exc
                telemetry.SNAPSHOT_REFRESH_FAILURES.labels(provider=PROVIDER).inc()
                reason = str(exc) or type(exc).__name__
                log.warning(
                    "Landmarks: %s fetch failed (%s); backing off %.0f s before attempt %d",
                    kind.value,
                    reason,
                    delay,
                    attempt + 1,
                )
                await self._sleep(delay)
                delay = min(delay * 2, self._backoff_max_s)
                attempt += 1
                continue
            self.last_error = None
            self._held[kind] = features
            self.snapshot = Snapshot(
                fetched_at_ms=int(self._clock() * 1000),
                features=tuple(f for stage in STAGES for f in self._held.get(stage, ())),
            )
            log.info("Landmarks: %d %s features held", len(features), kind.value)
            return

    def unavailable(self) -> UpstreamError:
        """Why there is nothing to serve, for the route's 503."""
        if isinstance(self.last_error, UpstreamError):
            return self.last_error
        return UpstreamError(LOADING_DETAIL)


LOADER = LandmarkLoader()
