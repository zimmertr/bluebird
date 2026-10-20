from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field

from app import ratelimit
from app.models import ErrorResponse
from app.services import places
from app.services.bbox import parse_bbox
from app.services.snapshot import unavailable_error

router = APIRouter()

# What the route says while the places table cannot answer: a deployment with
# no database, or one whose first fill has not finished. The frontend logs it
# and draws no markers, since they are scenery.
UNAVAILABLE_DETAIL = "Trailheads and crags are not available yet. Try again later."
# A fill takes hours and a missing database is a deployment's choice, so a
# caller has nothing to gain from asking again sooner.
UNAVAILABLE_RETRY_AFTER_S = 300


class LandmarkCollection(BaseModel):
    """A GeoJSON FeatureCollection of named trailheads and crags, plus how current it is.

    Declared for the schema only: the handler returns the text it builds.
    """

    type: Literal["FeatureCollection"] = Field(
        description="Always `FeatureCollection`, so the body drops straight into a map library."
    )
    fetched_at: int = Field(
        description=(
            "When this instance's copy of OpenStreetMap was last brought up to "
            "date, in epoch milliseconds: the last daily change file applied, "
            "or the planet file it was filled from. A GeoJSON foreign member, "
            "which map libraries ignore."
        )
    )
    features: list[dict[str, Any]] = Field(
        description=(
            "Point features inside the requested bounding box. Each carries "
            "`name`, `kind` (`trailhead` or `crag`), `osm_id` (`node/123`, "
            "`way/123` or `relation/123`) and `elevation_ft`, an integer or "
            "null. The geometry is the OSM node's position, or the centre of a "
            "way or relation. Features of one kind and one name within 300 m "
            "are one place, as in a polygon search, so a marker is the row a "
            "polygon around it returns."
        )
    )


def _feature(row: dict[str, Any]) -> dict[str, Any]:
    ele = row["elevation_ft"]
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [row["longitude"], row["latitude"]]},
        "properties": {
            "name": row["name"],
            "kind": row["type"],
            "osm_id": row["osm_id"],
            "elevation_ft": round(ele) if ele is not None else None,
        },
    }


@router.get(
    "/landmarks",
    tags=["landmarks"],
    summary="Named trailheads and crags in a bounding box",
    description=(
        "Every named trailhead (`highway=trailhead`, or a parking lot named "
        "as one) and crag (a climbing crag, area or boulder, never a single "
        "route) that OpenStreetMap carries inside `bbox`, as points.\n\n"
        "This exists because the basemap's tiles carry neither: no tile has a "
        "trailhead, and the climbing points a tile has lose OSM's `climbing=` "
        "tag, so a crag, a boulder and a single route look alike and a crag "
        "mapped as a relation is absent. The answer comes from this "
        "instance's own copy of OpenStreetMap, filled from the planet file and "
        "kept current from its daily change files, so a map pan costs no "
        "upstream anything.\n\n"
        "An instance without that copy, or whose first fill has not finished, "
        "answers 503."
    ),
    response_description="Trailheads and crags inside the box, with when the copy was last updated.",
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
                "This instance holds no copy of OpenStreetMap to answer from: it "
                "runs without the database, or its first fill has not finished. "
                "`Retry-After` says when to ask again."
            ),
        },
    },
    dependencies=[Depends(ratelimit.landmarks_rate_limit)],
)
async def landmarks_in_box(
    bbox: str = Query(
        ...,
        description=(
            "Bounding box as `west,south,east,north` in decimal degrees "
            "(EPSG:4326). A feature is returned when its point is inside. A "
            "west edge east of the east edge crosses the antimeridian."
        ),
        examples=["-121.9,47.4,-121.5,47.9"],
    ),
) -> Response:
    box = parse_bbox(bbox)
    answer = await places.landmarks(box)
    if answer is None:
        raise unavailable_error(UNAVAILABLE_DETAIL, UNAVAILABLE_RETRY_AFTER_S)
    updated, rows = answer
    body = {
        "type": "FeatureCollection",
        "fetched_at": int(updated.timestamp() * 1000),
        "features": [_feature(r) for r in rows],
    }
    # Returned as text so FastAPI does not validate every feature against the
    # model; `response_model` above still documents the shape.
    return Response(content=json.dumps(body, separators=(",", ":")), media_type="application/json")
