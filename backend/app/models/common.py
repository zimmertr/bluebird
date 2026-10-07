"""The shapes both request models share: the enums, the polygon, and the discovery fields."""

from __future__ import annotations

import math
from collections.abc import Sequence
from enum import Enum
from typing import Annotated, Any, ClassVar, Literal, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    GetCoreSchemaHandler,
    GetPydanticSchema,
    ValidationError,
    ValidatorFunctionWrapHandler,
    field_validator,
    model_validator,
)
from pydantic_core import CoreSchema, core_schema

from app.limits import MAX_ANALYZE_PEAKS, MAX_POLYGON_AREA_KM2, MAX_POLYGON_POINTS


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
    # The cloud deck (issue #670). Ranking by it makes the analysis fetch the
    # cloud variables, which it otherwise skips.
    cloud_deck_min = "cloud_deck_min_ft"
    cloud_deck_avg = "cloud_deck_avg_ft"
    cloud_deck_max = "cloud_deck_max_ft"
    # The one key that is not a window aggregate: snow depth is today's number
    # whatever window was analyzed, so the family has one member rather than
    # three (issue #449).
    snow_depth = "snow_depth_in"


# Every request model refuses a field it does not declare (issue #563). Left to
# Pydantic's default, a misspelled bound such as `max_wind: 20` was dropped
# without a word and the caller read an unfiltered 200 as a filtered one. The
# models that share it are the request bodies and the shapes nested in them;
# no response model sets it, so a field added to a response stays additive.
_REQUEST_CONFIG = ConfigDict(extra="forbid")

# Every field of a response is sent, null or not, so the schema says so: left
# to Pydantic's default, a field with a default reads as optional and a
# generated client has to test for a key that is always there (issue #563).
# Not on `AnalysisRefusal`, whose remedy fields a hand-raised 400 leaves out.
_RESPONSE_CONFIG = ConfigDict(json_schema_serialization_defaults_required=True)

# The error types a `Field` bound raises. The bounds live on the fields so the
# published schema states the ranges the API enforces, and a validator that
# owns an approved sentence for its range answers exactly these with it, so a
# value that does not even parse keeps Pydantic's own message.
_BOUND_ERRORS = frozenset(
    {"greater_than_equal", "less_than_equal", "string_too_short", "string_too_long"}
)


def _bound_broken(v: Any, handler: ValidatorFunctionWrapHandler) -> tuple[Any, str | None]:
    """Validate `v`, and say which bound it broke rather than raising for one.

    Returns the validated value and None, or the input and the bound error's
    type. Any other failure (a string where a number belongs) raises unchanged.
    """
    try:
        return handler(v), None
    except ValidationError as exc:
        broken = next((e["type"] for e in exc.errors() if e["type"] in _BOUND_ERRORS), None)
        if broken is None:
            raise
        return v, broken


# A ring's shape is held by the types rather than by a validator, so a
# malformed one is refused with Pydantic's own message at the position that is
# wrong before `bbox_area_km2` or discovery indexes into it, and the published
# schema states the shape (#564). Four positions is RFC 7946's minimum: a
# triangle plus the closing repeat.
#
# A position is a longitude and a latitude, optionally followed by one more
# number: RFC 7946's altitude, which a polygon exported from a mapping tool can
# carry. It is accepted and dropped here, the way a polygon's `bbox` is, so
# every reader (the area check, the discovery cache key, the Overpass query)
# only ever sees the `(lon, lat)` pair and an altitude cannot change an answer.
# One number, or four or more, is refused. Built as a core schema because
# Pydantic reads no `tuple[float, float, *tuple[float, ...]]` annotation, and a
# union of the two lengths would report every failure once per branch.
def _position_schema(_source: Any, _handler: GetCoreSchemaHandler) -> CoreSchema:
    return core_schema.no_info_after_validator_function(
        lambda p: (p[0], p[1]),
        core_schema.tuple_schema(
            [
                core_schema.float_schema(ge=-180, le=180),
                core_schema.float_schema(ge=-90, le=90),
                core_schema.float_schema(),
            ],
            variadic_item_index=2,
            max_length=3,
        ),
    )


_Position = Annotated[tuple[float, float], GetPydanticSchema(_position_schema)]
# The maximum is MAX_POLYGON_POINTS, published by /api/capabilities (#619): every
# position is copied into every clause of the Overpass query, and the area cap
# reads only the box around the ring, so it cannot see a dense one.
_Ring = Annotated[list[_Position], Field(min_length=4, max_length=MAX_POLYGON_POINTS)]

# How many rings a polygon may carry, and how many types a request may list
# (#618). Only the outer ring is read and only three types exist, so each bound
# is a schema statement rather than a published limit: both are far above what
# a real request sends, and only stop a list from growing until the body cap.
# Ten types rather than three because a duplicate is accepted and ignored.
_MAX_RINGS = 10
_MAX_TYPES_LISTED = 10


class GeoPolygon(BaseModel):
    """A GeoJSON Polygon bounding the search area."""

    model_config = _REQUEST_CONFIG

    type: Literal["Polygon"]
    coordinates: list[_Ring] = Field(
        min_length=1,
        max_length=_MAX_RINGS,
        description=(
            "GeoJSON coordinate rings. Only the outer ring is read. Positions "
            "are `[longitude, latitude]`, which is GeoJSON order and the "
            "reverse of how coordinates are usually spoken. The ring should "
            "close by repeating its first position. A third number in a "
            "position, an altitude, is accepted and ignored."
        )
    )
    # Declared rather than refused because RFC 7946 lets any GeoJSON object
    # carry one, and a polygon exported from a mapping tool often does. It is
    # never read: the area, the discovery query and the cache key all come
    # from `coordinates`, so a bbox that disagrees with the ring changes
    # nothing.
    bbox: list[float] | None = Field(
        default=None,
        max_length=6,
        description=(
            "Optional GeoJSON bounding box (four or six numbers), accepted and "
            "ignored: the search area is always read from `coordinates`."
        ),
    )


def bbox_area_km2(ring: Sequence[Sequence[float]]) -> float:
    """Approximate bounding-box area in km² for a GeoJSON coordinate ring."""
    lats = [c[1] for c in ring]
    lons = [c[0] for c in ring]
    lat_km = (max(lats) - min(lats)) * 111.0
    avg_lat = (max(lats) + min(lats)) / 2.0
    lon_km = (max(lons) - min(lons)) * 111.0 * math.cos(math.radians(avg_lat))
    return lat_km * lon_km


class CustomDestination(BaseModel):
    """A caller-supplied destination, analyzed alongside discovered ones."""

    model_config = _REQUEST_CONFIG

    name: str = Field(
        min_length=1, max_length=255, description="Display name, 1 to 255 characters."
    )
    latitude: float = Field(
        ge=-90, le=90, description="Latitude in decimal degrees, -90 to 90."
    )
    longitude: float = Field(
        ge=-180, le=180, description="Longitude in decimal degrees, -180 to 180."
    )
    # Dead Sea shoreline to above-Everest, in feet — wide enough for any real
    # destination, tight enough to reject unit mix-ups and garbage.
    elevation_ft: float | None = Field(
        default=None,
        ge=-1500,
        le=30_000,
        description=(
            "Elevation in feet. Optional, but supplying it is what lets the row "
            "take part in an elevation-band filter: rows with an unknown "
            "elevation are never filtered out."
        ),
    )

    # The four validators below hold the sentences a person reads when a
    # bound above refuses a value; the bounds themselves are the fields'.

    @field_validator("name", mode="wrap")
    @classmethod
    def name_sane(cls, v: Any, handler: ValidatorFunctionWrapHandler) -> str:
        # Stripped first, so the length bounds count what is kept.
        if isinstance(v, str):
            v = v.strip()
        value, broken = _bound_broken(v, handler)
        if broken == "string_too_short":
            raise ValueError("Custom destination names cannot be empty.")
        if broken == "string_too_long":
            raise ValueError("Custom destination names are limited to 255 characters.")
        return value

    @field_validator("latitude", mode="wrap")
    @classmethod
    def latitude_range(cls, v: Any, handler: ValidatorFunctionWrapHandler) -> float:
        value, broken = _bound_broken(v, handler)
        if broken:
            raise ValueError(f"Latitude {float(v)} is outside the valid -90 to 90 range.")
        return value

    @field_validator("longitude", mode="wrap")
    @classmethod
    def longitude_range(cls, v: Any, handler: ValidatorFunctionWrapHandler) -> float:
        value, broken = _bound_broken(v, handler)
        if broken:
            raise ValueError(f"Longitude {float(v)} is outside the valid -180 to 180 range.")
        return value

    @field_validator("elevation_ft", mode="wrap")
    @classmethod
    def elevation_plausible(
        cls, v: Any, handler: ValidatorFunctionWrapHandler
    ) -> float | None:
        value, broken = _bound_broken(v, handler)
        if broken:
            raise ValueError(
                f"Elevation {float(v)} ft is outside the plausible -1,500 to 30,000 ft range."
            )
        return value


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

    # Inherited by both request bodies; a subclass's own `model_config` merges
    # with it rather than replacing it.
    model_config = _REQUEST_CONFIG

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
        max_length=_MAX_TYPES_LISTED,
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
        max_length=MAX_ANALYZE_PEAKS,
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

    @field_validator("custom_destinations", mode="wrap")
    @classmethod
    def custom_list_cap(
        cls, v: Any, handler: ValidatorFunctionWrapHandler
    ) -> list[CustomDestination] | None:
        # The same door-level ceiling on both endpoints: resolving a list is
        # cheaper than analyzing one, but an unbounded payload is still an
        # unbounded payload, and a list too big to analyze is not worth
        # resolving. The bound is the field's `max_length`, so the schema
        # states it and the list stops being validated at it (#618); this
        # keeps the approved sentence a caller reads when it is broken.
        try:
            return handler(v)
        except ValidationError as exc:
            if not any(e["type"] == "too_long" and e["loc"] == () for e in exc.errors()):
                raise
            raise ValueError(
                f"Too many custom destinations ({len(v):,}). Maximum is "
                f"{MAX_ANALYZE_PEAKS:,}. Trim the list or split it into multiple "
                f"{cls._split_noun}."
            ) from None

    @classmethod
    def _range_pairs(cls) -> list[tuple[str, str]]:
        """Every `min_X` field with a `max_X` beside it, read off the model.

        Derived rather than listed, so a bound pair added to either request
        is refused the same way without a second table to keep in step: the
        elevation band on both, and every forecast bound on `AnalyzeRequest`.
        """
        return [
            (low, high)
            for low in cls.model_fields
            if low.startswith("min_") and (high := "max_" + low[4:]) in cls.model_fields
        ]

    @model_validator(mode="after")
    def no_range_inverted(self) -> Self:
        # An inverted pair can match nothing, so it answered an empty 200 that
        # read as "nothing qualifies" rather than as the typo it is (#563). An
        # equal pair is a real request: exactly that value.
        for low, high in self._range_pairs():
            floor, ceiling = getattr(self, low), getattr(self, high)
            if floor is not None and ceiling is not None and floor > ceiling:
                raise ValueError(f"{low} must not be above {high}.")
        return self


