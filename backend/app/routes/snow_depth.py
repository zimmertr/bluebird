from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, model_validator

from app import ratelimit
from app.limits import FUTURE_LIMIT_SLACK_DAYS, MAX_ANALYZE_PEAKS, PAST_LIMIT_SLACK_DAYS, _as_utc
from app.models import ErrorResponse
from app.models.common import (
    _REQUEST_CONFIG,
    _RESPONSE_CONFIG,
    _SNOW_DATE_DESCRIPTION,
    _SNOW_DEPTH_AVG_DESCRIPTION,
    _SNOW_DEPTH_MAX_DESCRIPTION,
    _SNOW_DEPTH_MIN_DESCRIPTION,
)
from app.services import snow_history

router = APIRouter()


class SnowPoint(BaseModel):
    model_config = _REQUEST_CONFIG

    latitude: float = Field(ge=-90, le=90, description="Latitude in decimal degrees, -90 to 90.")
    longitude: float = Field(ge=-180, le=180, description="Longitude in decimal degrees, -180 to 180.")


class SnowDepthRequest(BaseModel):
    model_config = _REQUEST_CONFIG

    points: list[SnowPoint] = Field(
        min_length=1,
        max_length=MAX_ANALYZE_PEAKS,
        description="The coordinates to read, in the order the answer returns them.",
    )
    start_datetime: datetime = Field(
        description="The window's first instant, ISO 8601. An offset is converted to UTC; a naive stamp is read as UTC."
    )
    end_datetime: datetime = Field(description="The window's last instant, read as `start_datetime` is.")

    @model_validator(mode="after")
    def window_in_reach(self) -> SnowDepthRequest:
        start, end = _as_utc(self.start_datetime), _as_utc(self.end_datetime)
        if end < start:
            raise ValueError("end_datetime is before start_datetime")
        now = datetime.now(UTC)
        if start < now - timedelta(days=PAST_LIMIT_SLACK_DAYS) or end > now + timedelta(days=FUTURE_LIMIT_SLACK_DAYS):
            raise ValueError("the window reaches past what an analysis may ask for")
        self.start_datetime, self.end_datetime = start, end
        return self


class SnowDay(BaseModel):
    model_config = _RESPONSE_CONFIG

    day: date = Field(description="A UTC day of the window, `YYYY-MM-DD`.")
    depth_in: float | None = Field(description="Snow depth that day, inches, or null where none was measured.")


class SnowDepthAtPoint(BaseModel):
    model_config = _RESPONSE_CONFIG

    avg_in: float | None = Field(description=_SNOW_DEPTH_AVG_DESCRIPTION)
    min_in: float | None = Field(description=_SNOW_DEPTH_MIN_DESCRIPTION)
    max_in: float | None = Field(description=_SNOW_DEPTH_MAX_DESCRIPTION)
    days: list[SnowDay] = Field(
        description=(
            "Each UTC day of the window up to the newest day analyzed, with its "
            "depth. It stops there rather than repeating the newest depth, so "
            "it holds only what was measured."
        )
    )


class SnowDepthResponse(BaseModel):
    model_config = _RESPONSE_CONFIG

    snow_analysis_date: str | None = Field(description=_SNOW_DATE_DESCRIPTION)
    points: list[SnowDepthAtPoint] = Field(description="One answer per requested point, in request order.")


@router.post(
    "/snow-depth",
    tags=["snow depth"],
    summary="Snow depth over a window at a list of coordinates",
    description=(
        "What a window reads at each point from the NOHRSC SNODAS snow "
        "analysis: the depth on each UTC day of the window up to the newest "
        "day analyzed, and the window's average, least and most, which count "
        "every later day as that newest depth.\n\n"
        "This instance keeps a year of daily depths at every place its copy of "
        "OpenStreetMap holds inside the grid. A coordinate in a 1 km cell no "
        "such place shares reads the newest day alone. An instance without "
        "that copy reads today's analysis alone, at every point.\n\n"
        "No upstream is asked: the answer comes from this instance's own "
        "copy."
    ),
    response_description="Each point's daily depths and the window's aggregates.",
    response_model=SnowDepthResponse,
    responses={
        422: {"model": ErrorResponse, "description": "A point or the window was malformed or out of range."},
        429: {
            "model": ErrorResponse,
            "description": (
                "This client is requesting faster than the per-address limit. "
                "`Retry-After` says how many seconds to wait. "
                "`GET /api/capabilities` publishes the limit."
            ),
        },
    },
    dependencies=[Depends(ratelimit.snow_depth_rate_limit)],
)
async def snow_depth(request: SnowDepthRequest) -> SnowDepthResponse:
    depths, newest = await snow_history.window_depths(
        [(p.latitude, p.longitude) for p in request.points],
        request.start_datetime,
        request.end_datetime,
    )
    return SnowDepthResponse(
        snow_analysis_date=newest.isoformat() if newest else None,
        points=[
            SnowDepthAtPoint(
                avg_in=d.avg_in,
                min_in=d.min_in,
                max_in=d.max_in,
                days=[SnowDay(day=day, depth_in=value) for day, value in d.days],
            )
            for d in depths
        ],
    )
