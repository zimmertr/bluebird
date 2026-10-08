from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app import body_limit, ratelimit, telemetry
from app.error_codes import ApiError, ErrorCode
from app.models import (
    MAX_ANALYZE_PEAKS,
    AnalysisRefusal,
    DestinationsRequest,
    DestinationsResponse,
    DestinationType,
    DiscoveredDestination,
    ErrorResponse,
    bbox_area_km2,
)
from app.services.candidates import (
    _filter_elevation,
    _merge_custom,
    _refusal_body,
    _resolve_custom_reporting,
    _suggest_elevation_floor,
    discover,
)
from app.services.ranking import _noun, _truncate_top_elevation

log = logging.getLogger(__name__)
router = APIRouter()


@asynccontextmanager
async def _overpass_slot(http_request: Request, needed: bool) -> AsyncIterator[None]:
    """The client's discovery slot while `needed`, else nothing.

    The wait that runs out is the same 429 the analyze routes answer
    (`ratelimit.discovery_in_flight`); raised here rather than yielded,
    because this route has not started answering when it takes the slot.
    """
    if not needed:
        yield
        return
    async with ratelimit.discovery_in_flight(http_request) as refused:
        if refused is not None:
            raise refused
        yield


@router.post(
    "/destinations",
    response_model=DestinationsResponse,
    tags=["analysis"],
    summary="Discover and resolve destinations without forecasts",
    description=(
        "The discovery half of `POST /api/analyze` on its own: every named "
        "destination of the requested type inside the polygon, with no "
        "forecasts attached. Discovery is never sampled, and the same "
        "candidate ceiling applies, so a list that would refuse there "
        "refuses identically here.\n\n"
        "It also *resolves* `custom_destinations`, matching each caller-"
        "supplied coordinate to the nearest OSM peak to fill in the elevation "
        "and OSM id that a bare coordinate pair cannot carry. Send a custom "
        "list alone (with an empty `destination_types`) to resolve without "
        "discovering anything, or alongside a polygon to get both in one "
        "call.\n\n"
        "This exists so a browser client can fetch forecasts itself, "
        "spending its own Open-Meteo quota instead of this deployment's — "
        "which is exactly what the bundled web app does. If you are building "
        "a client and want ranked forecasts in one call, `POST /api/analyze` "
        "remains the endpoint for that."
    ),
    dependencies=[Depends(ratelimit.destinations_rate_limit)],
    responses={
        413: body_limit.TOO_LARGE_RESPONSE,
        400: {
            "model": AnalysisRefusal,
            "description": (
                "The request parsed but describes nothing to do: neither a "
                "polygon nor a custom list was sent, no types were requested and "
                "there is no list to resolve, a requested type is not yet "
                "implemented, or the polygon contains more candidates than "
                "the analysis ceiling. Over-cap refusals carry the structured "
                "remedy fields; send `top_by_elevation: true` to elect an "
                "explicit top-N result instead."
            ),
        },
        429: {
            "model": ErrorResponse,
            "description": (
                "This client is discovering faster than the per-address limit "
                "(its own bucket, independent of the analyze endpoints), or a "
                "second discovery from this address waited too long behind its "
                "first. `Retry-After` says how many seconds to wait."
            ),
        },
        502: {
            "model": ErrorResponse,
            "description": "Every Overpass mirror failed. Transient and worth retrying.",
        },
        503: {
            "model": ErrorResponse,
            "description": (
                "This instance's Overpass budget stayed saturated too long. "
                "Transient; `Retry-After` says when a retry is worthwhile."
            ),
        },
    },
)
async def destinations(
    request: DestinationsRequest, http_request: Request
) -> DestinationsResponse | JSONResponse:
    parts = [
        f"types={','.join(t.value for t in request.destination_types) or 'none'}"
    ]
    if request.polygon is not None:
        ring = request.polygon.coordinates[0]
        parts.append(f"polygon={max(0, len(ring) - 1)}pts")
        parts.append(f"area={bbox_area_km2(ring):.0f}km2")
    if request.custom_destinations:
        parts.append(f"custom={len(request.custom_destinations)}")
    log.info("Destinations request: %s", " ".join(parts))

    if not request.destination_types:
        # No types requested means discovery is skipped entirely, exactly as
        # on POST /api/analyze. Without a list there is genuinely nothing to do.
        if not request.custom_destinations:
            raise ApiError(
                status_code=400,
                detail=(
                    "Nothing to do: no destination_types to discover and no "
                    "custom_destinations to resolve. Pick types from "
                    "GET /api/capabilities, or send a custom list."
                ),
                code=ErrorCode.validation,
            )
    elif request.polygon is None:
        raise ApiError(
            status_code=400,
            detail=(
                "polygon is required when destination_types is non-empty. Send "
                "a polygon to discover, or custom_destinations alone to "
                "resolve a list."
            ),
            code=ErrorCode.validation,
        )

    # One discovery per client address at a time, shared with the analyze
    # routes (#627, #660), held around what asks Overpass and nothing else: a
    # polygon's discovery, and a custom list's lookup when the request asks
    # for one and a row needs it. A request that asks the map server nothing
    # (the web app's own analysis, which sends `elevation_lookup: false` and
    # every elevation it has learned) is answered with the rows as sent and
    # takes no slot, so it never waits behind that address's
    # lookup in flight (#673).
    needs_lookup = bool(request.custom_destinations) and request.elevation_lookup and any(
        d.elevation_ft is None for d in request.custom_destinations or []
    )
    async with _overpass_slot(http_request, bool(request.destination_types) or needs_lookup):
        found: list[dict] = []
        if request.destination_types and request.polygon is not None:
            found = await discover(
                request.polygon,
                request.destination_types,
                include_unnamed_peaks=request.include_unnamed_peaks,
            )

        # Resolved before the band filter, so an elevation the caller never
        # knew is one the band can actually act on.
        lookup_complete = True
        if request.custom_destinations:
            custom, lookup_complete = await _resolve_custom_reporting(
                request.custom_destinations, lookup=request.elevation_lookup
            )
            found = _merge_custom(found, custom)

    found = _filter_elevation(
        found, request.min_elevation_ft, request.max_elevation_ft
    )
    total_found: int | None = None
    truncated = False
    if len(found) > MAX_ANALYZE_PEAKS:
        if request.top_by_elevation:
            total_found = len(found)
            found = _truncate_top_elevation(found, MAX_ANALYZE_PEAKS)
            truncated = True
        else:
            suggestion = _suggest_elevation_floor(found, MAX_ANALYZE_PEAKS)
            # A union is a mixed set, so its refusal says "destinations" —
            # the same noun rule the analyze routes apply.
            noun = _noun(
                request.destination_types,
                has_custom=bool(request.custom_destinations),
            )
            return JSONResponse(
                status_code=400,
                content=_refusal_body(len(found), noun, suggestion=suggestion),
            )

    telemetry.DESTINATIONS_RETURNED.observe(len(found))
    rows = [
        DiscoveredDestination(
            name=d["name"],
            # Every row carries its own type — discovery classifies each
            # element from its tags, custom rows are tagged "custom" — so
            # there is no request-level type left to fall back to.
            type=d.get("type", DestinationType.custom.value),
            latitude=d["latitude"],
            longitude=d["longitude"],
            elevation_ft=d.get("elevation_ft"),
            osm_id=d.get("osm_id"),
        )
        for d in found
    ]
    log.info(
        "Returning %d destination(s)%s",
        len(rows),
        f" (top by elevation of {total_found})" if truncated else "",
    )
    return DestinationsResponse(
        destinations=rows,
        total=len(rows),
        total_found=total_found,
        truncated=truncated,
        elevation_lookup_complete=lookup_complete,
    )
