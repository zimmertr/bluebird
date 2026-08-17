from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app import ratelimit
from app.models import ErrorResponse
from app.services import nifc

log = logging.getLogger(__name__)
router = APIRouter()


class WildfireCollection(BaseModel):
    """A GeoJSON FeatureCollection, plus when Bluebird last heard from NIFC.

    Declared for the schema only: the handler returns pre-serialized text so a
    viewport is a filter and a join rather than a re-encode of every perimeter.
    """

    type: Literal["FeatureCollection"] = Field(
        description="Always `FeatureCollection`, so the body drops straight into a map library."
    )
    fetched_at: int = Field(
        description=(
            "When this instance last fetched perimeters from NIFC, in epoch "
            "milliseconds. A GeoJSON foreign member, which map libraries ignore. "
            "Perimeters are cached per instance and served past their refresh "
            "deadline when NIFC is unreachable, so this is the only honest "
            "statement of how current the shapes are. It is not when any "
            "individual fire was last surveyed: that is the per-feature "
            "`attr_ModifiedOnDateTime_dt`, which routinely runs days older."
        )
    )
    coverage: dict[str, Any] = Field(
        description=(
            "The area WFIGS covers, as a GeoJSON MultiPolygon geometry riding "
            "as a second foreign member: a coarse (±50 km, biased outward) "
            "outline of the United States, with Alaska split at the "
            "antimeridian so no ring wraps 180°. An empty `features` array for "
            "a bbox outside this geometry means the dataset cannot see that "
            "area, not that nothing is burning there. Static per release."
        )
    )
    features: list[dict[str, Any]] = Field(
        description=(
            "Active wildfire perimeters intersecting the requested bounding box, "
            "as NIFC's WFIGS layer returned them. Properties carry the incident "
            "name, acreage, containment percentage, and timestamps; `attr_` "
            "fields come from the joined IRWIN record and `poly_` fields from "
            "the perimeter polygon, so either may be null and callers should "
            "coalesce the pair."
        )
    )


def _parse_bbox(raw: str) -> tuple[float, float, float, float]:
    parts = raw.split(",")
    if len(parts) != 4:
        raise HTTPException(
            status_code=422,
            detail="bbox must be four comma-separated numbers: west,south,east,north.",
        )
    try:
        west, south, east, north = (float(p) for p in parts)
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="bbox must be four comma-separated numbers: west,south,east,north.",
        ) from None
    if not (-180 <= west <= 180 and -180 <= east <= 180):
        raise HTTPException(status_code=422, detail="bbox longitudes must be between -180 and 180.")
    if not (-90 <= south <= 90 and -90 <= north <= 90):
        raise HTTPException(status_code=422, detail="bbox latitudes must be between -90 and 90.")
    if south > north:
        raise HTTPException(status_code=422, detail="bbox south must not exceed north.")
    return west, south, east, north


@router.get(
    "/wildfires",
    tags=["wildfires"],
    summary="Active US wildfire perimeters in a bounding box",
    description=(
        "Active wildfire perimeters from NIFC's WFIGS \"Interagency Perimeters "
        "— Current\" layer, intersecting `bbox`.\n\n"
        "This exists because NIFC's ArcGIS quota belongs to *their* "
        "organization and is shared by every consumer of the public dataset, so "
        "a browser calling NIFC directly competes with the rest of the internet "
        "for it and loses at random. This instance fetches the national set on a "
        "timer and serves it to everyone, which reduces Bluebird's contribution "
        "to that quota to a fixed handful of requests per hour no matter how "
        "many people are looking at maps.\n\n"
        "Coverage is the United States only: NIFC does not publish perimeters "
        "elsewhere, so an empty result outside the US means \"not covered\", "
        "not \"nothing burning\".\n\n"
        "Perimeters are served past their refresh deadline when NIFC is "
        "unreachable, because a shape measured an hour ago still answers a "
        "10-mile proximity question correctly. Read `fetched_at` to see how "
        "current the answer is. Only an instance that has never completed a "
        "fetch answers 503."
    ),
    response_description="Perimeters intersecting the box, with the fetch timestamp.",
    response_model=WildfireCollection,
    responses={
        422: {
            "model": ErrorResponse,
            "description": "`bbox` was missing, malformed, or outside valid coordinate ranges.",
        },
        429: {
            "model": ErrorResponse,
            "description": (
                "This client is requesting faster than the per-address limit. "
                "`Retry-After` says how many seconds to wait. "
                "`GET /api/capabilities` publishes the limit."
            ),
        },
        503: {
            "model": ErrorResponse,
            "description": (
                "This instance has never completed a fetch from NIFC, so it has "
                "nothing to serve, not even stale. Transient; `Retry-After` says "
                "when to retry."
            ),
        },
    },
    dependencies=[Depends(ratelimit.wildfires_rate_limit)],
)
async def wildfires(
    bbox: str = Query(
        ...,
        description=(
            "Bounding box as `west,south,east,north` in decimal degrees "
            "(EPSG:4326). A perimeter is returned when its own bounding box "
            "overlaps this one."
        ),
        examples=["-121.9,46.7,-121.5,47.0"],
    ),
    detail: Literal["coarse", "full"] = Query(
        "coarse",
        description=(
            "Geometry fidelity. `coarse` simplifies perimeters to roughly 56 "
            "metres, which is far finer than a map pixel at any zoom that shows "
            "a whole fire and about a thirteenth of the bytes. `full` returns "
            "them as surveyed, for callers measuring distances rather than "
            "drawing shapes."
        ),
    ),
) -> Response:
    box = _parse_bbox(bbox)
    try:
        snapshot = await nifc.PERIMETERS.get()
    except Exception as exc:
        # Every failure that reaches here means the cache has nothing at all,
        # stale or otherwise: once one fetch has landed, get() serves it rather
        # than raising.
        retry_after = getattr(exc, "retry_after_s", 60)
        log.warning("event=wildfires_unavailable error=%s", exc)
        raise HTTPException(
            status_code=503,
            detail=nifc.unavailable_message(exc),
            headers={"Retry-After": str(retry_after)},
        ) from exc
    fires = snapshot.within(box, coarse=detail == "coarse")
    # Returned as a Response so FastAPI passes the stored feature text through
    # untouched; `response_model` above still documents the shape.
    return Response(
        content=nifc.collection_json(snapshot, fires),
        media_type="application/json",
    )
