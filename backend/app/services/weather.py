from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any, NamedTuple

import httpx

from app import ratelimit, telemetry
from app.models import DEFAULT_FORECAST_MODEL, MODEL_INFO, ForecastModel, WindowSource
from app.services import cache, http
from app.services.errors import (
    ModelCoverageError,
    UpstreamError,
    UpstreamRateLimited,
    is_out_of_domain,
)
from app.services.openmeteo_fetch import (
    PaceCallback,
    Pacing,
    ProgressCallback,
    StatusErrorHook,
    fetch_batched,
    request_openmeteo,
)
from app.services.openmeteo_weight import call_weight

log = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
# Where a keyed request goes (issue #317). Named directly rather than letting
# the free host redirect: it answers a request carrying `apikey` with a 303 to
# this URL, and a redirect the provider can retire is not a transport.
CUSTOMER_FORECAST_URL = "https://customer-api.open-meteo.com/v1/forecast"
# Where a window older than the forecast endpoint's retention goes (issue #123).
# A separate endpoint rather than a parameter, and `models.window_source` is the
# one thing that decides which of the two a window belongs to.
ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
CUSTOMER_ARCHIVE_URL = "https://customer-archive-api.open-meteo.com/v1/archive"
# The wind the table ranks on is wind at the destination's OWN elevation
# (issue #257). Open-Meteo's 10 m wind stands 10 m above the model's smoothed
# terrain, inside the friction layer — measured at Rainier 2026-08-21, the
# 600 hPa wind (~summit height) was 27.5 mph where the 10 m value read 10.8.
# So each hour also carries the free-air wind at five pressure levels, and
# `_wind_at_elevation` interpolates between the two levels bracketing the
# destination's elevation, floored at the 10 m value. The heights are the ISA
# standard atmosphere, fixed rather than fetched: real geopotential heights
# move a few percent with weather, and fetching them would double the
# variable count for a correction smaller than the model's own grid error.
# All eight models Bluebird Forecast offers answered all five levels (probed
# 2026-08-21). The ARCHIVE endpoint accepts all five and answers every hour
# null (measured 2026-09-12), which the null-level path below already handles by
# degrading to the 10 m wind — so both endpoints are asked for one variable list
# rather than each getting its own, and the aggregation stays the one the shared
# vectors pin.
_WIND_LEVELS: list[tuple[str, float]] = [
    ("wind_speed_925hPa", 762.0),
    ("wind_speed_850hPa", 1457.0),
    ("wind_speed_700hPa", 3012.0),
    ("wind_speed_600hPa", 4206.0),
    ("wind_speed_500hPa", 5574.0),
]
_FT_TO_M = 0.3048
# The temperature the table ranks on is the temperature at the destination's
# OWN elevation (issue #443), for the same reason the wind above is.
# `temperature_2m` stands 2 m above the model's smoothed terrain, which under a
# summit is a valley floor: at Dome Peak (8,921 ft) the GFS grid ground is
# 2,017 m, and Open-Meteo then lapses its own value down to its 90 m DEM. On a
# clear night that ground radiates and the 2 m air freezes while the summit
# stands in free air well above it — measured 2026-09-16 over Sep 18 to Sep 21,
# `temperature_2m` read a minimum of 25.7 °F where the free air at summit height
# stayed near 43 °F and the freezing level never fell below 12,073 ft.
#
# So each hour also carries the free-air temperature at the SAME five levels the
# wind uses, read against the same ISA heights. Five more variables take the
# request from 9 to 14, which is the weight factor from 1 to 1.4 — the cost the
# maintainer accepted in #443.
#
# There is NO floor here, and that is the one way this differs from the wind.
# A floor is right for wind because altitude can only add exposure; a summit can
# be genuinely colder OR warmer than the free air (an inversion is the ordinary
# winter case), so a floor either way would invent a reading.
#
# All eight models Bluebird Forecast offers answered all five levels (probed
# 2026-09-16). The ARCHIVE endpoint accepts all five and answers every hour null
# under the unit `undefined` (measured 2026-09-16), which the null-level path
# below already sends back to `temperature_2m` — so both endpoints are asked for
# one variable list, exactly as the wind levels are.
_TEMP_LEVELS: list[tuple[str, float]] = [
    ("temperature_925hPa", 762.0),
    ("temperature_850hPa", 1457.0),
    ("temperature_700hPa", 3012.0),
    ("temperature_600hPa", 4206.0),
    ("temperature_500hPa", 5574.0),
]
# The height where the free-air temperature crosses freezing (issue #295).
# Spring and winter travel turns on the overnight refreeze, and a destination's
# own temperature answers that only at its own elevation — the freezing level
# says where the supportable snow starts on the way up.
#
# Open-Meteo quotes the height in whatever unit `precipitation_unit` selects,
# and names that unit in `hourly_units`: with `precipitation_unit=inch` (which
# every request below sends) the column is FEET, and without the parameter it
# is meters. Measured 2026-09-13 at Rainier, one hour reads 2560 with "m" and
# 8398.95 with "ft". So the unit is read off each response rather than assumed:
# the factor between them is 3.28, and a freezing level 3.28 times too high is
# a plausible-looking altitude rather than an obvious fault.
#
# It clamps to 0.0 when the whole column is below freezing, so a zero means
# "froze to sea level" rather than "no answer". Measured 2026-09-12, three of
# the eight models serve it (gfs_seamless, gfs_hrrr, icon_seamless); the other
# five answer HTTP 200 with a column of nulls. That is why its aggregates are
# nullable on their own and are never reduced inside the precip/temp/wind zip
# below.
_FREEZING_LEVEL = "freezing_level_height"
HOURLY_VARIABLES = ",".join(
    ["precipitation", "temperature_2m", "wind_speed_10m", _FREEZING_LEVEL]
    + [name for name, _ in _WIND_LEVELS]
    + [name for name, _ in _TEMP_LEVELS]
)
# Open-Meteo's factor is max(1, vars x models/10) and a request names one
# model, so 14 variables cost 1.4 weighted calls per location where 9 cost 1.
# The five level temperatures (#443) are what took it over the floor of 10;
# the five level winds and the freezing level before them rode inside it.
N_VARIABLES = 14
PROVIDER = "Open-Meteo"


def hour_param(dt: datetime) -> str:
    """One end of the window in the `start_hour`/`end_hour` shape (issue #212).

    Asking for hours instead of whole days is what keeps a narrow window from
    fetching the calendar days around it and discarding the overhang: measured
    2026-08-23 over 50 locations, a point sample fell from 97.3 KB to 32.8 KB
    and a six-hour window to 46.9 KB. Both hosts accept the form and the
    accepted range is the same as the date form's, so nothing new can 400.

    Flooring cannot drop an hour the aggregation would have kept. Every stamp
    it keeps sits on the hour inside `start <= ts <= end`, so it also sits
    inside the floored bounds; at most one extra hour arrives at the head and
    the same inclusive filter drops it. The wall clock is read as UTC without
    converting, exactly as `_naive` reads it, so a caller sending an offset
    gets the behavior it already had rather than a second interpretation.
    """
    return dt.strftime("%Y-%m-%dT%H:00")


class _Span(NamedTuple):
    """One leg of a fetch: which endpoint answers, and the hours it answers for."""

    archive: bool
    start: datetime
    end: datetime


def _fetch_spans(
    source: WindowSource,
    start_dt: datetime,
    end_dt: datetime,
    boundary: datetime | None,
) -> list[_Span]:
    """The one or two requests a window takes, as hour ranges.

    A forecast or archive window is one request. A window spanning the archive
    boundary is two, and this is the only place that split is computed, so the
    weighted spend and the requests themselves can never describe different
    halves.

    The halves are disjoint: the archive answers through the hour BEFORE the
    boundary and the forecast endpoint from the boundary on, because both bounds
    are inclusive and an hour arriving twice would be counted twice in a total.

    Either half can come out empty, and that is not a contradiction of the
    classification. `window_source` compares real instants while a request
    carries wall-clock hours read as UTC (see `hour_param`), so a caller sending
    an offset can be spanning by instant and one-sided by wall clock. An empty
    half is dropped rather than requested backwards.
    """
    if source != "spanning":
        return [_Span(source == "archive", start_dt, end_dt)]
    if boundary is None:
        raise ValueError("a spanning window needs the boundary that classified it")
    seam = boundary.replace(tzinfo=start_dt.tzinfo)
    if seam <= start_dt:
        return [_Span(False, start_dt, end_dt)]
    if seam > end_dt:
        return [_Span(True, start_dt, end_dt)]
    return [
        _Span(True, start_dt, seam - timedelta(hours=1)),
        _Span(False, seam, end_dt),
    ]


_JOIN_KEYS: tuple[str, ...] = ("time", *HOURLY_VARIABLES.split(","))


# What the archive endpoint writes in `hourly_units` for a variable it does not
# serve. The column beside it is all nulls, so the unit carries no information.
_UNIT_UNSERVED = "undefined"


def _units_agree(declared: Sequence[dict[str, Any]]) -> bool:
    """True when no variable is declared in two different real units."""
    keys = set().union(*(d.keys() for d in declared))
    for key in keys:
        seen = {d[key] for d in declared if key in d and d[key] != _UNIT_UNSERVED}
        if len(seen) > 1:
            return False
    return True


def _join_units(declared: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """The joined payload's `hourly_units`: each variable's served unit.

    The halves agree wherever both serve a variable (`_units_agree`), so the
    only choice is between a real unit and the archive's "undefined", and the
    real one wins: the freezing level's reader converts by the declared unit,
    and a joined window that kept the archive's "undefined" over the forecast
    half's "ft" would refuse the very numbers it carries.
    """
    joined: dict[str, Any] = {}
    for units in declared:
        for key, unit in units.items():
            if joined.get(key, _UNIT_UNSERVED) == _UNIT_UNSERVED:
                joined[key] = unit
    return joined


def _join_hours(parts: Sequence[dict[str, Any]]) -> dict[str, Any]:
    """One location's half-windows as a single hourly payload.

    The aggregation is pinned byte-for-byte against the browser port by the
    shared vectors, so a spanning window is made to look like every other window
    BEFORE it reaches `_metrics`: the halves are concatenated in time order (the
    spans are disjoint and ordered, so appending them IS time order) and each
    array is padded to the stamp count, which keeps them parallel for the
    index-addressed reads below.

    Two payloads are dropped rather than mixed. Disagreeing `hourly_units` means
    one host answered in units the other did not, and a total of inches and
    millimetres is a number with no meaning; a repeated stamp would count one
    hour twice. Both degrade to no metrics, which is what every payload this
    module cannot read does.

    A unit is compared only where both hosts declare one. The archive serves no
    pressure-level winds and answers their unit as the literal string
    "undefined" beside a column of nulls (measured 2026-09-13), where the
    forecast endpoint says "mp/h"; that is a column one side does not have, not
    a disagreement about what a number means.
    """
    if len(parts) == 1:
        return parts[0]
    declared = [part.get("hourly_units") or {} for part in parts]
    if not _units_agree(declared):
        return {}
    joined: dict[str, list[Any]] = {key: [] for key in _JOIN_KEYS}
    seen: set[Any] = set()
    for part in parts:
        hourly = part.get("hourly") or {}
        for i, ts in enumerate(hourly.get("time") or []):
            if ts in seen:
                continue
            seen.add(ts)
            joined["time"].append(ts)
            for key in _JOIN_KEYS[1:]:
                joined[key].append(_at(hourly.get(key) or [], i))
    return {**parts[0], "hourly_units": _join_units(declared), "hourly": joined}


async def fetch_weather_batch(
    destinations: list[dict[str, Any]],
    start_dt: datetime,
    end_dt: datetime,
    on_progress: ProgressCallback | None = None,
    on_pace: PaceCallback | None = None,
    model: ForecastModel = DEFAULT_FORECAST_MODEL,
    api_key: str | None = None,
    source: WindowSource = "forecast",
    boundary: datetime | None = None,
) -> list[dict[str, Any] | None]:
    """Fetch each destination's windowed weather from the endpoint(s) `source` names.

    `source` and `boundary` are the CALLER's decision (`models.window_source` and
    `models.archive_boundary`), not this function's, because both come from one
    reading of the clock: the boundary moves, so a window classified here a second
    time could be split at an instant the classification never saw.

    A spanning window is two requests per batch, joined per location before the
    aggregation runs (`_fetch_spans`, `_join_hours`).

    Weight exhaustion (wedged, not merely busy) raises and fails the analysis
    with a 503, which is what `on_error="raise"` says: unlike best-effort AQI,
    a ranking with no weather in it is not a ranking.
    """
    if not destinations:
        return []

    spans = _fetch_spans(source, start_dt, end_dt, boundary)

    def key(dest: dict[str, Any]) -> str:
        # `api_key` is deliberately NOT part of the key. The two hosts answer
        # the same model the same way for the same location and window, so
        # keying on the key would split one cache into a copy per caller and buy
        # nothing except upstream spend.
        #
        # `source` IS part of it. The two endpoints answer the same question
        # from different data — the archive carries no pressure-level winds, so
        # its rows hold the 10 m wind where the forecast endpoint's hold wind at
        # elevation — and the boundary between them moves with the clock, so a
        # window can change sides while an entry is still live. Keying on it
        # means an entry is only ever read back for the endpoint that produced
        # it.
        return cache.forecast_key(
            "weather",
            dest["latitude"],
            dest["longitude"],
            start_dt.isoformat(),
            end_dt.isoformat(),
            model.value,
            dest.get("elevation_ft") or "",
            source,
        )

    def weights(chunk: list[dict[str, Any]]) -> list[float]:
        # One acquire per SPAN, each priced on its own hours: a spanning window
        # is two requests and two answers, so it spends twice, and pricing it on
        # the whole window would bill the archive's months for the forecast
        # half's days as well.
        #
        # The model count is spelled here rather than defaulted, because this
        # service is where `models=` is built: a request that ever names more
        # than one model returns a series per model and costs that multiple, so
        # the two must move together.
        return [
            call_weight(
                len(chunk),
                span.start.date(),
                span.end.date(),
                N_VARIABLES,
                n_models=1,
            )
            for span in spans
        ]

    return await fetch_batched(
        destinations,
        label="Open-Meteo weather",
        cache_key=key,
        fetch_chunk=lambda chunk: _fetch_chunk(
            chunk, start_dt, end_dt, spans, model, api_key
        ),
        slots=ratelimit.WEATHER_BUDGET,
        pacing=None
        if api_key is not None
        else Pacing(ratelimit.WEATHER_WEIGHT, weights, on_pace),
        on_error="raise",
        on_progress=on_progress,
    )


def _coverage_message(model: ForecastModel) -> str:
    """Why a regional model refused."""
    return (
        f"{MODEL_INFO[model].label} has no forecast coverage for this area."
        " Switch to a different model and try again."
    )


async def _fetch_chunk(
    destinations: list[dict[str, Any]],
    start_dt: datetime,
    end_dt: datetime,
    spans: list[_Span],
    model: ForecastModel = DEFAULT_FORECAST_MODEL,
    api_key: str | None = None,
) -> list[dict[str, Any] | None]:
    """One batch of locations, fetched over every span and aggregated once.

    A spanning window arrives here as two spans. Their hourly arrays are joined
    per location first, so `_metrics` and `_series` see the one series the report
    ranks rather than learning that some windows come in halves.
    """
    per_span = [
        _as_items(await _fetch_span(destinations, span, model, api_key))
        for span in spans
    ]

    results: list[dict[str, Any] | None] = []
    # zip truncates to the shortest, which is the tolerance this loop has always
    # had for a host returning fewer locations than were asked about.
    for dest, parts in zip(destinations, zip(*per_span, strict=False), strict=False):
        elevation_ft = dest.get("elevation_ft")
        item = _join_hours(parts)
        m = _metrics(item, start_dt, end_dt, elevation_ft)
        if m is not None:
            # Carry the raw hourly series alongside the aggregates so the route
            # can bake it into the response for the chart — one upstream fetch,
            # no re-query. The aggregates in `_metrics` stay byte-for-byte.
            m = {**m, "series": _series(item, start_dt, end_dt, elevation_ft)}
        results.append(m)
    log.trace("Open-Meteo batch returned %d result(s)", sum(1 for r in results if r is not None))  # type: ignore[attr-defined]
    return results


def _as_items(data: Any) -> list[dict[str, Any]]:
    """Open-Meteo's two response shapes as one: a single location answers an object."""
    return data if isinstance(data, list) else [data]


async def _fetch_span(
    destinations: list[dict[str, Any]],
    span: _Span,
    model: ForecastModel = DEFAULT_FORECAST_MODEL,
    api_key: str | None = None,
) -> Any:
    """One request: these locations, these hours, from the span's own endpoint."""
    lats = ",".join(str(d["latitude"]) for d in destinations)
    lons = ",".join(str(d["longitude"]) for d in destinations)
    archive = span.archive
    start_dt, end_dt = span.start, span.end

    log.info(
        "Open-Meteo batch: %d location(s), %s → %s, model %s",
        len(destinations),
        hour_param(start_dt),
        hour_param(end_dt),
        "archive blend" if archive else model.value,
    )

    params = {
        "latitude": lats,
        "longitude": lons,
        "hourly": HOURLY_VARIABLES,
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "start_hour": hour_param(start_dt),
        "end_hour": hour_param(end_dt),
        "timezone": "UTC",
    }
    if not archive:
        # On the forecast endpoint the model is always named, never omitted.
        # Sending no `models=` there takes Open-Meteo's `best_match` blend,
        # which picks per location and never reports what it picked — so two
        # adjacent peaks in one response could come from two different models
        # with nothing saying so.
        #
        # The archive is the one exception, and the reason it is safe is that it
        # is not that blend: the archive's default is a reanalysis (IFS HRES with
        # ERA5 and ERA5-Land), the same dataset at every location, so nothing
        # varies row to row. Forwarding the picker's model there would be worse
        # than useless — an unknown `models=` value is accepted with a 200 and
        # plausible data (measured 2026-09-12), so a wrong name would be silently
        # answered by something else. Never send one.
        params["models"] = model.value
    # The key rides as a query parameter because that is the only place
    # Open-Meteo reads it, and only the paid host accepts it at all.
    url = ARCHIVE_URL if archive else FORECAST_URL
    if api_key is not None:
        url = CUSTOMER_ARCHIVE_URL if archive else CUSTOMER_FORECAST_URL
        params["apikey"] = api_key

    guard = _coverage_guard(model)

    async def attempt() -> Any:
        return await request_openmeteo(
            http.client(),
            url,
            params,
            service="weather",
            provider=PROVIDER,
            api_key=api_key,
            on_error="raise",
            on_status_error=guard,
        )

    try:
        return await attempt()
    except UpstreamRateLimited as exc:
        # One automatic resume for a minutely 429: that quota refills within the
        # minute, so a single paced retry usually completes the batch instead of
        # failing the whole analysis. Hourly/daily exhaustion raises immediately
        # — no wait we are willing to impose can help those.
        if exc.scope != "minutely":
            raise
        log.warning(
            "Open-Meteo minutely quota hit; resuming batch in %ds", exc.retry_after_s
        )
        await asyncio.sleep(exc.retry_after_s)
    # The one resume. A second 429 on the same batch is real exhaustion and
    # raises from here, minutely or not.
    return await attempt()


def _coverage_guard(model: ForecastModel) -> StatusErrorHook:
    """Recognise the 400 that means this model's grid does not reach the batch.

    Handed to the shared request helper rather than decided there, because only
    this service knows which model it asked for, and air quality has no such
    refusal to read (CAMS is global). One location outside a regional model's
    grid 400s the whole batch, so the refusal says nothing about which of the 50
    it was; naming them would take bisecting the batch — more upstream spend to
    refine an answer the user acts on the same way.
    """

    def guard(exc: httpx.HTTPStatusError, quota: str) -> None:
        if not is_out_of_domain(exc):
            return
        telemetry.OPENMETEO_REQUESTS.labels(
            service="weather", outcome="no_coverage", quota=quota
        ).inc()
        log.warning("Open-Meteo: %s does not cover part of this batch", model.value)
        raise ModelCoverageError(model.value, _coverage_message(model)) from exc

    return guard


def _wind_at_elevation(
    w10: float,
    elevation_ft: float | None,
    levels: list[float | None],
) -> float:
    """One hour's wind at the destination's own elevation, in mph.

    Linear interpolation between the two ISA-height levels bracketing the
    elevation, clamped to the top level above it, floored at the 10 m value —
    free air can only add exposure, never shelter. Every gap degrades to the
    10 m wind: no elevation, an elevation under the lowest level (a valley
    destination IS sheltered, and the 10 m wind is the right answer there),
    or a null at a needed level. `max` here and `Math.max` in the port agree
    bit-for-bit on finite doubles, and every input here is finite.
    """
    if elevation_ft is None:
        return w10
    elev_m = elevation_ft * _FT_TO_M
    if elev_m <= _WIND_LEVELS[0][1]:
        return w10
    free: float | None = None
    if elev_m >= _WIND_LEVELS[-1][1]:
        free = levels[-1]
    else:
        for k in range(len(_WIND_LEVELS) - 1):
            hi_h = _WIND_LEVELS[k + 1][1]
            if elev_m < hi_h:
                lo_h = _WIND_LEVELS[k][1]
                lo_v = levels[k]
                hi_v = levels[k + 1]
                if lo_v is not None and hi_v is not None:
                    free = lo_v + (hi_v - lo_v) * ((elev_m - lo_h) / (hi_h - lo_h))
                break
    if free is None:
        return w10
    return max(w10, free)


def _temp_at_elevation(
    t2m: float,
    elevation_ft: float | None,
    levels: list[float | None],
) -> float:
    """One hour's temperature at the destination's own elevation, in °F.

    Linear interpolation between the two ISA-height levels bracketing the
    elevation, clamped to the top level above it. Every gap degrades to
    `temperature_2m`: no elevation, an elevation under the lowest level (a
    valley destination IS its own surface layer), a null at a needed level, or
    an archive window, where the levels are accepted and answered null.

    Deliberately NOT floored, which is the one way this differs from
    `_wind_at_elevation`. Wind can only gain with exposure, so `max` there is a
    physical statement; a summit can be colder than the free air on a calm
    clear night and warmer than it under an inversion, so a floor in either
    direction would report a number no model produced.
    """
    if elevation_ft is None:
        return t2m
    elev_m = elevation_ft * _FT_TO_M
    if elev_m <= _TEMP_LEVELS[0][1]:
        return t2m
    free: float | None = None
    if elev_m >= _TEMP_LEVELS[-1][1]:
        free = levels[-1]
    else:
        for k in range(len(_TEMP_LEVELS) - 1):
            hi_h = _TEMP_LEVELS[k + 1][1]
            if elev_m < hi_h:
                lo_h = _TEMP_LEVELS[k][1]
                lo_v = levels[k]
                hi_v = levels[k + 1]
                if lo_v is not None and hi_v is not None:
                    free = lo_v + (hi_v - lo_v) * ((elev_m - lo_h) / (hi_h - lo_h))
                break
    if free is None:
        return t2m
    return free


def _level_arrays(hourly: dict[str, Any]) -> list[list[Any]]:
    return [hourly.get(name, []) for name, _ in _WIND_LEVELS]


def _temp_level_arrays(hourly: dict[str, Any]) -> list[list[Any]]:
    return [hourly.get(name, []) for name, _ in _TEMP_LEVELS]


def _freeze_unit(data: dict[str, Any]) -> str | None:
    """The unit the response declared for the freezing level, or None.

    None covers both a response with no `hourly_units` at all and one that
    names no unit for this variable; `_freeze_to_ft` decides what that means,
    because a column of nulls needs no unit and a column of numbers does.
    """
    units = data.get("hourly_units")
    unit = units.get(_FREEZING_LEVEL) if isinstance(units, dict) else None
    return unit if isinstance(unit, str) else None


def _freeze_to_ft(v: float, unit: str | None) -> float:
    """One freezing level reading in feet, per the unit the response declared.

    A unit that is neither documented one leaves the number unreadable, and
    assuming either would ship a reading 3.28 times out, so an unknown or
    missing unit fails the batch the way any unusable body does.
    """
    if unit == "ft":
        return v
    if unit == "m":
        return v / _FT_TO_M
    log.warning("Open-Meteo declared freezing level unit %r", unit)
    # The wording `classify_http_error` gives any other unusable Open-Meteo
    # response, so one provider fault is not described two ways.
    raise UpstreamError(f"{PROVIDER} request failed. Try again later.")


def _freeze_ft_in_window(
    hourly: dict[str, Any],
    start: datetime,
    end: datetime,
    unit: str | None,
) -> list[float]:
    """Every in-window hour that HAS a freezing level, in feet.

    Read against its own pair of arrays rather than inside `_metrics`'s zip,
    which is the whole of how a model that does not serve the variable stays
    harmless: an hour dropped for a null freezing level would take the
    precipitation, temperature and wind of that same hour with it, so five of
    the eight models would return no weather at all. The null skip and the
    zip-of-shortest are the AQI aggregation's, for the same reason.
    """
    return [
        _freeze_to_ft(v, unit)
        for ts, v in zip(hourly.get("time", []), hourly.get(_FREEZING_LEVEL, []), strict=False)
        if v is not None
        and (parsed := _parse_ts(ts)) is not None
        and start <= parsed <= end
    ]


def _metrics(
    data: dict[str, Any],
    start_dt: datetime,
    end_dt: datetime,
    elevation_ft: float | None = None,
) -> dict[str, Any] | None:
    try:
        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        precip = hourly.get("precipitation", [])
        temp = hourly.get("temperature_2m", [])
        wind = hourly.get("wind_speed_10m", [])
        levels = _level_arrays(hourly)
        t_levels = _temp_level_arrays(hourly)

        start = _naive(start_dt)
        end = _naive(end_dt)

        # zip over the four core arrays keeps the pre-#257 hour-dropping
        # semantics: a missing or short LEVEL array can never drop an hour,
        # only send its wind back to the 10 m value and its temperature back
        # to the 2 m value.
        filtered = []
        for i, (ts, p, t, w) in enumerate(zip(times, precip, temp, wind, strict=False)):
            parsed = _parse_ts(ts)
            if parsed is None or not (start <= parsed <= end):
                continue
            if p is None or t is None or w is None:
                continue
            w_adj = _wind_at_elevation(
                w, elevation_ft, [_at(arr, i) for arr in levels]
            )
            t_adj = _temp_at_elevation(
                t, elevation_ft, [_at(arr, i) for arr in t_levels]
            )
            filtered.append((p, t_adj, w_adj))

        if not filtered:
            return None

        p_vals, t_vals, w_vals = zip(*filtered, strict=False)
        f_vals = _freeze_ft_in_window(hourly, start, end, _freeze_unit(data))

        return {
            "precip_total_in": round(sum(p_vals), 4),
            "precip_avg_in_hr": round(sum(p_vals) / len(p_vals), 4),
            # Near-zero for any window with one dry hour, and kept anyway: every
            # aggregate column is rankable (#291), so the set stays complete.
            "precip_min_in_hr": round(min(p_vals), 4),
            "precip_max_in_hr": round(max(p_vals), 4),
            "temp_min_f": round(min(t_vals), 1),
            "temp_max_f": round(max(t_vals), 1),
            "temp_avg_f": round(sum(t_vals) / len(t_vals), 1),
            "wind_min_mph": round(min(w_vals), 1),
            "wind_max_mph": round(max(w_vals), 1),
            "wind_avg_mph": round(sum(w_vals) / len(w_vals), 1),
            # Whole feet: the models resolve this to hundreds of meters, so a
            # decimal would be precision the number does not carry.
            "freeze_min_ft": round(min(f_vals), 0) if f_vals else None,
            "freeze_max_ft": round(max(f_vals), 0) if f_vals else None,
            "freeze_avg_ft": round(sum(f_vals) / len(f_vals), 0) if f_vals else None,
        }
    except UpstreamError:
        # A unit nothing can read is not one bad hour to skip past: every
        # number in the column would have to be invented, so it passes the
        # degrade below and fails the analysis.
        raise
    except Exception:  # noqa: BLE001 — malformed payload degrades to no metrics
        return None


def _series(
    data: dict[str, Any],
    start_dt: datetime,
    end_dt: datetime,
    elevation_ft: float | None = None,
) -> dict[str, Any] | None:
    """Per-hour precip/temp/wind/freezing level over the window, on one grid.

    Unlike `_metrics` — which drops any hour missing a value and collapses the
    rest into aggregates — this keeps every in-window hour and preserves each
    metric's nulls independently (the chart renders them as line gaps). Returns
    None when the window contains no hours at all, or when the payload is
    malformed — an unreadable freezing level unit is the one exception, and it
    raises. Wind and temperature are adjusted to the destination's elevation
    exactly as `_metrics` adjusts them, so the chart and the playback
    recoloring draw the same quantities the table ranks.
    """
    try:
        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        precip = hourly.get("precipitation", [])
        temp = hourly.get("temperature_2m", [])
        wind = hourly.get("wind_speed_10m", [])
        freeze = hourly.get(_FREEZING_LEVEL, [])
        freeze_unit = _freeze_unit(data)
        levels = _level_arrays(hourly)
        t_levels = _temp_level_arrays(hourly)

        start = _naive(start_dt)
        end = _naive(end_dt)

        grid: list[int] = []
        p_out: list[float | None] = []
        t_out: list[float | None] = []
        w_out: list[float | None] = []
        f_out: list[float | None] = []
        for i, ts in enumerate(times):
            parsed = _parse_ts(ts)
            if parsed is None or not (start <= parsed <= end):
                continue
            grid.append(_epoch_ms(parsed))
            p_out.append(_round_or_none(_at(precip, i), 4))
            t2m = _at(temp, i)
            t_adj = (
                None
                if t2m is None
                else _temp_at_elevation(
                    t2m, elevation_ft, [_at(arr, i) for arr in t_levels]
                )
            )
            t_out.append(_round_or_none(t_adj, 1))
            w10 = _at(wind, i)
            w_adj = (
                None
                if w10 is None
                else _wind_at_elevation(
                    w10, elevation_ft, [_at(arr, i) for arr in levels]
                )
            )
            w_out.append(_round_or_none(w_adj, 1))
            f_raw = _at(freeze, i)
            f_out.append(
                _round_or_none(
                    None if f_raw is None else _freeze_to_ft(f_raw, freeze_unit), 0
                )
            )

        if not grid:
            return None
        return {
            "times": grid,
            "precip_in": p_out,
            "temp_f": t_out,
            "wind_mph": w_out,
            "freeze_ft": f_out,
        }
    except UpstreamError:
        # The one failure this function does not absorb, for the reason
        # `_metrics` does not absorb it either: an unreadable unit is a number
        # we would have to invent, not an hour we can leave blank.
        raise
    except Exception:  # noqa: BLE001 — best-effort series degrades to None, never fails the analysis
        return None


def _parse_ts(s: str) -> datetime | None:
    try:
        return datetime.fromisoformat(s).replace(tzinfo=None)
    except Exception:  # noqa: BLE001 — unparseable timestamp degrades to None
        return None


def _naive(dt: datetime) -> datetime:
    return dt.replace(tzinfo=None)


def _epoch_ms(dt_naive: datetime) -> int:
    # Open-Meteo times are UTC (we request timezone=UTC) and `_parse_ts` strips
    # the tzinfo, so re-stamp UTC before converting to an unambiguous epoch the
    # browser can render in the viewer's local zone.
    return int(dt_naive.replace(tzinfo=UTC).timestamp() * 1000)


def _at(arr: list[Any], i: int) -> float | None:
    return arr[i] if i < len(arr) else None


def _round_or_none(v: float | None, ndigits: int) -> float | None:
    return round(v, ndigits) if v is not None else None
