"""The candidate set both discovery routes build.

`POST /api/analyze` and `POST /api/destinations` turn a request into the same
list of destinations: Overpass discovery with its one mapping from failures to
API errors, the caller's own list resolved against OSM and merged in, the
elevation band, and the over-cap refusal with its elevation-floor suggestion.
One module, so the two routes cannot answer the same request two ways.
"""

from __future__ import annotations

import logging
import math
from collections.abc import Sequence

from app import ratelimit
from app.error_codes import ApiError, ErrorCode
from app.models import (
    MAX_ANALYZE_PEAKS,
    AnalysisRefusal,
    ApiErrorInfo,
    DestinationType,
    GeoPolygon,
)
from app.services import osm
from app.services.errors import UpstreamError
from app.services.ranking import _cap_detail

log = logging.getLogger(__name__)


def _filter_elevation(destinations, min_ft, max_ft) -> list[dict]:
    """Drop candidates outside the requested elevation band.

    Unknown elevations pass through — many OSM peaks lack the tag and
    silently excluding them would be surprising.
    """
    if min_ft is None and max_ft is None:
        return destinations

    def keep(dest) -> bool:
        elev = dest.get("elevation_ft")
        if elev is None:
            return True
        if min_ft is not None and elev < min_ft:
            return False
        return not (max_ft is not None and elev > max_ft)

    return [d for d in destinations if keep(d)]


def _custom_dicts(custom_destinations) -> list[dict]:
    """The request's custom destinations in the same dict shape discovery
    produces. Each carries its own "type" so a mixed (union) response can tag
    every row by true source — discovered rows fall back to the request type."""
    return [
        {
            "name": d.name,
            "latitude": d.latitude,
            "longitude": d.longitude,
            "elevation_ft": d.elevation_ft,
            "osm_id": None,
            "type": "custom",
        }
        for d in custom_destinations
    ]


async def _resolve_custom(custom_destinations) -> list[dict]:
    """The request's custom destinations as candidate dicts, with elevation
    resolved from OSM wherever the caller did not supply one.

    Every path that turns `custom_destinations` into candidates goes through
    here rather than calling `_custom_dicts` directly, so no route can serve a
    custom row that skipped enrichment (issue #207).
    """
    return await osm.enrich_custom(_custom_dicts(custom_destinations))


def _coord_key(dest) -> str:
    return f"{dest['latitude']:.5f},{dest['longitude']:.5f}"


def _merge_custom(discovered: list[dict], custom: list[dict]) -> list[dict]:
    """Union of discovered + custom rows where the custom row wins a collision.

    A discovered row is dropped when a custom row claims its exact name (the
    identity rule query_osm already applies within its own results) or its
    5-decimal coordinate key (~1 m — the frontend's geoKey precedent). The
    user's own rows always survive; near-misses simply coexist as two rows.
    """
    names = {c["name"] for c in custom}
    coords = {_coord_key(c) for c in custom}
    kept = [
        d for d in discovered if d["name"] not in names and _coord_key(d) not in coords
    ]
    return kept + custom


def _suggest_elevation_floor(
    destinations: list[dict], cap: int
) -> tuple[int, int] | None:
    """A minimum elevation that would bring the candidate count under ``cap``.

    Returns ``(floor_ft, keeps)`` or None when no floor can work — which
    happens exactly when the unknown-elevation rows alone exceed the cap,
    since elevation filters always let unknowns through. The floor is rounded
    up to the next 100 ft so the suggestion reads like a number a person would
    type; rounding up can only keep fewer rows, never more, so the suggestion
    always actually works.
    """
    unknowns = sum(1 for d in destinations if d.get("elevation_ft") is None)
    budget = cap - unknowns
    if budget <= 0:
        return None
    known = sorted(
        (d["elevation_ft"] for d in destinations if d.get("elevation_ft") is not None),
        reverse=True,
    )
    if len(known) <= budget:
        return None  # already under cap; nothing to suggest
    threshold = known[budget - 1]
    floor = math.ceil(threshold / 100.0) * 100
    keeps = unknowns + sum(1 for e in known if e >= floor)
    return floor, keeps


def _refusal_body(
    count: int,
    noun: str,
    *,
    suggestion: tuple[int, int] | None,
) -> dict:
    """The structured 400 body (`AnalysisRefusal`) for an over-cap refusal."""
    body = AnalysisRefusal(
        detail=_cap_detail(count, noun),
        error=ApiErrorInfo.for_code(ErrorCode.refusal),
        found=count,
        limit=MAX_ANALYZE_PEAKS,
    )
    if suggestion is not None:
        body.suggested_min_elevation_ft = float(suggestion[0])
        body.suggested_keeps = suggestion[1]
    # Dumped in JSON mode because this dict is rendered by hand on both paths:
    # as a JSONResponse body, and spread into an SSE event.
    return body.model_dump(mode="json")


async def discover(
    polygon: GeoPolygon,
    destination_types: Sequence[DestinationType],
    *,
    include_unnamed_peaks: bool = False,
    on_status: osm.StatusCallback | None = None,
) -> list[dict]:
    """Overpass discovery, with the one mapping from its failures to API errors.

    Four causes, four answers, and the sentence an unrecognized failure gives a
    caller is as much the contract as the code beside it. Every route that
    discovers raises them identically, so the ladder lives here rather than
    once per route, where a fifth cause would have to be remembered three times
    (issue #384).

    `on_status` is Overpass's only progress signal — mirror failover — and is
    passed straight through: a route that has nowhere to show it leaves it
    None.
    """
    try:
        return await osm.query_osm(
            polygon,
            destination_types,
            on_status,
            include_unnamed_peaks=include_unnamed_peaks,
        )
    except NotImplementedError as e:
        raise ApiError(status_code=400, detail=str(e), code=ErrorCode.validation) from e
    except ratelimit.BudgetExhausted as e:
        raise ApiError(
            status_code=503,
            detail=e.message,
            code=ErrorCode.busy,
            headers={"Retry-After": str(e.retry_after_s)},
        ) from e
    except UpstreamError as e:
        raise ApiError(
            status_code=502, detail=e.message, code=ErrorCode.upstream_unavailable
        ) from e
    except Exception as e:
        log.exception("Destination search failed")
        raise ApiError(
            status_code=502,
            detail="OpenStreetMap is not available. Try again later.",
            code=ErrorCode.upstream_unavailable,
        ) from e
