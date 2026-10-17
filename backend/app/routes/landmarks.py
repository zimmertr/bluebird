from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, Field

from app import ratelimit
from app.models import ErrorResponse
from app.services import held_body, landmarks
from app.services.bbox import parse_bbox
from app.services.snapshot import unavailable_error

router = APIRouter()

# The gzipped worldwide answer, held per snapshot (#628): a box that takes in
# every feature is the same bytes until the set changes.
_WORLD = held_body.HeldBodies()


class LandmarkCollection(BaseModel):
    """A GeoJSON FeatureCollection of named trailheads and crags, plus when it was fetched.

    Declared for the schema only: the handler returns pre-serialized text so a
    viewport is a filter and a join rather than a re-encode of every feature.
    """

    type: Literal["FeatureCollection"] = Field(
        description="Always `FeatureCollection`, so the body drops straight into a map library."
    )
    fetched_at: int = Field(
        description=(
            "When the newest kind in this instance's set landed from Overpass, "
            "in epoch milliseconds. A GeoJSON foreign member, which map "
            "libraries ignore. The set is fetched once per instance start and "
            "refreshed about daily, and is served however old it is, because "
            "a trailhead or a crag does not move; this is the only statement "
            "of how current it is."
        )
    )
    features: list[dict[str, Any]] = Field(
        description=(
            "Point features inside the requested bounding box. Each carries "
            "`name`, `kind` (`trailhead` or `crag`; a crag is OpenStreetMap's "
            "`climbing=crag`, `climbing=area` or `climbing=boulder`, or a "
            "climbable stone, and never a single route), `osm_id` "
            "(`node/123`, `way/123` or `relation/123`) and `elevation_ft`, an "
            "integer or null. The geometry is the OSM node's position, or the "
            "centre of a way or relation, so it matches the row a polygon "
            "search returns for the same feature exactly."
        )
    )


@router.get(
    "/landmarks",
    tags=["landmarks"],
    summary="Named trailheads and crags in a bounding box",
    description=(
        "Every named trailhead (`highway=trailhead`) and crag (`sport=climbing` "
        "with `climbing=crag`, `area` or `boulder`, or a climbable stone) that "
        "OpenStreetMap carries inside `bbox`, as points.\n\n"
        "This exists because the basemap's tiles carry neither: no tile has a "
        "trailhead, and the climbing points a tile has lose OSM's `climbing=` "
        "tag, so a crag, a boulder and a single route look alike and a crag "
        "mapped as a relation is absent. This instance asks Overpass for the "
        "whole world once at startup, one kind at a time, retrying with a "
        "backoff until each lands, refreshes the set about daily, and serves "
        "it to everyone, so a map pan costs the donated server nothing.\n\n"
        "The set is served however old it is. Read `fetched_at` to see how "
        "current the answer is. An instance answers 503 while nothing has "
        "landed yet, which on a fresh instance lasts a few minutes; trailheads "
        "land first and are served while crags are still loading."
    ),
    response_description="Trailheads and crags inside the box, with the fetch timestamp.",
    response_model=LandmarkCollection,
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
                "Nothing has landed from Overpass yet on this instance, so it "
                "has nothing to serve. Transient; `Retry-After` says when to retry."
            ),
        },
    },
    dependencies=[Depends(ratelimit.landmarks_rate_limit)],
)
async def landmarks_in_box(
    request: Request,
    bbox: str = Query(
        ...,
        description=(
            "Bounding box as `west,south,east,north` in decimal degrees "
            "(EPSG:4326). A feature is returned when its point is inside."
        ),
        examples=["-121.9,47.4,-121.5,47.9"],
    ),
) -> Response:
    box = parse_bbox(bbox)
    snapshot = landmarks.LOADER.snapshot
    if snapshot is None:
        raise unavailable_error(
            landmarks.LOADER.unavailable(), provider=landmarks.PROVIDER, event="landmarks_unavailable"
        )
    features = snapshot.within(box)
    if len(features) == len(snapshot.features) and held_body.takes_gzip(request):
        return held_body.respond(
            await _WORLD.gzipped(snapshot, "all", lambda: landmarks.collection_json(snapshot, features))
        )
    # Returned as a Response so FastAPI passes the stored feature text through
    # untouched; `response_model` above still documents the shape.
    return Response(
        content=landmarks.collection_json(snapshot, features),
        media_type="application/json",
    )
