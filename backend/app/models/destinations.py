"""The request and response of `POST /api/destinations`, discovery with no forecasts."""

from __future__ import annotations

from typing import ClassVar

from pydantic import BaseModel, Field

from app.models.common import (
    _SNOW_DATE_DESCRIPTION,
    _SNOW_DEPTH_DESCRIPTION,
    CustomDestination,
    DestinationType,
    GeoPolygon,
    _DiscoveryFields,
)


class DestinationsRequest(_DiscoveryFields):
    """Discovery only: which destinations exist, with no forecasts attached.

    This is the first half of `POST /api/analyze`. The SPA uses it to get the
    candidate list and then fetches Open-Meteo itself, so a browser analysis
    costs this deployment one Overpass query instead of dozens of forecast
    calls.

    Two kinds of candidate arrive here. A polygon is *discovered*; a
    `custom_destinations` list is *resolved* — the caller already knows where
    its points are, so the only open question is what OSM knows about them.
    """

    # The fields and the validators are `_DiscoveryFields`'. What is restated
    # below is the four descriptions that read differently here: this endpoint
    # resolves a list where the other analyzes one, and its polygon is optional
    # where the other's is conditional. A docstring would say the same thing,
    # but a model's docstring is published as the schema description, and this
    # is a note to the next reader of the file rather than to a caller.
    _list_verb: ClassVar[str] = "resolve"
    _split_noun: ClassVar[str] = "requests"

    polygon: GeoPolygon | None = Field(
        default=None,
        description=(
            "Search area, validated exactly as on `POST /api/analyze`. "
            "Required unless `custom_destinations` is supplied; send both to "
            "resolve a caller's list alongside a discovery."
        ),
    )
    destination_types: list[DestinationType] = Field(
        default_factory=list,
        description=(
            "What to discover inside the polygon, as a set — several types "
            "come back from one Overpass query, each row tagged with the type "
            "it actually is. Order is irrelevant and duplicates are ignored.\n\n"
            "Empty means a resolve-only request: discovery is skipped and only "
            "`custom_destinations` come back. `custom` is not a discoverable "
            "type and is rejected here."
        ),
    )
    custom_destinations: list[CustomDestination] | None = Field(
        default=None,
        description=(
            "Caller-supplied destinations to resolve against OSM. Each is "
            "matched to the nearest peak within ~150 m, filling in "
            "`elevation_ft` and `osm_id` where OSM knows them — a point with "
            "no match keeps whatever it arrived with. A row that already "
            "carries an elevation is never looked up or overwritten.\n\n"
            "Resolution is best-effort: if the map service is unreachable the "
            "rows come back exactly as sent rather than failing the request."
        ),
    )
    top_by_elevation: bool = Field(
        default=False,
        description=(
            "Explicit opt-in for an over-limit result: keep the "
            "highest-elevation candidates up to the analysis limit instead of "
            "refusing (unknown elevations are dropped first). The response "
            "reports `truncated: true` and the pre-cut count in `total_found`."
        ),
    )


class DiscoveredDestination(BaseModel):
    """One candidate, forecast-free."""

    name: str = Field(
        description="Destination name: OSM's for a discovered row, the caller's for a custom one."
    )
    type: str = Field(
        description=(
            "The discovery type this row matched, or `custom` for a "
            "caller-supplied row."
        )
    )
    latitude: float = Field(description="Latitude in decimal degrees.")
    longitude: float = Field(description="Longitude in decimal degrees.")
    elevation_ft: float | None = Field(
        default=None,
        description=(
            "Elevation in feet, when OSM knows it. For a custom row this is "
            "the caller's own value if one was sent, otherwise the matched "
            "peak's — null when neither exists."
        ),
    )
    osm_id: str | None = Field(
        default=None, description="OpenStreetMap identifier such as `node/12345`."
    )
    snow_depth_in: float | None = Field(
        default=None, description=_SNOW_DEPTH_DESCRIPTION
    )


class DestinationsResponse(BaseModel):
    """Everything found, after the optional elevation band."""

    destinations: list[DiscoveredDestination] = Field(
        description=(
            "Every named match inside the polygon, never sampled, plus any "
            "resolved `custom_destinations`. Order is OSM's with the caller's "
            "own rows last, not a ranking; ranking is the caller's job once "
            "forecasts are attached."
        )
    )
    total: int = Field(description="Same as `len(destinations)`, for convenience.")
    total_found: int | None = Field(
        default=None,
        description=(
            "Pre-truncation candidate count when `truncated` is true; null "
            "otherwise."
        ),
    )
    truncated: bool = Field(
        default=False,
        description=(
            "True only when the request set `top_by_elevation` and the found "
            "set exceeded the limit, so `destinations` holds the highest "
            "candidates only."
        ),
    )
    snow_analysis_date: str | None = Field(
        default=None, description=_SNOW_DATE_DESCRIPTION
    )
