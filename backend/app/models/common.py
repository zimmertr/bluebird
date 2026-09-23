"""The shapes both request models share: the enums, the polygon, and the discovery fields."""

from __future__ import annotations

import math
from enum import Enum
from typing import ClassVar, Literal

from pydantic import BaseModel, Field, field_validator

from app.limits import MAX_ANALYZE_PEAKS, MAX_POLYGON_AREA_KM2


class DestinationType(str, Enum):
    peak = "peak"
    trailhead = "trailhead"
    lake = "lake"
    custom = "custom"


class ForecastMode(str, Enum):
    # `at` rather than `future` because a window may reach a year back (the
    # archive, see ARCHIVE_DATA_DAYS), so a single-moment sample is not
    # necessarily ahead of now.
    current = "current"
    at = "at"
    window = "window"



# What `snow_depth_in` means, on the two models that carry it.
#
# One constant rather than the per-class wording `_DiscoveryFields` keeps:
# those four descriptions differ because the two endpoints genuinely do
# different things with the same field, and this one is the same statement
# about the same number wherever it appears.
_SNOW_DEPTH_DESCRIPTION = (
    "Snow on the ground today, in inches, from the NOHRSC SNODAS 1 km grid. "
    "One number per destination that ignores the analyzed window entirely: it "
    "is the current analysis rather than a forecast, so it has no minimum, "
    "mean or maximum and no hourly series. Null outside the grid, which covers "
    "the contiguous United States, southern Canada and northern Mexico, and "
    "null while this instance holds no grid. Over permanent ice SNODAS "
    "accumulates year over year, so a glaciated summit reads hundreds of "
    "inches in every season; that is ice rather than this season's snow. The "
    "value saturates at 1290.04, the 16-bit integer millimetre ceiling of the "
    "source file, so a row at that number holds at least that much and is "
    "permanent ice."
)

# The grid a report's snow depths came from, on the two responses that carry
# one. Same wording for the same reason as the field above.
_SNOW_DATE_DESCRIPTION = (
    "The date of the SNODAS analysis behind every `snow_depth_in` on this "
    "response, as `YYYY-MM-DD`. Null when this instance holds no grid, which "
    "is also when every row's `snow_depth_in` is null."
)


class SortBy(str, Enum):
    # One member per aggregate column a result row carries, so anything the
    # table can show, a caller can rank by (#291).
    precip_total = "precip_total_in"
    precip_avg = "precip_avg_in_hr"
    precip_min = "precip_min_in_hr"
    precip_max = "precip_max_in_hr"
    wind_min = "wind_min_mph"
    wind_avg = "wind_avg_mph"
    wind_max = "wind_max_mph"
    temp_min = "temp_min_f"
    temp_avg = "temp_avg_f"
    temp_max = "temp_max_f"
    freeze_min = "freeze_min_ft"
    freeze_avg = "freeze_avg_ft"
    freeze_max = "freeze_max_ft"
    aqi_avg = "aqi_avg"
    aqi_min = "aqi_min"
    aqi_max = "aqi_max"
    # The cloud base and cloud cover (issue #117). Ranking by either one makes
    # the analysis fetch the cloud variables, which it otherwise skips.
    cloud_base_min = "cloud_base_min_ft"
    cloud_base_avg = "cloud_base_avg_ft"
    cloud_base_max = "cloud_base_max_ft"
    cloud_cover_min = "cloud_cover_min_pct"
    cloud_cover_avg = "cloud_cover_avg_pct"
    cloud_cover_max = "cloud_cover_max_pct"
    # The one key that is not a window aggregate: snow depth is today's number
    # whatever window was analyzed, so the family has one member rather than
    # three (issue #449).
    snow_depth = "snow_depth_in"


class GeoPolygon(BaseModel):
    """A GeoJSON Polygon bounding the search area."""

    type: Literal["Polygon"]
    coordinates: list[list[list[float]]] = Field(
        description=(
            "GeoJSON coordinate rings. Only the outer ring is read. Positions "
            "are `[longitude, latitude]`, which is GeoJSON order and the "
            "reverse of how coordinates are usually spoken. The ring should "
            "close by repeating its first position."
        )
    )


def bbox_area_km2(ring: list[list[float]]) -> float:
    """Approximate bounding-box area in km² for a GeoJSON coordinate ring."""
    lats = [c[1] for c in ring]
    lons = [c[0] for c in ring]
    lat_km = (max(lats) - min(lats)) * 111.0
    avg_lat = (max(lats) + min(lats)) / 2.0
    lon_km = (max(lons) - min(lons)) * 111.0 * math.cos(math.radians(avg_lat))
    return lat_km * lon_km


class CustomDestination(BaseModel):
    """A caller-supplied destination, analyzed alongside discovered ones."""

    name: str = Field(description="Display name, 1 to 255 characters.")
    latitude: float = Field(description="Latitude in decimal degrees, -90 to 90.")
    longitude: float = Field(
        description="Longitude in decimal degrees, -180 to 180."
    )
    elevation_ft: float | None = Field(
        default=None,
        description=(
            "Elevation in feet. Optional, but supplying it is what lets the row "
            "take part in an elevation-band filter: rows with an unknown "
            "elevation are never filtered out."
        ),
    )

    @field_validator("name")
    @classmethod
    def name_sane(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Custom destination names cannot be empty.")
        if len(v) > 255:
            raise ValueError("Custom destination names are limited to 255 characters.")
        return v

    @field_validator("latitude")
    @classmethod
    def latitude_range(cls, v: float) -> float:
        if not -90.0 <= v <= 90.0:
            raise ValueError(f"Latitude {v} is outside the valid -90 to 90 range.")
        return v

    @field_validator("longitude")
    @classmethod
    def longitude_range(cls, v: float) -> float:
        if not -180.0 <= v <= 180.0:
            raise ValueError(f"Longitude {v} is outside the valid -180 to 180 range.")
        return v

    @field_validator("elevation_ft")
    @classmethod
    def elevation_plausible(cls, v: float | None) -> float | None:
        # Dead Sea shoreline to above-Everest, in feet — wide enough for any
        # real destination, tight enough to reject unit mix-ups and garbage.
        if v is not None and not -1500.0 <= v <= 30_000.0:
            raise ValueError(
                f"Elevation {v} ft is outside the plausible -1,500 to 30,000 ft range."
            )
        return v


def _check_polygon_area(v: GeoPolygon) -> GeoPolygon:
    """Shared by every polygon-carrying request so the area ceiling and its
    message cannot drift between endpoints."""
    area = bbox_area_km2(v.coordinates[0])
    if area > MAX_POLYGON_AREA_KM2:
        raise ValueError(
            f"Search area is too large (~{area:,.0f} km²). Maximum is {MAX_POLYGON_AREA_KM2:,} km²."
        )
    return v


class _DiscoveryFields(BaseModel):
    """Which destinations a request is about, for the two requests that ask.

    `POST /api/analyze` and `POST /api/destinations` open with the same
    question — which destinations are in scope — and then diverge: one
    forecasts them, the other hands them back. Both once spelled these seven
    fields and three validators for themselves, which is what let the polygon
    ceiling, the custom-list ceiling and the `custom` rejection answer the same
    request two ways (issue #388).

    Descriptions are the one thing that stays per class. Each is approved copy
    a caller reads, and the two endpoints genuinely say different things: a
    polygon is required on one and optional on the other, and a caller-supplied
    list is *analyzed* on one and *resolved* on the other. A subclass that needs
    its own wording restates the field; the four that do are on
    `DestinationsRequest`.
    """

    # The two words the validator messages below differ by: what the endpoint
    # does with a caller's list, and what one of its requests is called. Both
    # messages are approved copy and are otherwise identical, so the shared
    # validators take the word rather than reword either endpoint's answer.
    _list_verb: ClassVar[str] = "analyze"
    _split_noun: ClassVar[str] = "analyses"

    polygon: GeoPolygon | None = Field(
        default=None,
        description=(
            "Search area for destination discovery. Required whenever "
            "`destination_types` is non-empty; with no types requested "
            "discovery is skipped entirely and only `custom_destinations` are "
            "analyzed."
        ),
    )
    destination_types: list[DestinationType] = Field(
        default_factory=list,
        description=(
            "What to discover inside the polygon, as a set — several types are "
            "found in one Overpass query rather than one request each, so "
            "asking for peaks and lakes together costs what peaks alone would. "
            "Order is irrelevant and duplicates are ignored.\n\n"
            "Empty means discover nothing, which is how a request analyzes "
            "only its `custom_destinations`. `custom` is not a discoverable "
            "type and is rejected here. `GET /api/capabilities` lists the "
            "types this deployment actually supports."
        ),
    )
    include_unnamed_peaks: bool = Field(
        default=False,
        description=(
            "Also discover summits OSM knows only by their height, named after "
            "it (`Peak 5961`). Off by default because it is not a small "
            "addition: measured over one 8x10 km box in the Alpine Lakes, 7 "
            "peaks are named and 13 are not, so this roughly triples the "
            "candidate count — every candidate being a weighted upstream call "
            "and a step closer to the analysis ceiling. Ignored unless `peak` "
            "is among `destination_types`."
        ),
    )
    custom_destinations: list[CustomDestination] | None = Field(
        default=None,
        description=(
            "Your own destinations, merged into whatever the polygon discovers. "
            "A custom row matching a discovered one by name or by coordinates "
            "to five decimals replaces it."
        ),
    )
    # Applied to candidates before any forecast, so on the analyze path a
    # constrained request costs fewer upstream calls and the returned rows
    # still fill `limit` whenever enough candidates qualify.
    min_elevation_ft: float | None = Field(
        default=None,
        description=(
            "Drop candidates below this elevation. Candidates with an unknown "
            "elevation always pass through rather than being silently dropped."
        ),
    )
    max_elevation_ft: float | None = Field(
        default=None, description="Drop candidates above this elevation."
    )
    top_by_elevation: bool = Field(
        default=False,
        description=(
            "Explicit opt-in for an over-limit candidate set: instead of "
            "refusing, keep the highest-elevation candidates up to the "
            "analysis limit (rows with unknown elevation are dropped first, "
            "since they cannot claim to be among the highest). The response "
            "then reports `truncated: true` and the pre-cut count in "
            "`total_found`, so a partial ranking is never silent. Off by "
            "default: an unasked-for cut would misrepresent the ranking."
        ),
    )

    @field_validator("destination_types")
    @classmethod
    def validate_destination_types(cls, v: list[DestinationType]) -> list[DestinationType]:
        # `custom` names rows the caller supplies, not something to go and
        # find. It used to be the sentinel for "skip discovery"; an empty list
        # says that directly, so the sentinel would now be a second way to
        # spell the same thing.
        if DestinationType.custom in v:
            raise ValueError(
                "'custom' is not a discoverable type. Send custom_destinations "
                f"with an empty destination_types to {cls._list_verb} a caller-supplied "
                "list."
            )
        return v

    @field_validator("polygon")
    @classmethod
    def polygon_area_limit(cls, v: GeoPolygon | None) -> GeoPolygon | None:
        if v is None:
            return v
        return _check_polygon_area(v)

    @field_validator("custom_destinations")
    @classmethod
    def custom_list_cap(cls, v: list[CustomDestination] | None) -> list[CustomDestination] | None:
        # The same door-level ceiling on both endpoints: resolving a list is
        # cheaper than analyzing one, but an unbounded payload is still an
        # unbounded payload, and a list too big to analyze is not worth
        # resolving.
        if v is not None and len(v) > MAX_ANALYZE_PEAKS:
            raise ValueError(
                f"Too many custom destinations ({len(v):,}). Maximum is "
                f"{MAX_ANALYZE_PEAKS:,}. Trim the list or split it into multiple "
                f"{cls._split_noun}."
            )
        return v


