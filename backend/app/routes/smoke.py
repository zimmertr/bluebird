from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app import ratelimit
from app.models import ErrorResponse
from app.services import hms

log = logging.getLogger(__name__)
router = APIRouter()


class SmokeCollection(BaseModel):
    """A GeoJSON FeatureCollection, plus when and for which day it was analyzed.

    Declared for the schema only: the handler returns pre-serialized text, since
    every caller gets the same whole-country answer and re-encoding it per
    request would be work with no question behind it.
    """

    type: Literal["FeatureCollection"] = Field(
        description="Always `FeatureCollection`, so the body drops straight into a map library."
    )
    fetched_at: int = Field(
        description=(
            "When this instance last fetched from NOAA, in epoch milliseconds. "
            "A GeoJSON foreign member, which map libraries ignore. Plumes are "
            "cached per instance and served past their refresh deadline when "
            "NOAA is unreachable, so this is the only honest statement of how "
            "current the shapes are."
        )
    )
    analysis_date: str = Field(
        description=(
            "The day whose analysis this is, as `YYYY-MM-DD` in US Eastern time. "
            "HMS publishes one dated file per day and its first pass lands "
            "around late morning Eastern, so before then this is yesterday's "
            "date and the plumes are yesterday's plumes. Read it rather than "
            "assuming today."
        )
    )
    features: list[dict[str, Any]] = Field(
        description=(
            "Smoke plumes as `Polygon` features. `density` is `Light`, `Medium` "
            "or `Heavy`; `satellite` names the GOES platform the analyst read; "
            "`observed_start` and `observed_end` bound the imagery the plume was "
            "traced from, in epoch milliseconds, and are null when HMS did not "
            "state them. A plume whose style HMS has not published before is "
            "returned as `Light` with the unrecognized value in `density_raw`."
        )
    )


@router.get(
    "/smoke",
    tags=["smoke"],
    summary="Smoke plumes from NOAA's Hazard Mapping System",
    description=(
        "Today's hand-traced smoke plumes covering North America, at all three "
        "densities.\n\n"
        "HMS is an analyst product, not a model: people at NOAA read GOES "
        "imagery and trace what they can see, roughly twice a day. So this is a "
        "picture of where the smoke is rather than a forecast, and there is "
        "nothing here to animate.\n\n"
        "The whole analysis comes back in one response and there is no bounding "
        "box to send: a busy day measured under half a megabyte, so filtering "
        "would cost a parameter and save nothing.\n\n"
        "This instance fetches the dated file from NOAA on a timer and serves "
        "it to everyone, and serves it past its refresh deadline when NOAA is "
        "unreachable — smoke traced this morning is the only tracing there will "
        "be until the next pass. Read `fetched_at` and `analysis_date` to see "
        "how current the answer is. Only an instance that has never completed a "
        "fetch answers 503.\n\n"
        "Coverage is North America, which is what HMS analyzes. An empty result "
        "elsewhere means \"not covered\", not \"clear air\"."
    ),
    response_description="Every plume in the current analysis, with its date.",
    response_model=SmokeCollection,
    responses={
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
                "This instance has never completed a fetch from NOAA, so it has "
                "nothing to serve, not even stale. Transient; `Retry-After` says "
                "when to retry."
            ),
        },
    },
    dependencies=[Depends(ratelimit.smoke_rate_limit)],
)
async def smoke() -> Response:
    try:
        snapshot = await hms.PLUMES.get()
    except Exception as exc:
        # Every failure that reaches here means the cache has nothing at all,
        # stale or otherwise: once one fetch has landed, get() serves it rather
        # than raising.
        retry_after = getattr(exc, "retry_after_s", 60)
        log.warning("event=smoke_unavailable error=%s", exc)
        raise HTTPException(
            status_code=503,
            detail=hms.unavailable_message(exc),
            headers={"Retry-After": str(retry_after)},
        ) from exc
    # Returned as a Response so FastAPI passes the stored body through
    # untouched; `response_model` above still documents the shape.
    return Response(content=snapshot.body, media_type="application/json")
