from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse

from app import ratelimit
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
from app.routes.analyze import (
    _filter_elevation,
    _noun,
    _refusal_body,
    _suggest_elevation_floor,
    _truncate_top_elevation,
)
from app.services import osm
from app.services.errors import UpstreamError

log = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/destinations",
    response_model=DestinationsResponse,
    tags=["analysis"],
    summary="Discover destinations without forecasts",
    description=(
        "The discovery half of `POST /api/analyze` on its own: every named "
        "destination of the requested type inside the polygon, with no "
        "forecasts attached. Discovery is never sampled, and the same "
        "candidate ceiling applies, so a list that would refuse there "
        "refuses identically here.\n\n"
        "This exists so a browser client can fetch forecasts itself, "
        "spending its own Open-Meteo quota instead of this deployment's — "
        "which is exactly what the bundled web app does. If you are building "
        "a client and want ranked forecasts in one call, `POST /api/analyze` "
        "remains the endpoint for that."
    ),
    dependencies=[Depends(ratelimit.destinations_rate_limit)],
    responses={
        400: {
            "model": AnalysisRefusal,
            "description": (
                "The request parsed but is not discoverable: the destination "
                "type is `custom` (caller-supplied, nothing to discover) or "
                "not yet implemented, or the polygon contains more candidates "
                "than the analysis ceiling. Over-cap refusals carry the "
                "structured remedy fields; send `top_by_elevation: true` to "
                "elect an explicit top-N result instead."
            ),
        },
        429: {
            "model": ErrorResponse,
            "description": (
                "This client is discovering faster than the per-address limit "
                "(its own bucket, independent of the analyze endpoints). "
                "`Retry-After` says how many seconds to wait."
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
async def destinations(request: DestinationsRequest) -> DestinationsResponse:
    ring = request.polygon.coordinates[0]
    log.info(
        "Destinations request: type=%s polygon=%dpts area=%.0fkm2",
        request.destination_type.value,
        max(0, len(ring) - 1),
        bbox_area_km2(ring),
    )

    if request.destination_type == DestinationType.custom:
        raise HTTPException(
            status_code=400,
            detail=(
                "Custom destinations are supplied by the caller, so there is "
                "nothing to discover. Pick a discoverable type from "
                "GET /api/capabilities."
            ),
        )

    try:
        found = await osm.query_osm(request.polygon, request.destination_type)
    except NotImplementedError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ratelimit.BudgetExhausted as e:
        raise HTTPException(
            status_code=503,
            detail=e.message,
            headers={"Retry-After": str(e.retry_after_s)},
        )
    except UpstreamError as e:
        raise HTTPException(status_code=502, detail=e.message)
    except Exception as e:  # noqa: BLE001 — any OSM failure maps to a 502
        raise HTTPException(status_code=502, detail=f"OSM query failed: {e}")

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
            return JSONResponse(
                status_code=400,
                content=_refusal_body(
                    len(found),
                    _noun(request.destination_type),
                    has_polygon=True,
                    has_custom=False,
                    suggestion=suggestion,
                ),
            )

    rows = [
        DiscoveredDestination(
            name=d["name"],
            type=request.destination_type.value,
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
        destinations=rows, total=len(rows), total_found=total_found, truncated=truncated
    )
