from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field

from app import ratelimit
from app.models import ErrorResponse
from app.services import usfs_closures
from app.services.bbox import parse_bbox
from app.services.snapshot import snapshot_or_503

router = APIRouter()


class ClosureCollection(BaseModel):
    """A GeoJSON FeatureCollection of Forest Service closure orders, plus when and where.

    Declared for the schema only: the handler returns pre-serialized text so a
    viewport is a filter and a join rather than a re-encode of every closure.
    """

    type: Literal["FeatureCollection"] = Field(
        description="Always `FeatureCollection`, so the body drops straight into a map library."
    )
    fetched_at: int = Field(
        description=(
            "When this instance last fetched closure orders from the Forest "
            "Service, in epoch milliseconds. A GeoJSON foreign member, which map "
            "libraries ignore. Closures are cached per instance and served past "
            "their refresh deadline when the Forest Service is unreachable, so "
            "this is the only honest statement of how current the answer is. It "
            "is not when any order was issued or last edited."
        )
    )
    coverage: dict[str, Any] = Field(
        description=(
            "The area the feed covers, as a GeoJSON MultiPolygon geometry riding "
            "as a second foreign member: a coarse outline of Oregon and "
            "Washington, which is the Forest Service's Region 6, biased about "
            "0.2° outward on its land borders. An empty `features` array for a "
            "bbox outside this geometry means the feed cannot see that area, "
            "not that nothing is closed there. Static per release."
        )
    )
    features: list[dict[str, Any]] = Field(
        description=(
            "Active closure orders intersecting the requested bounding box, with "
            "the Forest Service's own properties as it published them: "
            "`ClosureOrderName`, `ClosureOrderNumber`, `ForestUnit`, `District`, "
            "`FireName`, `ClosureDescription`, `ClosureStartDate` and "
            "`ClosureEndDate` in epoch milliseconds, and `ClosureURLlink`, which "
            "is often null. Lines also carry `RouteName` and `RouteNum`, and "
            "polygons carry `GIS_Acres`. An order is included when the Forest "
            "Service marks it active, and that status is trusted as published: "
            "an active order can carry an end date that is already past."
        )
    )


@router.get(
    "/closures",
    tags=["closures"],
    summary="Forest Service Region 6 closure orders in a bounding box",
    description=(
        "Active fire closure orders from the US Forest Service's Pacific "
        "Northwest Region (Region 6), intersecting `bbox`.\n\n"
        "`kind` picks the question. `area` answers where a person may not "
        "enter, as polygons. `trail` answers which ways in are shut, as lines "
        "for closed trails and roads plus points for closed trailheads and "
        "sites.\n\n"
        "Coverage is Oregon and Washington only: Region 6 is every national "
        "forest in those two states and nothing else, so an empty result "
        "elsewhere means \"not covered\", not \"nothing closed\". The "
        "`coverage` member states this machine-readably.\n\n"
        "This instance fetches the whole region on a timer and serves it to "
        "everyone, and serves it past its refresh deadline when the Forest "
        "Service is unreachable, because an order is edited by hand a few "
        "times a week and one fetched an hour ago is almost always still the "
        "order. Read `fetched_at` to see how current the answer is. Only an "
        "instance that has never completed a fetch answers 503."
    ),
    response_description="Closures of the requested kind intersecting the box, with the fetch timestamp.",
    response_model=ClosureCollection,
    responses={
        422: {
            "model": ErrorResponse,
            "description": (
                "`bbox` or `kind` was missing, or `bbox` was malformed or outside "
                "valid coordinate ranges, or `kind` or `detail` named a value "
                "this endpoint does not know."
            ),
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
                "This instance has never completed a fetch from the Forest "
                "Service, so it has nothing to serve, not even stale. Transient; "
                "`Retry-After` says when to retry."
            ),
        },
    },
    dependencies=[Depends(ratelimit.closures_rate_limit)],
)
async def closures(
    bbox: str = Query(
        ...,
        description=(
            "Bounding box as `west,south,east,north` in decimal degrees "
            "(EPSG:4326). A closure is returned when its own bounding box "
            "overlaps this one."
        ),
        examples=["-121.9,45.5,-121.5,45.8"],
    ),
    kind: Literal["area", "trail"] = Query(
        ...,
        description=(
            "Which closures to return. `area` is area closures, as polygons. "
            "`trail` is closed trails and roads, as lines, together with closed "
            "trailheads and sites, as points."
        ),
    ),
    detail: Literal["coarse", "full"] = Query(
        "coarse",
        description=(
            "Geometry fidelity. `coarse` simplifies lines and polygons to "
            "roughly 56 metres, the same tolerance the wildfire overlay uses, "
            "and is about a quarter of the bytes for trails. `full` returns them "
            "as the Forest Service drew them. Points are the same either way."
        ),
    ),
) -> Response:
    box = parse_bbox(bbox)
    snapshot = await snapshot_or_503(usfs_closures.CLOSURES, event="closures_unavailable")
    found = snapshot.within(box, kind, coarse=detail == "coarse")
    # Returned as a Response so FastAPI passes the stored feature text through
    # untouched; `response_model` above still documents the shape.
    return Response(
        content=usfs_closures.collection_json(snapshot, found),
        media_type="application/json",
    )
