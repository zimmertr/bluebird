from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, Field

from app import ratelimit
from app.models import ErrorResponse
from app.services import held_body, usfs_closures
from app.services.bbox import parse_bbox
from app.services.snapshot import snapshot_or_503

router = APIRouter()

# The gzipped whole set of each kind at each fidelity, held per snapshot: the
# wildfire route's #628, on a route of the same shape. Region 6's full-detail
# trails alone were 5.8 MB on 2026-09-30, a third of the national perimeters.
_WHOLE_SET = held_body.HeldBodies()


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
            "The area the feeds behind the requested `kind` cover, as a GeoJSON "
            "MultiPolygon geometry riding as a second foreign member. It "
            "differs by kind. For `area` it outlines the Forest Service's "
            "Regions 3, 4 and 6: Arizona, New Mexico, Nevada, Utah, southern "
            "Idaho, western Wyoming, Oregon and Washington, less two Region 5 "
            "areas in Nevada. For `trail` it outlines Region 6 alone, Oregon "
            "and Washington, because only Region 6 publishes closed trails and "
            "sites. Every outline is coarse and biased about 0.2° outward on "
            "land borders. An empty `features` array for a bbox outside this "
            "geometry means the feeds cannot see that area, not that nothing is "
            "closed there. The trail outline is static per release. The area "
            "outline leaves out Region 3 or Region 4 when this instance's last "
            "fetch from that region failed, because the snapshot then holds "
            "none of its orders."
        )
    )
    features: list[dict[str, Any]] = Field(
        description=(
            "Active closure orders intersecting the requested bounding box, with "
            "Region 6's property names: `ClosureOrderName`, "
            "`ClosureOrderNumber`, `ForestUnit`, `District`, `FireName`, "
            "`ClosureDescription`, `ClosureStartDate` and `ClosureEndDate` in "
            "epoch milliseconds, and `ClosureURLlink`, which is often null. "
            "Lines also carry `RouteName` and `RouteNum`, and polygons carry "
            "`GIS_Acres`. Every feature carries `ClosureSource`, the region "
            "that published it (`R03`, `R04` or `R06`), and `ClosureType`, "
            "the region's own type for the order (null on Region 6). Region 6 "
            "features pass through as the Forest Service published them, and "
            "are included when it marks them active; that status is trusted as "
            "published, so an active order can carry an end date that is "
            "already past. Regions 3 and 4 publish every standing forest order "
            "with no status, mapped onto the same names (their `District` and "
            "`FireName` are null). An order from them is included when nobody "
            "rescinded it, its end date is not past, and it closes an area to "
            "entry: its legal citation names 36 CFR 261.52(e) or 261.53(e), or "
            "its name or description says entry is prohibited in a sentence "
            "that names no permit as the way in."
        )
    )


@router.get(
    "/closures",
    tags=["closures"],
    summary="Forest Service closure orders in a bounding box",
    description=(
        "Active closure orders from three US Forest Service regions, "
        "intersecting `bbox`: the Pacific Northwest Region (Region 6), the "
        "Southwestern Region (Region 3) and the Intermountain Region (Region "
        "4).\n\n"
        "`kind` picks the question. `area` answers where a person may not "
        "enter, as polygons, from all three regions. `trail` answers which "
        "ways in are shut, as lines for closed trails and roads plus points "
        "for closed trailheads and sites, from Region 6 alone.\n\n"
        "Coverage therefore differs by kind. `area` covers Arizona, New "
        "Mexico, Nevada, Utah, southern Idaho, western Wyoming, Oregon and "
        "Washington. `trail` covers Oregon and Washington only. An empty "
        "result outside the coverage for its kind means \"not covered\", not "
        "\"nothing closed\". The `coverage` member states this "
        "machine-readably.\n\n"
        "Regions 3 and 4 publish every standing forest order, not closures "
        "alone, so an order from them is returned only when it closes an area "
        "to entry: its legal citation names 36 CFR 261.52(e) or 261.53(e), or "
        "its name or description says entry is prohibited in a sentence that "
        "names no permit as the way in.\n\n"
        "This instance fetches every region on a timer and serves it to "
        "everyone, and serves it past its refresh deadline when the Forest "
        "Service is unreachable, because an order is edited by hand a few "
        "times a week and one fetched an hour ago is almost always still the "
        "order. Read `fetched_at` to see how current the answer is. An "
        "instance answers 503 when it has never completed a fetch, or when "
        "every refresh has failed for more than 24 hours since its last good "
        "one."
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
                "Service, or every refresh has failed for more than 24 hours "
                "since its last good one, so it has nothing it will serve. Transient; "
                "`Retry-After` says when to retry."
            ),
        },
    },
    dependencies=[Depends(ratelimit.closures_rate_limit)],
)
async def closures(
    request: Request,
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
            "Which closures to return. `area` is area closures, as polygons, "
            "from Regions 3, 4 and 6. `trail` is closed trails and roads, as "
            "lines, together with closed trailheads and sites, as points, from "
            "Region 6 alone."
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
    coarse = detail == "coarse"
    found = snapshot.within(box, kind, coarse=coarse)
    if kind == "area":
        everything = snapshot.areas_coarse if coarse else snapshot.areas_full
    else:
        everything = snapshot.trails_coarse if coarse else snapshot.trails_full
    # A box that takes in every closure of a kind is the same bytes for every
    # such box until the snapshot changes, so it is compressed once and held.
    if len(found) == len(everything) and held_body.takes_gzip(request):
        return held_body.respond(
            await _WHOLE_SET.gzipped(
                snapshot,
                (kind, detail),
                lambda: usfs_closures.collection_json(snapshot, found, kind),
            )
        )
    # Returned as a Response so FastAPI passes the stored feature text through
    # untouched; `response_model` above still documents the shape.
    return Response(
        content=usfs_closures.collection_json(snapshot, found, kind),
        media_type="application/json",
    )
