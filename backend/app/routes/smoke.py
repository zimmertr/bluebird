from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from app import ratelimit
from app.models import ErrorResponse
from app.routes.bbox import BBOX_DESCRIPTION, parse_bbox
from app.services import hms, hrrr_smoke

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


class SmokeForecastHour(BaseModel):
    """One forecast hour's cells."""

    time: int = Field(
        description="The hour this covers, in epoch milliseconds, at the top of the hour UTC."
    )
    cells: list[int] = Field(
        description=(
            "`cols` * `rows` density classes, row-major from the **south-west** "
            "corner: index `row * cols + col`. `0` is below the reporting floor, "
            "`1` Light, `2` Medium, `3` Heavy, and `255` means the cell falls "
            "outside the model's area. `255` is not clean air and must not be "
            "drawn as any density."
        )
    )


class SmokeForecast(BaseModel):
    """Forecast smoke over a viewport, one lattice per hour."""

    cycle: str = Field(
        description=(
            "The model run these hours come from, as `YYYY-MM-DDTHH:MM:SSZ`. "
            "HRRR runs every hour but only the 00/06/12/18Z runs reach 48 hours, "
            "so this is always one of those four."
        )
    )
    fetched_at: int = Field(
        description=(
            "When this instance last fetched from NOAA, in epoch milliseconds. "
            "The snapshot is served past its refresh deadline when NOAA is "
            "unreachable, so this is the only honest statement of how current "
            "the answer is."
        )
    )
    west: float = Field(description="West edge of the lattice, which is the requested box's.")
    south: float = Field(description="South edge of the lattice.")
    east: float = Field(description="East edge of the lattice.")
    north: float = Field(description="North edge of the lattice.")
    cols: int = Field(description="Cells across. The lattice tiles the box exactly.")
    rows: int = Field(description="Cells up.")
    pitch_km: float = Field(
        description=(
            "How wide one cell is, in kilometres. Never finer than the model's "
            "own 3 km: asking for more samples than the model has grid points "
            "would invent detail. A box too large for the cell cap is served "
            "coarser, and this is where that is stated."
        )
    )
    hours: list[SmokeForecastHour] = Field(
        description=(
            "Every hour of the run that falls inside the requested window, "
            "in order. Empty when the window is entirely outside the run's "
            "reach, which is a normal answer rather than an error."
        )
    )


@router.get(
    "/smoke/forecast",
    tags=["smoke"],
    summary="Forecast smoke from NOAA's HRRR model",
    description=(
        "Near-surface smoke concentration over a viewport, hour by hour, as "
        "density classes on a longitude and latitude lattice.\n\n"
        "This is the forecast counterpart to `GET /api/smoke`. HMS is an "
        "analyst tracing what a satellite already saw; this is a model saying "
        "where that smoke goes next. The field is HRRR's `MASSDEN` at 8 m — "
        "smoke in the air a person breathes, rather than the whole column — "
        "binned to the same Light, Medium and Heavy classes HMS uses, at 10 "
        "and 21 micrograms per cubic metre with a reporting floor of 1.\n\n"
        "**The reach is 48 hours and the area is the contiguous United States.** "
        "A window past the run's last hour returns no hours, and a box outside "
        "the model returns cells of `255`. Neither is an error.\n\n"
        "The lattice is resampled from the model's own Lambert grid, which is "
        "turned as much as 15 degrees from north over the western states, so "
        "the cells here are aligned to longitude and latitude and can be drawn "
        "as a plain image over the box.\n\n"
        "This instance fetches one model run from NOAA's public archive on a "
        "timer and serves it to everyone, past its refresh deadline when NOAA "
        "is unreachable. Only an instance that has never completed a fetch "
        "answers 503."
    ),
    response_description="Density classes for every covered hour in the window.",
    response_model=SmokeForecast,
    responses={
        422: {
            "model": ErrorResponse,
            "description": "The bounding box or the window could not be read.",
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
                "This instance has never completed a fetch from NOAA, so it has "
                "nothing to serve, not even stale. Transient; `Retry-After` says "
                "when to retry."
            ),
        },
    },
    # The observed and forecast smoke layers share one bucket. They are one
    # overlay family, and this call happens once per analysis where the observed
    # one happens once per toggle, so it cannot be the heavier of the two.
    dependencies=[Depends(ratelimit.smoke_rate_limit)],
)
async def smoke_forecast(
    bbox: Annotated[
        str,
        Query(
            description=f"{BBOX_DESCRIPTION} The lattice covers exactly this box.",
            examples=["-121.9,46.7,-121.5,47.0"],
        ),
    ],
    start: Annotated[
        datetime,
        Query(
            description="First hour of interest, ISO 8601. A naive value is read as UTC.",
            examples=["2026-08-23T14:00:00Z"],
        ),
    ],
    end: Annotated[
        datetime,
        Query(
            description="Last hour of interest, ISO 8601, inclusive.",
            examples=["2026-08-25T02:00:00Z"],
        ),
    ],
) -> SmokeForecast:
    west, south, east, north = parse_bbox(bbox)
    start_ms, end_ms = _epoch_ms(start), _epoch_ms(end)
    if end_ms < start_ms:
        raise HTTPException(status_code=422, detail="end must not be before start.")

    try:
        snapshot = await hrrr_smoke.FORECAST.get()
    except Exception as exc:
        # Every failure that reaches here means the cache has nothing at all,
        # stale or otherwise: once one fetch has landed, get() serves it rather
        # than raising.
        retry_after = getattr(exc, "retry_after_s", 60)
        log.warning("event=smoke_forecast_unavailable error=%s", exc)
        raise HTTPException(
            status_code=503,
            detail=hrrr_smoke.unavailable_message(exc),
            headers={"Retry-After": str(retry_after)},
        ) from exc

    lattice = hrrr_smoke.build_lattice(west, south, east, north)
    hours = [
        SmokeForecastHour(
            time=valid_ms,
            cells=hrrr_smoke.sample(snapshot, lattice, valid_ms).ravel().tolist(),
        )
        for valid_ms in hrrr_smoke.hours_within(snapshot, start_ms, end_ms)
    ]
    return SmokeForecast(
        cycle=snapshot.cycle_iso,
        fetched_at=snapshot.fetched_at_ms,
        west=lattice.west,
        south=lattice.south,
        east=lattice.east,
        north=lattice.north,
        cols=lattice.cols,
        rows=lattice.rows,
        pitch_km=lattice.pitch_km,
        hours=hours,
    )


def _epoch_ms(moment: datetime) -> int:
    """Epoch milliseconds, reading a naive stamp as UTC.

    Naive rather than rejected because every stamp this app sends is UTC and a
    caller who omits the offset means UTC too; guessing the server's zone is the
    one reading that is never right.
    """
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return int(moment.timestamp() * 1000)
