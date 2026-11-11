from __future__ import annotations

import asyncio
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel, Field

from app import ratelimit
from app.models import ErrorResponse
from app.models.common import _RESPONSE_CONFIG
from app.services import fire_activity, held_body
from app.services.bbox import parse_bbox
from app.services.snapshot import snapshot_or_503

router = APIRouter()

# The gzipped answer for a box that takes in every detection, held per
# snapshot (#628): 40 MB of text and 2.7 MB gzipped on 2026-10-27.
_WORLD = held_body.HeldBodies()


class FireDetectionProperties(BaseModel):
    """What FIRMS says about one detection."""

    model_config = _RESPONSE_CONFIG

    acquired: str = Field(
        description=(
            "When the satellite saw the pixel, as ISO 8601 UTC to the minute "
            "(`2026-10-27T19:36:00Z`). An instant rather than an age, because "
            "the age moves while a map is open."
        )
    )
    instrument: Literal["VIIRS", "MODIS"] = Field(
        description=(
            "`VIIRS` for a 375 m pixel, `MODIS` for a 1 km pixel. A detection "
            "is the pixel that was hot, not the fire's outline."
        )
    )
    satellite: str = Field(
        description=(
            "The satellite as FIRMS spells it: `N20` (NOAA-20) or `N21` "
            "(NOAA-21) for VIIRS, `T` (Terra) or `A` (Aqua) for MODIS."
        )
    )
    confidence: str = Field(
        description=(
            "FIRMS's confidence as it spells it: `low`, `nominal` or `high` "
            "for VIIRS, and a number from `0` to `100`, as text, for MODIS. "
            "Nothing is dropped for its confidence."
        )
    )
    frp: float | None = Field(
        description=(
            "Fire radiative power in megawatts, or null when FIRMS gave none."
        )
    )


class FirePoint(BaseModel):
    """A GeoJSON Point."""

    model_config = _RESPONSE_CONFIG

    type: Literal["Point"] = Field(description="Always `Point`.")
    coordinates: list[float] = Field(
        description="`[longitude, latitude]`, the centre of the pixel, in decimal degrees."
    )


class FireDetection(BaseModel):
    """One active fire detection, as a GeoJSON Feature."""

    model_config = _RESPONSE_CONFIG

    type: Literal["Feature"] = Field(description="Always `Feature`.")
    geometry: FirePoint
    properties: FireDetectionProperties


class FireActivityCollection(BaseModel):
    """A GeoJSON FeatureCollection of detections, plus when Bluebird Forecast last heard from FIRMS.

    Declared for the schema only: the handler writes the text itself, because
    a view can hold tens of thousands of points and every one has the same
    shape.
    """

    model_config = _RESPONSE_CONFIG

    type: Literal["FeatureCollection"] = Field(
        description="Always `FeatureCollection`, so the body drops straight into a map library."
    )
    fetched_at: int = Field(
        description=(
            "When Bluebird Forecast last fetched the detections from FIRMS, in "
            "epoch milliseconds. A GeoJSON foreign member, which map libraries "
            "ignore. Detections are served past their refresh deadline when "
            "FIRMS is unreachable, so this is the only honest statement of how "
            "current the set is. Every detection was acquired within 48 hours "
            "of this moment."
        )
    )
    features: list[FireDetection] = Field(
        description="Every detection inside the requested bounding box, edges included."
    )


@router.get(
    "/fire-activity",
    tags=["fire activity"],
    summary="Satellite fire detections from the last 48 hours in a bounding box",
    description=(
        "Active fire detections from NASA FIRMS inside `bbox`: every hot pixel "
        "the VIIRS instruments on NOAA-20 and NOAA-21 and the MODIS "
        "instruments on Terra and Aqua flagged in the 48 hours before the "
        "last fetch, worldwide.\n\n"
        "A detection is one pixel, 375 m across for VIIRS and 1 km for MODIS, "
        "that was hot when the satellite passed. It is not a fire's outline: "
        "`GET /api/wildfires` has the surveyed perimeters, for the United "
        "States. FIRMS publishes a detection about 3 hours after the pass, so "
        "the newest are that old when they arrive.\n\n"
        "This exists because FIRMS's files carry no CORS header, so a browser "
        "cannot read them. Bluebird Forecast fetches the global files every "
        "60 minutes, FIRMS's own cadence, and serves a box's slice to "
        "everyone.\n\n"
        "Detections are served past their refresh deadline when FIRMS is "
        "unreachable. Read `fetched_at` to see how current the answer is. It "
        "answers 503 when no fetch has completed yet, or when every refresh "
        "has failed for more than 24 hours since the last good one."
    ),
    response_description="Detections inside the box, with the fetch timestamp.",
    response_model=FireActivityCollection,
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
                "No fetch from FIRMS has completed yet, or every refresh has "
                "failed for more than 24 hours since the last good one, so "
                "there is nothing to serve. Transient; `Retry-After` says "
                "when to retry."
            ),
        },
    },
    dependencies=[Depends(ratelimit.fire_activity_rate_limit)],
)
async def fire_activity_in_box(
    request: Request,
    bbox: str = Query(
        ...,
        description=(
            "Bounding box as `west,south,east,north` in decimal degrees "
            "(EPSG:4326). A west greater than its east is a box across the "
            "antimeridian."
        ),
        examples=["-121.9,46.7,-121.5,47.0"],
    ),
) -> Response:
    box = parse_bbox(bbox)
    snapshot = await snapshot_or_503(fire_activity.DETECTIONS, event="fire_activity_unavailable")
    rows = snapshot.within(box)
    # A box that takes in every detection is the whole world's answer, the
    # same bytes for every such box until the snapshot changes, so it is
    # compressed once and held rather than once per request.
    if len(rows) == snapshot.count and held_body.takes_gzip(request):
        return held_body.respond(
            await _WORLD.gzipped(snapshot, "world", lambda: fire_activity.collection_json(snapshot, rows))
        )
    # Off the event loop: a wide view in the burning season is tens of
    # thousands of features, about 50 ms of formatting (measured 2026-10-27
    # at 55,563 detections over southern Africa).
    body = await asyncio.to_thread(fire_activity.collection_json, snapshot, rows)
    return Response(content=body, media_type="application/json")
