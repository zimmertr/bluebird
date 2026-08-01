from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# Bounds the Overpass query, not Open-Meteo spend (the count cap below does
# that). Measured 2026-07-29 against overpass-api.de with the production peaks
# query: a ~103,000 km2 sparse box (Iowa) answered in 25.8s; a ~151,000 km2 box
# drew a dispatcher "too busy" 504; a ~50,000 km2 dense box (WA/OR Cascades)
# answered in 21.2s with 1,576 peaks. 100,000 sits inside measured-reliable
# territory with the [timeout:60] in osm.py as the true backstop. Re-measure
# before raising further.
MAX_POLYGON_AREA_KM2 = 100_000

# Every candidate inside the polygon gets a forecast (no silent sampling), so
# this ceiling is what actually bounds upstream cost per analysis, in
# Open-Meteo's own unit (see services/openmeteo_weight.py): 1,500 destinations
# is ~1,500 weighted weather calls (times 16/14 for the longest window) plus
# AQI for the displayed rows, against their 600/minute/IP budget — about three
# paced minutes worst case. Beyond it the analysis refuses loudly with
# remedies (narrow the elevation band, elect the top-N, shrink the polygon);
# truncation only ever happens when the request explicitly opts in.
MAX_ANALYZE_PEAKS = 1_500

# Open-Meteo serves roughly the last ~90 days of history through ~16 days
# ahead; the frontend blocks windows outside that band (urlState.ts). These
# looser bounds are a backstop for direct API callers — enough slack that a
# legitimate edge window never gets a false 422, while an egregious one (say,
# a year ahead) fails fast with a clear message instead of an upstream 400.
PAST_LIMIT_SLACK_DAYS = 95
FUTURE_LIMIT_SLACK_DAYS = 17

# Rows returned per analysis. Named rather than inline so the validator and
# GET /api/capabilities cannot drift apart. The ceiling equals the analysis
# cap on purpose: `limit` trims the response, never the upstream work, and a
# smaller server ceiling than the SPA's knob would make the rare server
# fallback reject requests the browser path accepts (issue #180). Response
# size stays bounded by the analysis cap regardless.
MIN_LIMIT = 1
MAX_LIMIT = MAX_ANALYZE_PEAKS


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


class DestinationType(str, Enum):
    peak = "peak"
    trailhead = "trailhead"
    lake = "lake"
    custom = "custom"


class ForecastMode(str, Enum):
    # `at` rather than `future` because the API serves roughly 90 days of
    # history, so a single-moment sample is not necessarily ahead of now.
    current = "current"
    at = "at"
    window = "window"


class SortBy(str, Enum):
    precip_total = "precip_total_in"
    precip_max = "precip_max_in_hr"
    wind_avg = "wind_avg_mph"
    wind_max = "wind_max_mph"
    temp_min = "temp_min_f"
    temp_avg = "temp_avg_f"
    temp_max = "temp_max_f"
    aqi_avg = "aqi_avg"
    aqi_max = "aqi_max"


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
            f"Search area is too large (~{area:,.0f} km²). "
            f"Maximum allowed is {MAX_POLYGON_AREA_KM2:,} km². "
            "Larger areas are more than the map search service can scan in "
            "one query. Draw a smaller polygon."
        )
    return v


class AnalyzeRequest(BaseModel):
    """One analysis: which destinations, over which window, ranked how."""

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
                "with an empty destination_types to analyze a caller-supplied "
                "list."
            )
        return v
    forecast_mode: ForecastMode | None = Field(
        default=None,
        description=(
            "Which of the three forecast modes this request is. `current` needs "
            "no timestamps and analyzes the hour at hand. `at` takes "
            "`start_datetime` alone and samples that single hour, past or "
            "future. `window` takes both and analyzes the span.\n\n"
            "Omitting it is supported for compatibility and inferred from what "
            "you send: both timestamps means `window`, neither means `current`. "
            "Sending only `start_datetime` without a mode is rejected, because "
            "it could equally mean `at` or a `window` missing its end."
        ),
    )
    start_datetime: datetime | None = Field(
        default=None,
        description=(
            "ISO 8601; a naive timestamp is read as UTC. Required for `at` and "
            "`window`, and rejected for `current`."
        ),
    )
    end_datetime: datetime | None = Field(
        default=None,
        description=(
            "ISO 8601, inclusive of the hour it lands in. Required for "
            "`window`, and rejected for the other two modes."
        ),
    )
    limit: int = Field(
        default=10,
        description=(
            "How many ranked rows to return. Discovery is never sampled, so "
            "this trims the response, not the work: every candidate is "
            "forecast and ranked before the cut."
        ),
    )
    sort_by: SortBy = Field(
        default=SortBy.precip_total, description="Metric the ranking sorts on."
    )
    sort_desc: bool = Field(
        default=False,
        description=(
            "Sort direction. False ranks lowest first, which is the useful "
            "default: driest, calmest, coldest, cleanest. True flips it to "
            "wettest, windiest, warmest, smokiest."
        ),
    )
    # Applied to candidates before the weather fetch, so a constrained analysis
    # costs fewer upstream calls, and the returned rows always fill `limit` when
    # enough candidates qualify.
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
    custom_destinations: list[CustomDestination] | None = Field(
        default=None,
        description=(
            "Your own destinations, merged into whatever the polygon discovers. "
            "A custom row matching a discovered one by name or by coordinates "
            "to five decimals replaces it."
        ),
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

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    # Tiger Mountain, Issaquah WA. Deliberately the same area the
                    # release smoke test uses, so the documented example and the
                    # thing gating deploys exercise identical ground.
                    "polygon": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [-122.03, 47.44],
                                [-121.91, 47.44],
                                [-121.91, 47.53],
                                [-122.03, 47.53],
                                [-122.03, 47.44],
                            ]
                        ],
                    },
                    "destination_types": ["peak"],
                    "forecast_mode": "current",
                    "limit": 5,
                    "sort_by": "precip_total_in",
                    "sort_desc": False,
                }
            ]
        }
    }

    @field_validator("limit")
    @classmethod
    def limit_range(cls, v: int) -> int:
        if v < MIN_LIMIT or v > MAX_LIMIT:
            raise ValueError(f"limit must be between {MIN_LIMIT} and {MAX_LIMIT}")
        return v

    @field_validator("custom_destinations")
    @classmethod
    def custom_list_cap(cls, v: list[CustomDestination] | None) -> list[CustomDestination] | None:
        # Same ceiling the route enforces on the merged candidate field —
        # rejecting an oversized list at the door keeps a single request from
        # smuggling in an unbounded payload.
        if v is not None and len(v) > MAX_ANALYZE_PEAKS:
            raise ValueError(
                f"Too many custom destinations ({len(v):,}). Maximum is "
                f"{MAX_ANALYZE_PEAKS:,}. Trim the list or split it into multiple analyses."
            )
        return v

    @field_validator("polygon")
    @classmethod
    def polygon_area_limit(cls, v: GeoPolygon | None) -> GeoPolygon | None:
        if v is None:
            return v
        return _check_polygon_area(v)

    def _resolve_forecast_mode(self) -> None:
        """Settle `forecast_mode` and fill in the timestamps it implies.

        Leaves both timestamps non-None for everything downstream, so the
        pipeline only ever sees an ordinary ordered window.
        """
        mode = self.forecast_mode
        if mode is None:
            if self.start_datetime and self.end_datetime:
                mode = ForecastMode.window
            elif not self.start_datetime and not self.end_datetime:
                mode = ForecastMode.current
            else:
                # Refused rather than guessed. Picking one here would recreate
                # the defect the mode exists to remove: a window that quietly
                # collapses into a one-hour sample because a field was missed.
                raise ValueError(
                    "Ambiguous request: one timestamp was sent without a "
                    "forecast_mode. Send forecast_mode='at' with "
                    "start_datetime to sample a single hour, or send both "
                    "timestamps for a window."
                )
            self.forecast_mode = mode

        if mode is ForecastMode.current:
            if self.start_datetime or self.end_datetime:
                raise ValueError(
                    "forecast_mode='current' analyzes the hour at hand and "
                    "takes no timestamps. Drop them, or use 'at' or 'window'."
                )
            self.start_datetime = datetime.now(timezone.utc)
            self.end_datetime = self.start_datetime
        elif mode is ForecastMode.at:
            if not self.start_datetime:
                raise ValueError("forecast_mode='at' requires start_datetime.")
            if self.end_datetime:
                raise ValueError(
                    "forecast_mode='at' samples the single hour containing "
                    "start_datetime and takes no end_datetime. Use "
                    "forecast_mode='window' for a span."
                )
            self.end_datetime = self.start_datetime
        elif not self.start_datetime or not self.end_datetime:
            raise ValueError(
                "forecast_mode='window' requires both start_datetime and "
                "end_datetime."
            )

    @model_validator(mode="after")
    def window_within_servable_range(self) -> AnalyzeRequest:
        self._resolve_forecast_mode()
        # A zero-length window is a point sample ("current conditions" /
        # "future day/time"): analyze exactly the hour containing the moment.
        # Flooring to the hour and spanning one minute keeps the weather
        # service's inclusive hour filter to a single hourly timestamp — a
        # bare +1h span would catch two stamps whenever the moment lands
        # exactly on an hour boundary, the common case for a time picker.
        # Normalizing here — before the range checks and ahead of the routes'
        # ordering guard — means the rest of the pipeline only ever sees an
        # ordinary ordered window.
        if self.start_datetime == self.end_datetime:
            self.start_datetime = self.start_datetime.replace(
                minute=0, second=0, microsecond=0
            )
            self.end_datetime = self.start_datetime + timedelta(minutes=1)
        now = datetime.now(timezone.utc)
        if _as_utc(self.start_datetime) < now - timedelta(days=PAST_LIMIT_SLACK_DAYS):
            raise ValueError(
                "start_datetime is beyond the ~90-day history limit of the "
                "weather API. Move the window start closer to today."
            )
        if _as_utc(self.end_datetime) > now + timedelta(days=FUTURE_LIMIT_SLACK_DAYS):
            raise ValueError(
                "end_datetime is beyond the ~16-day forecast horizon of the "
                "weather API. Move the window end closer to today."
            )
        return self


class HourlySeries(BaseModel):
    """Per-hour values, aligned index-for-index to `AnalyzeResponse.times`.

    A null is a genuine gap, meaning no value at that hour, most often AQI past
    its shorter horizon. Consumers should render a break rather than
    interpolating across one.
    """

    precip_in: list[float | None] = Field(description="Precipitation, inches.")
    temp_f: list[float | None] = Field(description="Temperature, degrees Fahrenheit.")
    wind_mph: list[float | None] = Field(description="Wind speed, miles per hour.")
    aqi: list[int | None] = Field(description="US AQI, all EPA pollutants combined.")


class DestinationResult(BaseModel):
    """One ranked destination, summarized over the analyzed window."""

    name: str = Field(description="Destination name, from OSM or your CSV.")
    type: str = Field(
        description=(
            "Where the row came from: the discovery type, or `custom` for a "
            "caller-supplied destination."
        )
    )
    latitude: float = Field(description="Latitude in decimal degrees.")
    longitude: float = Field(description="Longitude in decimal degrees.")
    elevation_ft: float | None = Field(
        default=None, description="Elevation in feet, when known."
    )
    osm_id: str | None = Field(
        default=None,
        description=(
            "OpenStreetMap identifier such as `node/12345`. Null for custom "
            "destinations, which have no OSM identity."
        ),
    )
    precip_total_in: float = Field(
        description="Total precipitation across the window, inches."
    )
    precip_avg_in_hr: float = Field(description="Mean hourly precipitation, inches.")
    precip_max_in_hr: float = Field(
        description="Wettest single hour in the window, inches."
    )
    temp_min_f: float = Field(description="Coldest hour, degrees Fahrenheit.")
    temp_max_f: float = Field(description="Warmest hour, degrees Fahrenheit.")
    temp_avg_f: float = Field(description="Mean temperature, degrees Fahrenheit.")
    wind_min_mph: float = Field(description="Calmest hour, miles per hour.")
    wind_max_mph: float = Field(description="Windiest hour, miles per hour.")
    wind_avg_mph: float = Field(description="Mean wind speed, miles per hour.")
    aqi_avg: int | None = Field(
        default=None,
        description=(
            "Mean US AQI across the window, all EPA pollutants combined. Null "
            "past the air-quality horizon, or if the best-effort fetch failed. "
            "An air-quality outage never fails an analysis."
        ),
    )
    aqi_max: int | None = Field(
        default=None, description="Worst single AQI hour. Null under the same terms."
    )
    series: HourlySeries | None = Field(
        default=None,
        description=(
            "Hourly detail behind the summary figures above, aligned to "
            "`times`. Null only when the upstream forecast carried no hours "
            "inside the window."
        ),
    )


class ErrorResponse(BaseModel):
    """Body of a hand-raised API error.

    Note that a 422 differs: request validation is Pydantic's, and its `detail`
    is a list of per-field objects rather than a string. That shape is
    documented separately as `HTTPValidationError`.
    """

    detail: str = Field(
        description=(
            "Plain-language explanation of what went wrong, written to be shown "
            "to an end user unmodified."
        )
    )


class AnalysisRefusal(BaseModel):
    """400 body for a request that parsed but cannot run as asked.

    `detail` is always present and readable on its own, exactly like
    `ErrorResponse`. The structured fields appear only on over-limit
    refusals, so a client can offer working remedies (prefill an elevation
    floor, offer an explicit top-N analysis) instead of a dead retry button.
    """

    detail: str = Field(
        description="Plain-language refusal, shown to an end user unmodified."
    )
    found: int | None = Field(
        default=None,
        description="How many candidates the search actually found.",
    )
    limit: int | None = Field(
        default=None,
        description="The analysis ceiling the count exceeded (destinations).",
    )
    suggested_min_elevation_ft: float | None = Field(
        default=None,
        description=(
            "A computed elevation floor that would bring the candidate count "
            "under the limit, when one exists. Rounded up to a clean number."
        ),
    )
    suggested_keeps: int | None = Field(
        default=None,
        description=(
            "How many candidates would remain with the suggested floor "
            "applied (unknown elevations always pass elevation filters, so "
            "this can be well under the limit)."
        ),
    )


class AnalyzeResponse(BaseModel):
    """A completed analysis: the ranking, and what it was drawn from."""

    results: list[DestinationResult] = Field(
        description="Ranked destinations, best first, at most `limit` of them."
    )
    total_queried: int = Field(
        description=(
            "How many candidates were forecast and ranked before `limit` cut "
            "the list. Compare against `len(results)` to see how much of the "
            "ranking is not being shown."
        )
    )
    error: str | None = Field(
        default=None,
        description=(
            "Always null here. A failed analysis returns a 4xx or 5xx with a "
            "`detail` message instead. The field exists because the streaming "
            "endpoint reuses this shape."
        ),
    )
    total_found: int | None = Field(
        default=None,
        description=(
            "Pre-truncation candidate count when `truncated` is true; null "
            "otherwise. Lets a client caption an elected top-N honestly "
            "(\"top 1,500 of 2,340\")."
        ),
    )
    truncated: bool = Field(
        default=False,
        description=(
            "True only when the request set `top_by_elevation` and the "
            "candidate set exceeded the limit, so only the highest "
            "candidates were analyzed. Never true otherwise: an over-limit "
            "set without the opt-in refuses with a 400 instead."
        ),
    )
    times: list[int] = Field(
        default=[],
        description=(
            "Shared hourly grid for every row's `series`, as epoch "
            "milliseconds UTC. Sent once because it is identical across "
            "destinations for a given window."
        ),
    )


class DestinationsRequest(BaseModel):
    """Discovery only: which destinations exist, with no forecasts attached.

    This is the first half of `POST /api/analyze`. The SPA uses it to get the
    candidate list and then fetches Open-Meteo itself, so a browser analysis
    costs this deployment one Overpass query instead of dozens of forecast
    calls.

    Two kinds of candidate arrive here. A polygon is *discovered*; a
    `custom_destinations` list is *resolved* — the caller already knows where
    its points are, so the only open question is what OSM knows about them.
    """

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

    @field_validator("destination_types")
    @classmethod
    def validate_destination_types(cls, v: list[DestinationType]) -> list[DestinationType]:
        if DestinationType.custom in v:
            raise ValueError(
                "'custom' is not a discoverable type. Send custom_destinations "
                "with an empty destination_types to resolve a caller-supplied "
                "list."
            )
        return v
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
            "Explicit opt-in for an over-limit result: keep the "
            "highest-elevation candidates up to the analysis limit instead of "
            "refusing (unknown elevations are dropped first). The response "
            "reports `truncated: true` and the pre-cut count in `total_found`."
        ),
    )

    @field_validator("polygon")
    @classmethod
    def polygon_area_limit(cls, v: GeoPolygon | None) -> GeoPolygon | None:
        if v is None:
            return v
        return _check_polygon_area(v)

    @field_validator("custom_destinations")
    @classmethod
    def custom_list_cap(
        cls, v: list[CustomDestination] | None
    ) -> list[CustomDestination] | None:
        # The same door-level ceiling AnalyzeRequest applies: resolving a list
        # is cheaper than analyzing one, but an unbounded payload is still an
        # unbounded payload, and a list too big to analyze is not worth
        # resolving.
        if v is not None and len(v) > MAX_ANALYZE_PEAKS:
            raise ValueError(
                f"Too many custom destinations ({len(v):,}). Maximum is "
                f"{MAX_ANALYZE_PEAKS:,}. Trim the list or split it into multiple requests."
            )
        return v


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
