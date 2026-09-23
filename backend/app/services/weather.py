from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, NamedTuple

import httpx

from app import ratelimit, telemetry
from app.models import DEFAULT_FORECAST_MODEL, MODEL_INFO, ForecastModel, WindowSource
from app.services import cache, http
from app.services.aggregation import (
    HOURLY_VARIABLES,
    PROVIDER,
    _join_hours,
    _weather_metrics,
    _weather_series,
)
from app.services.errors import (
    ModelCoverageError,
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
# Open-Meteo's factor is max(1, vars x models/10) and a request names one
# model, so 14 variables cost 1.4 weighted calls per location where 9 cost 1.
# The five level temperatures (#443) are what took it over the floor of 10;
# the five level winds and the freezing level before them rode inside it.
N_VARIABLES = 14


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

    def key(dest: dict[str, Any]) -> tuple:
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
    per location first, so `_weather_metrics` and `_weather_series` see the one
    series the report ranks rather than learning that some windows come in
    halves.
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
        m = _weather_metrics(item, start_dt, end_dt, elevation_ft)
        if m is not None:
            # Carry the raw hourly series alongside the aggregates so the route
            # can bake it into the response for the chart — one upstream fetch,
            # no re-query. The aggregates in `_weather_metrics` stay byte-for-byte.
            m = {**m, "series": _weather_series(item, start_dt, end_dt, elevation_ft)}
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
