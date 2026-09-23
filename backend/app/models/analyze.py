"""The request and response of `POST /api/analyze`, and the error body every route shares."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from pydantic import BaseModel, Field, field_validator, model_validator

from app.error_codes import ErrorCode, error_object
from app.forecast_models import DEFAULT_FORECAST_MODEL, ForecastModel
from app.limits import (
    FUTURE_LIMIT_SLACK_DAYS,
    MAX_LIMIT,
    MIN_LIMIT,
    PAST_LIMIT_SLACK_DAYS,
    _as_utc,
)
from app.models.common import (
    _SNOW_DATE_DESCRIPTION,
    _SNOW_DEPTH_DESCRIPTION,
    ForecastMode,
    SortBy,
    _DiscoveryFields,
)


class AnalyzeRequest(_DiscoveryFields):
    """One analysis: which destinations, over which window, ranked how."""

    forecast_model: ForecastModel = Field(
        default=DEFAULT_FORECAST_MODEL,
        description=(
            "Which weather model answers. Models disagree, sometimes by more "
            "than the thing being measured: at one Cascades summit over three "
            "days, ECMWF and GFS both totalled 0.000 in of precipitation while "
            "ICON gave 0.004 in.\n\n"
            "Each model also reaches a different distance ahead, so this bounds "
            "`end_datetime` as well: hours past the chosen model's horizon come "
            "back null rather than failing, and `GET /api/capabilities` "
            "publishes how far each one reaches. `gfs_hrrr` is the short-range "
            "outlier — roughly two days, against two weeks for the global "
            "models — and is also the only regional one, covering the "
            "continental US with parts of Canada and Mexico and refusing any "
            "point outside that grid."
        ),
    )
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
    include_series: bool = Field(
        default=True,
        description=(
            "Send each row's hourly `series`. The hours are the bulk of the "
            "body, by an order of magnitude on a long window, so a caller "
            "that reads only the aggregates should set this false.\n\n"
            "Nothing else changes. The aggregates are computed from the same "
            "hours either way, `times` is still sent, and air quality is still "
            "fetched and summarized under the same best-effort terms. "
            "True by default, so an existing caller sees the shape it "
            "always saw."
        ),
    )
    include_clouds: bool = Field(
        default=False,
        description=(
            "Send the six cloud fields (`cloud_base_*_ft`, `cloud_cover_*_pct`) "
            "and their hourly series on the returned rows. Off by default "
            "because the cloud variables are a second upstream request per "
            "location: they are fetched only for the rows this response "
            "returns, after the ranking and the `limit` cut, the way air "
            "quality is.\n\n"
            "Not needed to rank or bound by a cloud field. A `sort_by` naming "
            "one, or any cloud bound, fetches the cloud variables for every "
            "candidate before the ranking, whatever this is set to. With none "
            "of the three, the six fields are null."
        ),
    )
    # Forecast bounds, applied after aggregation and BEFORE the ranking and the
    # `limit` cut, so "the top N matching destinations" is literally true rather
    # than "whichever of the top N happened to match".
    #
    # The elevation band on `_DiscoveryFields` is a different animal and reads
    # differently on purpose: it is known before any forecast exists, so it
    # gates the weather fetch and a constrained analysis costs fewer upstream
    # calls. Nothing here can do that —
    # a destination's precipitation is not knowable until it has been fetched —
    # so these only ever shrink the answer, never the work.
    #
    # Which value each bound compares is the whole of the design. A ceiling
    # compares the window's WORST hour and a floor its best, so a bound is a
    # promise about every hour in the window: `max_wind_mph = 20` admits no
    # destination that gusts to 45 at noon, which is the only reading a
    # mountaineer can plan against. The freezing level reads the same way in
    # the one family where neither end is the bad one: the floor asks that the
    # level never dropped below the value, the ceiling that it never rose above
    # it. Precipitation and AQI have no minimum
    # aggregate to bound (a per-hour precipitation floor would be 0.000 almost
    # everywhere), so their two bounds both compare one named field, and that
    # field is named in the description a caller reads.
    min_precip_total_in: float | None = Field(
        default=None,
        ge=0,
        description="Drop rows whose `precip_total_in` is below this.",
    )
    max_precip_total_in: float | None = Field(
        default=None,
        ge=0,
        description="Drop rows whose `precip_total_in` is above this.",
    )
    min_temp_f: float | None = Field(
        default=None,
        description=(
            "Drop rows whose `temp_min_f` is below this, i.e. keep only "
            "destinations that stay at or above it for the whole window. Not "
            "bounded below: a floor of -40 is a real request."
        ),
    )
    max_temp_f: float | None = Field(
        default=None,
        description=(
            "Drop rows whose `temp_max_f` is above this, i.e. keep only "
            "destinations that stay at or below it for the whole window."
        ),
    )
    min_wind_mph: float | None = Field(
        default=None,
        ge=0,
        description="Drop rows whose `wind_min_mph` is below this.",
    )
    max_wind_mph: float | None = Field(
        default=None,
        ge=0,
        description=(
            "Drop rows whose `wind_max_mph` is above this, i.e. keep only "
            "destinations that never exceed it during the window."
        ),
    )
    min_freeze_ft: float | None = Field(
        default=None,
        description=(
            "Drop rows whose `freeze_min_ft` is below this, i.e. keep only "
            "destinations whose freezing level never fell below it during the "
            "window. Not bounded below: a freezing level of 0 is a reading, "
            "not a gap."
        ),
    )
    max_freeze_ft: float | None = Field(
        default=None,
        description=(
            "Drop rows whose `freeze_max_ft` is above this, i.e. keep only "
            "destinations whose freezing level never rose above it during the "
            "window. A row with a null `freeze_max_ft` passes either bound: "
            "only some forecast models publish a freezing level at all, so a "
            "missing number says which model answered rather than what the "
            "weather did, and dropping those rows would empty the whole "
            "result under every other model."
        ),
    )
    min_snow_depth_in: float | None = Field(
        default=None,
        ge=0,
        description=(
            "Drop rows whose `snow_depth_in` is below this. A row with a null "
            "`snow_depth_in` passes either bound: the destination is outside "
            "the snow grid, or this instance holds no grid, and neither says "
            "anything about how much snow is on the ground."
        ),
    )
    max_snow_depth_in: float | None = Field(
        default=None,
        ge=0,
        description="Drop rows whose `snow_depth_in` is above this. Nulls pass, under the same terms.",
    )
    min_cloud_base_ft: float | None = Field(
        default=None,
        description=(
            "Drop rows whose `cloud_base_min_ft` is below this, i.e. keep only "
            "destinations whose cloud base never fell below it during the "
            "window. Setting any cloud bound fetches the cloud variables for "
            "every candidate. A row with a null cloud base passes either bound."
        ),
    )
    max_cloud_base_ft: float | None = Field(
        default=None,
        description=(
            "Drop rows whose `cloud_base_max_ft` is above this. Nulls pass, "
            "under the same terms."
        ),
    )
    min_cloud_cover_pct: float | None = Field(
        default=None,
        ge=0,
        description=(
            "Drop rows whose `cloud_cover_min_pct` is below this. Nulls pass."
        ),
    )
    max_cloud_cover_pct: float | None = Field(
        default=None,
        ge=0,
        description=(
            "Drop rows whose `cloud_cover_max_pct` is above this, i.e. keep "
            "only destinations that stay at or under it for the whole window. "
            "Nulls pass."
        ),
    )
    min_aqi: float | None = Field(
        default=None,
        ge=0,
        description="Drop rows whose `aqi_max` is below this.",
    )
    max_aqi: float | None = Field(
        default=None,
        ge=0,
        description=(
            "Drop rows whose `aqi_max` is above this. A row with a null "
            "`aqi_max` passes either bound rather than being dropped: air "
            "quality is only forecast about five days out and the fetch is "
            "best-effort, so a missing number is an absence of evidence, not "
            "evidence of bad air. Setting either bound also makes the analysis "
            "fetch air quality for every candidate instead of only the "
            "returned rows, since a bound cannot be applied to a value that "
            "was never fetched."
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
            self.start_datetime = datetime.now(UTC)
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

    def resolved_window(self) -> tuple[datetime, datetime]:
        """The window as two real instants, for code that runs after validation.

        The fields are optional on the wire because `forecast_mode` implies
        them, and `_resolve_forecast_mode` fills both before any route reads
        the request. Narrowing here, once, lets every reader take a plain
        `datetime` instead of re-checking the fields or trusting that the
        validator ran.
        """
        if self.start_datetime is None or self.end_datetime is None:
            raise RuntimeError("AnalyzeRequest window read before validation filled it")
        return self.start_datetime, self.end_datetime

    @model_validator(mode="after")
    def window_within_servable_range(self) -> AnalyzeRequest:
        self._resolve_forecast_mode()
        start, end = self.resolved_window()
        # A zero-length window is a point sample ("current conditions" /
        # "future day/time"): analyze exactly the hour containing the moment.
        # Flooring to the hour and spanning one minute keeps the weather
        # service's inclusive hour filter to a single hourly timestamp — a
        # bare +1h span would catch two stamps whenever the moment lands
        # exactly on an hour boundary, the common case for a time picker.
        # Normalizing here — before the range checks and ahead of the routes'
        # ordering guard — means the rest of the pipeline only ever sees an
        # ordinary ordered window.
        if start == end:
            start = start.replace(minute=0, second=0, microsecond=0)
            end = start + timedelta(minutes=1)
            self.start_datetime = start
            self.end_datetime = end
        now = datetime.now(UTC)
        if _as_utc(start) < now - timedelta(days=PAST_LIMIT_SLACK_DAYS):
            raise ValueError(
                "start_datetime is beyond the one-year history limit of the "
                "weather API. Move the window start closer to today."
            )
        if _as_utc(end) > now + timedelta(days=FUTURE_LIMIT_SLACK_DAYS):
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
    wind_mph: list[float | None] = Field(
        description=(
            "Wind speed at the destination's elevation, miles per hour. "
            "See `wind_avg_mph` on the result for how it is derived."
        )
    )
    freeze_ft: list[float | None] = Field(
        description=(
            "Freezing level, feet above sea level. Null at every hour for the "
            "models that do not publish the variable; see `freeze_avg_ft` on "
            "the result."
        )
    )
    aqi: list[int | None] = Field(description="US AQI, all EPA pollutants combined.")
    cloud_base_ft: list[float | None] | None = Field(
        default=None,
        description=(
            "Cloud base, feet above sea level; see `cloud_base_min_ft` on the "
            "result. Null as a whole unless the cloud variables were fetched."
        ),
    )
    cloud_cover_pct: list[float | None] | None = Field(
        default=None,
        description=(
            "Total cloud cover, percent. Null as a whole unless the cloud "
            "variables were fetched."
        ),
    )


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
    precip_min_in_hr: float = Field(
        description=(
            "Driest single hour in the window, inches. Zero for any window "
            "with one dry hour."
        )
    )
    precip_max_in_hr: float = Field(
        description="Wettest single hour in the window, inches."
    )
    temp_min_f: float = Field(description="Coldest hour, degrees Fahrenheit.")
    temp_max_f: float = Field(description="Warmest hour, degrees Fahrenheit.")
    temp_avg_f: float = Field(description="Mean temperature, degrees Fahrenheit.")
    wind_min_mph: float = Field(description="Calmest hour, miles per hour.")
    wind_max_mph: float = Field(description="Windiest hour, miles per hour.")
    wind_avg_mph: float = Field(
        description=(
            "Mean wind speed at the destination's elevation, miles per hour. "
            "Each hour interpolates Open-Meteo's free-air wind between the "
            "two pressure levels bracketing `elevation_ft`, floored at the "
            "10 m surface wind; rows with no elevation, or below the lowest "
            "level (~762 m), report the 10 m wind. All three wind aggregates "
            "reduce the same adjusted hourly values."
        )
    )
    freeze_min_ft: float | None = Field(
        default=None,
        description=(
            "Lowest freezing level in the window, feet above sea level. Read "
            "against `elevation_ft`: below the destination, the whole "
            "destination was below freezing at that hour. Zero means the "
            "freezing level reached sea level, not that there is no value. "
            "Null for every hour of a forecast model that does not publish "
            "the variable, which is five of the eight; an absent freezing "
            "level never affects the other figures on this row."
        ),
    )
    freeze_max_ft: float | None = Field(
        default=None,
        description="Highest freezing level in the window. Null under the same terms.",
    )
    freeze_avg_ft: float | None = Field(
        default=None,
        description="Mean freezing level across the window. Null under the same terms.",
    )
    aqi_avg: int | None = Field(
        default=None,
        description=(
            "Mean US AQI across the window, all EPA pollutants combined. Null "
            "past the air-quality horizon, or if the best-effort fetch failed. "
            "An air-quality outage never fails an analysis."
        ),
    )
    aqi_min: int | None = Field(
        default=None, description="Cleanest single AQI hour. Null under the same terms."
    )
    aqi_max: int | None = Field(
        default=None, description="Worst single AQI hour. Null under the same terms."
    )
    snow_depth_in: float | None = Field(
        default=None, description=_SNOW_DEPTH_DESCRIPTION
    )
    cloud_base_min_ft: float | None = Field(
        default=None,
        description=(
            "Lowest cloud base in the window, feet above sea level. Each hour "
            "is the lowest height in the model's air column over the "
            "destination where the relative humidity reaches 95 %, read from "
            "the destination's own 2 m air and the standard pressure levels "
            "above it and interpolated between the two that bracket it. "
            "Read against `elevation_ft`: at or below it, the destination "
            "was in cloud. When nothing in the column is saturated the hour "
            "reads the destination's own parcel base, about 125 m above it "
            "per degree Celsius between its temperature and dew point, so a "
            "clear sky reads a high number rather than null.\n\n"
            "Null unless the cloud variables were fetched (a cloud `sort_by`, "
            "a cloud bound, or `include_clouds`), for a destination with no "
            "known elevation, and for archive hours, which carry no pressure "
            "levels to read."
        ),
    )
    cloud_base_avg_ft: float | None = Field(
        default=None,
        description="Mean cloud base across the window. Null under the same terms.",
    )
    cloud_base_max_ft: float | None = Field(
        default=None,
        description="Highest cloud base in the window. Null under the same terms.",
    )
    cloud_cover_min_pct: float | None = Field(
        default=None,
        description=(
            "Clearest hour's total cloud cover, percent. Null unless the "
            "cloud variables were fetched. Unlike the cloud base, archive "
            "windows carry it."
        ),
    )
    cloud_cover_avg_pct: float | None = Field(
        default=None,
        description="Mean cloud cover across the window. Null under the same terms.",
    )
    cloud_cover_max_pct: float | None = Field(
        default=None,
        description="Cloudiest hour's cloud cover. Null under the same terms.",
    )
    series: HourlySeries | None = Field(
        default=None,
        description=(
            "Hourly detail behind the summary figures above, aligned to "
            "`times`. Null when the upstream forecast carried no hours inside "
            "the window, and on every row when the request set "
            "`include_series: false`."
        ),
    )


class ApiErrorInfo(BaseModel):
    """The same failure as a code a program can branch on.

    It rides beside `detail` rather than replacing it, because the two are
    read by different audiences: the sentence by a person, the code by a
    client deciding whether to retry.
    """

    code: ErrorCode = Field(
        description=(
            "Which kind of failure this is, from a closed vocabulary. Stable "
            "contract: unlike `detail`, a code is not reworded."
        )
    )
    retryable: bool = Field(
        description=(
            "Whether sending the identical request again is worth trying. "
            "False means only the caller can change the outcome. On a 429 or "
            "503 the `Retry-After` header says when."
        )
    )

    @classmethod
    def for_code(cls, code: ErrorCode) -> ApiErrorInfo:
        """One spelling of the field, so a model body and a hand-built one
        cannot disagree about `retryable`."""
        return cls.model_validate(error_object(code))


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
    error: ApiErrorInfo = Field(
        description="The machine-readable half of the same failure."
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
    error: ApiErrorInfo = Field(
        description="The machine-readable half of the same refusal."
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
    total_matched: int = Field(
        description=(
            "How many of those candidates satisfied the request's forecast "
            "bounds, before `limit` cut the list. Equal to `total_queried` "
            "when no bound was set, so a client can always say \"N of M "
            "matching\" without knowing whether the caller filtered. It is a "
            "separate number because a bound drops rows the caller paid to "
            "fetch, and `total_queried` keeps meaning what it always has: how "
            "much was analyzed."
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
            "destinations for a given window, and sent in both shapes: under "
            "`include_series: false` it is the only statement of which hours "
            "the aggregates reduced."
        ),
    )
    snow_analysis_date: str | None = Field(
        default=None, description=_SNOW_DATE_DESCRIPTION
    )
