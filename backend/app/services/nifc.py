"""Active US wildfire perimeters, fetched once per pod instead of once per visitor.

Every browser used to query NIFC's ArcGIS feature service directly: once per
analysis for the proximity check, and again on every debounced map pan for the
overlay. That quota belongs to NIFC's ArcGIS *organization*, not to its callers,
and is shared by every consumer of the public WFIGS dataset, so it empties and
refills on traffic Bluebird has no part in and cannot influence. The intermittent
"Wildfire check unavailable" label was Bluebird losing a race it never entered
(issue #203). Fetching here turns N visitors into one caller.

Two facts about the dataset shape everything below. Measured 2026-07-31 against
the live layer, at 232 active wildfires nationally:

    full resolution     16.5 MB     861,000 vertices
    ~56 m simplified     1.3 MB      65,000 vertices

First, the whole country is small enough to hold, so nothing here keys on the
caller's bounding box. One national snapshot answers every question anyone can
ask, and a viewport nobody has looked at yet costs no extra upstream request.

Second, both fidelities are worth keeping, because the two consumers want
different things from the same snapshot. The proximity check is safety math and
gets full resolution. The map overlay is a picture and gets the simplified copy,
which is what keeps a zoomed-out viewport from shipping 16.5 MB to a phone. Both
come out of one refresh, so the outline a user sees is the outline the warning
measured, rather than two queries that landed at different moments.

Features are held as the JSON text NIFC sent rather than as parsed objects.
16.5 MB of coordinates costs roughly 100 MB once Python boxes every float, and
serving a viewport would then mean re-encoding them on a 250m-CPU pod. Keeping
the bytes alongside a per-feature bounding box makes a request a filter and a
join instead.
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

import httpx

from app.services import wfigs_coverage
from app.services.errors import UpstreamError, UpstreamRateLimited, classify_http_error
from app.services.snapshot import SnapshotCache

log = logging.getLogger(__name__)

PROVIDER = "NIFC (wildfire perimeters)"

# WFIGS "Interagency Perimeters — Current", layer 0. The service already scopes
# this view to incidents not yet declared contained/controlled/out, so recency
# needs no extra filter of our own.
QUERY_URL = (
    "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/"
    "WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query"
)

HEADERS = {"User-Agent": "Bluebird/1.0 (bluebirdforecast.com; personal weather tool)"}

# The fields the popup renders. `attr_` values come from the joined IRWIN
# incident record and `poly_` from the perimeter polygon itself; either can be
# null on a fresh incident, which is why the browser coalesces them at render.
OUT_FIELDS = (
    "attr_IncidentName,"
    "poly_IncidentName,"
    "poly_GISAcres,"
    "attr_PercentContained,"
    "attr_ModifiedOnDateTime_dt,"
    "attr_FireDiscoveryDateTime"
)

# Prescribed burns share the layer with wildfires and are not a hazard anyone is
# hiking away from.
WHERE = "attr_IncidentTypeCategory='WF'"

# The layer's own maxRecordCount. Sending it explicitly makes the paging loop
# below deterministic instead of dependent on a server default that can change.
PAGE_SIZE = 2000

# Douglas-Peucker tolerance for the overlay copy, in degrees: ~56 m. Chosen
# against the only threshold that reads this geometry, the 10 mi (16,093 m) fire
# warning, where it is a 0.35% error and three times finer than the 161 m band
# inside which the UI already says "inside the perimeter". Re-measure if the
# warning radius ever tightens by an order of magnitude.
COARSE_OFFSET_DEG = 0.0005

# ~1 m. Trims coordinate noise from the payload without touching shape.
GEOMETRY_PRECISION = 5

# A national full-resolution fetch moves ~16.5 MB, which is slow but not slow
# enough to justify a partial answer.
REQUEST_TIMEOUT_S = 120.0

# Backstop on the paging loop. 232 fires burn nationally today and the worst
# season on record would not approach this; it exists so a server that never
# clears `exceededTransferLimit` cannot spin forever.
MAX_PAGES = 20


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        log.warning("Ignoring non-integer %s=%r; using default %d", name, raw, default)
        return default


# NIFC republishes roughly every 5 minutes and perimeters are redrawn by humans
# flying the fire, so a 10 minute snapshot is never the reason a warning is
# wrong. At 2 request units per query and two fidelities per refresh, this is
# 4 units per 10 minutes against an organization ceiling of 57,600 per minute.
TTL_S = _env_int("WILDFIRE_CACHE_TTL_S", 600)

# How long a failed refresh suppresses the next attempt. Without it every
# request during an outage becomes its own upstream attempt, which is the
# hammering the cache exists to stop, and ArcGIS's own answer to an exhausted
# quota asks for 60 seconds anyway.
RETRY_AFTER_FAILURE_S = _env_int("WILDFIRE_RETRY_AFTER_FAILURE_S", 60)


@dataclass(frozen=True)
class Fire:
    """One perimeter: its bounding box, and the GeoJSON text NIFC sent for it."""

    west: float
    south: float
    east: float
    north: float
    blob: str

    def intersects(self, west: float, south: float, east: float, north: float) -> bool:
        return not (self.east < west or self.west > east or self.north < south or self.south > north)


@dataclass(frozen=True)
class Snapshot:
    """One national fetch, at both fidelities, with the wall clock that produced it.

    ``fetched_at_ms`` is wall time because it is shown to a person ("retrieved
    4 min ago"). Freshness is tracked separately on the monotonic clock, which
    is the one that must not move when the host's clock is corrected.
    """

    fetched_at_ms: int
    full: tuple[Fire, ...]
    coarse: tuple[Fire, ...]

    def within(self, bbox: tuple[float, float, float, float], *, coarse: bool) -> list[Fire]:
        west, south, east, north = bbox
        fires = self.coarse if coarse else self.full
        return [f for f in fires if f.intersects(west, south, east, north)]


def collection_json(snapshot: Snapshot, fires: list[Fire]) -> str:
    """Assemble a GeoJSON FeatureCollection from stored feature text.

    ``fetched_at`` rides along as a GeoJSON foreign member rather than as a
    response header, so it survives being saved to a file or piped through a
    tool that keeps only the body. Map libraries ignore members they do not
    know, so it costs the browser nothing to carry.
    """
    return (
        '{"type":"FeatureCollection","fetched_at":'
        + str(snapshot.fetched_at_ms)
        # What the dataset covers, so an empty answer outside the US reads as
        # "not covered" rather than "nothing burning" (#256). Static, so it is
        # a second foreign member rather than a second endpoint.
        + ',"coverage":'
        + wfigs_coverage.COVERAGE_JSON
        + ',"features":['
        + ",".join(f.blob for f in fires)
        + "]}"
    )


def _bounds(coordinates: Any) -> tuple[float, float, float, float] | None:
    """Bounding box of an arbitrarily nested GeoJSON coordinate array.

    Written as a walk rather than per-geometry-type cases because the layer
    returns both Polygon and MultiPolygon and the answer is the same either way.
    """
    west = south = math.inf
    east = north = -math.inf
    stack: list[Any] = [coordinates]
    while stack:
        item = stack.pop()
        if not isinstance(item, list) or not item:
            continue
        if isinstance(item[0], (int, float)) and len(item) >= 2:
            lon, lat = float(item[0]), float(item[1])
            west = min(west, lon)
            east = max(east, lon)
            south = min(south, lat)
            north = max(north, lat)
        else:
            stack.extend(item)
    if west is math.inf:
        return None
    return west, south, east, north


def _to_fire(feature: dict[str, Any]) -> Fire | None:
    """One ArcGIS feature as a stored ``Fire``, or None if it carries no shape.

    A perimeter without geometry cannot be drawn or measured against, so it is
    dropped here rather than becoming a feature the browser has to skip.
    """
    geometry = feature.get("geometry")
    if not isinstance(geometry, dict):
        return None
    bounds = _bounds(geometry.get("coordinates"))
    if bounds is None:
        return None
    west, south, east, north = bounds
    return Fire(
        west=west,
        south=south,
        east=east,
        north=north,
        blob=json.dumps(feature, separators=(",", ":")),
    )


def _raise_for_arcgis_error(body: Any) -> None:
    """Surface an error ArcGIS reported inside an HTTP 200.

    ArcGIS answers an exhausted quota with 200 and the refusal in the body, so
    ``raise_for_status`` learns nothing:

        {"error":{"code":429,"message":"Unable to perform query. Too many
         requests.","details":["API calls quota exceeded (62896 request units)!
         maximum allowed request units (57600) per Minute. Retry after 60 sec."]}}

    Validating only that the body looks like a FeatureCollection reports this as
    a parsing problem, which sent an earlier investigation hunting through our
    own code for hours (issue #203).
    """
    error = body.get("error") if isinstance(body, dict) else None
    if not isinstance(error, dict):
        return
    code = error.get("code") if isinstance(error.get("code"), int) else None
    # 503 arrives in the same envelope when the service is merely overloaded.
    if code in (429, 503):
        raise UpstreamRateLimited(
            PROVIDER,
            "minutely",
            60,
            "Wildfire data is rate-limited. Try again later.",
        )
    raise UpstreamError("Wildfire data was rejected. Try again later.")


async def _fetch_layer(client: httpx.AsyncClient, simplify_deg: float | None) -> tuple[Fire, ...]:
    """Every active wildfire perimeter nationally, at one fidelity.

    No geometry filter at all. The layer is US-only, so asking for everything is
    both the smallest query to describe and the one that sidesteps the Aleutians
    straddling the antimeridian, where a west/east envelope is ill-defined.
    """
    fires: list[Fire] = []
    offset = 0
    for page in range(MAX_PAGES):
        params: dict[str, Any] = {
            "where": WHERE,
            "outFields": OUT_FIELDS,
            "returnGeometry": "true",
            "outSR": "4326",
            "geometryPrecision": GEOMETRY_PRECISION,
            "resultOffset": offset,
            "resultRecordCount": PAGE_SIZE,
            "f": "geojson",
        }
        if simplify_deg is not None:
            params["maxAllowableOffset"] = simplify_deg
        response = await client.get(QUERY_URL, params=params)
        response.raise_for_status()
        body = response.json()
        _raise_for_arcgis_error(body)
        features = body.get("features") if isinstance(body, dict) else None
        if not isinstance(features, list):
            raise UpstreamError("Wildfire data could not be read.")
        fires.extend(fire for fire in map(_to_fire, features) if fire is not None)
        if not body.get("exceededTransferLimit") or not features:
            return tuple(fires)
        offset += len(features)
    log.warning(
        "NIFC paging hit the %d page backstop at %d features; serving what arrived",
        MAX_PAGES,
        len(fires),
    )
    return tuple(fires)


async def fetch_snapshot() -> Snapshot:
    """Both fidelities of the national perimeter set, from one moment.

    Fetched concurrently so a cold pod waits for the slower of the two rather
    than their sum: the full-resolution copy is 13x the bytes of the coarse one,
    and the first visitor after a deploy pays that wait.
    """
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S, headers=HEADERS) as client:
        full, coarse = await asyncio.gather(
            _fetch_layer(client, None),
            _fetch_layer(client, COARSE_OFFSET_DEG),
        )
    return Snapshot(fetched_at_ms=int(time.time() * 1000), full=full, coarse=coarse)


def perimeter_cache(
    *,
    ttl_s: float = TTL_S,
    retry_after_failure_s: float = RETRY_AFTER_FAILURE_S,
    clock: Callable[[], float] = time.monotonic,
    fetch: Callable[[], Awaitable[Snapshot]] = fetch_snapshot,
) -> SnapshotCache[Snapshot]:
    """The shared snapshot cache, wired to this module's fetch and knobs.

    A factory rather than a subclass, because nothing about the caching is
    NIFC's: the singleflight, the serve-stale-and-refresh-behind, and the
    failure backoff all live in :mod:`app.services.snapshot`, shared with the
    smoke overlay that wants the same behavior for the same reason. What
    belongs here is which upstream it calls, and what a successful refresh is
    worth saying in a pod's log.
    """
    return SnapshotCache(
        label=PROVIDER,
        fetch=fetch,
        ttl_s=ttl_s,
        retry_after_failure_s=retry_after_failure_s,
        describe=lambda s: f"{len(s.full)} perimeters ({len(s.coarse)} coarse)",
        clock=clock,
    )


PERIMETERS = perimeter_cache()


def unavailable_message(exc: Exception) -> str:
    """The user-facing sentence for a cold-start failure."""
    if isinstance(exc, UpstreamError):
        return exc.message
    return classify_http_error(exc, PROVIDER)
