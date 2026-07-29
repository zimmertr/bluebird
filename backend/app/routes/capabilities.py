from fastapi import APIRouter
from pydantic import BaseModel, Field

from app import ratelimit
from app.models import (
    FUTURE_LIMIT_SLACK_DAYS,
    MAX_ANALYZE_PEAKS,
    MAX_LIMIT,
    MAX_POLYGON_AREA_KM2,
    MIN_LIMIT,
    PAST_LIMIT_SLACK_DAYS,
    DestinationType,
    SortBy,
)
from app.services.air_quality import MAX_FORECAST_DAYS as AQI_FORECAST_DAYS
from app.services.osm import IMPLEMENTED_TYPES

router = APIRouter()


class DataSource(BaseModel):
    """One upstream Bluebird depends on."""

    name: str
    url: str
    provides: str


class RateLimits(BaseModel):
    """Per-client request pacing on the expensive endpoints.

    Enforced per backend instance, so behind a multi-replica deployment the
    effective ceiling is roughly the number shown times the replica count.
    Requests past a limit receive 429 with a `Retry-After` header.
    """

    analyze_per_minute: int = Field(
        description=(
            "Sustained `POST /api/analyze` + `/api/analyze/stream` requests "
            "allowed per client address per minute (the two share one "
            "bucket). 0 means the limit is disabled."
        )
    )
    analyze_burst: int = Field(
        description=(
            "How many analyze requests an idle client can send back-to-back "
            "before the per-minute pace applies."
        )
    )
    destinations_per_minute: int = Field(
        description=(
            "Sustained `POST /api/destinations` requests per client address "
            "per minute. Its own bucket: discovery is one map query with no "
            "forecasts, so it does not spend the analyze budget. 0 means the "
            "limit is disabled."
        )
    )
    destinations_burst: int = Field(
        description=(
            "How many destinations requests an idle client can send "
            "back-to-back before the per-minute pace applies."
        )
    )
    geocode_per_minute: int = Field(
        description=(
            "Sustained `GET /api/geocode` requests per client address per "
            "minute. 0 means the limit is disabled."
        )
    )
    geocode_burst: int = Field(
        description=(
            "How many geocode requests an idle client can send back-to-back "
            "before the per-minute pace applies."
        )
    )


class Limits(BaseModel):
    """Hard bounds every request is validated against."""

    max_polygon_area_km2: int = Field(
        description=(
            "Largest drawable search area, measured as a bounding-box "
            "approximation of the polygon. Larger areas are rejected with 422."
        )
    )
    max_destinations: int = Field(
        description=(
            "Ceiling on candidates in a single analysis, counting discovered and "
            "custom destinations together. Every candidate gets a real forecast, "
            "so this is what bounds upstream cost. Exceeding it fails loudly "
            "rather than silently truncating the ranking."
        )
    )
    min_limit: int = Field(description="Smallest accepted `limit`.")
    max_limit: int = Field(description="Largest accepted `limit`.")
    max_past_days: int = Field(
        description=(
            "How far back `start_datetime` may reach. The weather API serves "
            "roughly 90 days of history; this bound carries slack so a "
            "legitimate edge window is never falsely rejected."
        )
    )
    max_future_days: int = Field(
        description=(
            "How far ahead `end_datetime` may reach. The weather API forecasts "
            "roughly 16 days; this bound carries the same slack."
        )
    )
    aqi_forecast_days: int = Field(
        description=(
            "How far ahead air quality is available. The underlying CAMS model "
            "runs far shorter than the weather forecast, so `aqi_avg` and "
            "`aqi_max` come back null for hours past this horizon. An analysis "
            "never fails because of it."
        )
    )
    rate: RateLimits = Field(
        description=(
            "Per-client request pacing. Unlike the bounds above, exceeding "
            "these is not a request error: the same request succeeds once "
            "`Retry-After` has elapsed."
        )
    )


class CapabilitiesResponse(BaseModel):
    """What this deployment can do, and the bounds it enforces."""

    destination_types: list[str] = Field(
        description=(
            "Destination types this deployment can actually analyze. Narrower "
            "than the `destination_type` enum, which also models types that are "
            "not yet discoverable."
        )
    )
    sort_keys: list[str] = Field(
        description="Accepted values for `sort_by`, usable with `sort_desc`."
    )
    limits: Limits
    data_sources: list[DataSource]


@router.get(
    "/capabilities",
    response_model=CapabilitiesResponse,
    tags=["metadata"],
    summary="Describe supported features and enforced limits",
    description=(
        "Everything a client needs to build a valid request without hardcoding "
        "constants or scraping the docs. Every value is read from the same "
        "constants the validators enforce, so this can never drift from actual "
        "behavior."
    ),
)
async def capabilities() -> CapabilitiesResponse:
    # `custom` is appended rather than read from IMPLEMENTED_TYPES because custom
    # destinations arrive in the request body and never touch Overpass, so the
    # OSM layer has no reason to know about them.
    types = sorted(t.value for t in IMPLEMENTED_TYPES) + [DestinationType.custom.value]
    return CapabilitiesResponse(
        destination_types=types,
        sort_keys=[s.value for s in SortBy],
        limits=Limits(
            max_polygon_area_km2=MAX_POLYGON_AREA_KM2,
            max_destinations=MAX_ANALYZE_PEAKS,
            min_limit=MIN_LIMIT,
            max_limit=MAX_LIMIT,
            max_past_days=PAST_LIMIT_SLACK_DAYS,
            max_future_days=FUTURE_LIMIT_SLACK_DAYS,
            aqi_forecast_days=AQI_FORECAST_DAYS,
            # Read from the live limiter instances, not the env constants, so
            # what this publishes is what enforcement actually counts.
            rate=RateLimits(
                analyze_per_minute=ratelimit.ANALYZE_LIMITER.per_minute,
                analyze_burst=ratelimit.ANALYZE_LIMITER.burst,
                destinations_per_minute=ratelimit.DESTINATIONS_LIMITER.per_minute,
                destinations_burst=ratelimit.DESTINATIONS_LIMITER.burst,
                geocode_per_minute=ratelimit.GEOCODE_LIMITER.per_minute,
                geocode_burst=ratelimit.GEOCODE_LIMITER.burst,
            ),
        ),
        data_sources=[
            DataSource(
                name="OpenStreetMap via Overpass",
                url="https://overpass-api.de",
                provides="Named peaks, trailheads, and lakes inside the polygon",
            ),
            DataSource(
                name="Open-Meteo",
                url="https://open-meteo.com",
                provides="Hourly precipitation, temperature, and wind forecasts",
            ),
            DataSource(
                name="Open-Meteo Air Quality",
                url="https://open-meteo.com/en/docs/air-quality-api",
                provides="Hourly US AQI, combined across EPA pollutants",
            ),
            DataSource(
                name="Nominatim",
                url="https://nominatim.org",
                provides="Place search behind GET /api/geocode",
            ),
        ],
    )
