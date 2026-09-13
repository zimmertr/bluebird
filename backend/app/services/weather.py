from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

import httpx

from app import ratelimit, telemetry
from app.models import DEFAULT_FORECAST_MODEL, MODEL_INFO, ForecastModel
from app.services import cache, http
from app.services.errors import (
    InvalidApiKeyError,
    ModelCoverageError,
    UpstreamError,
    UpstreamRateLimited,
    classify_http_error,
    is_invalid_api_key,
    is_out_of_domain,
    parse_rate_limit,
    rate_limit_message,
)
from app.services.openmeteo_weight import call_weight

log = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
# Where a keyed request goes (issue #317). Named directly rather than letting
# the free host redirect: it answers a request carrying `apikey` with a 303 to
# this URL, and a redirect the provider can retire is not a transport.
CUSTOMER_FORECAST_URL = "https://customer-api.open-meteo.com/v1/forecast"
# Measured 2026-07-31 (issue #182), not guessed. Upstream accepts far more than
# 50 per request, but raising this buys nothing and costs headroom:
#   - Weight is per LOCATION, so the pacer caps locations/min identically at any
#     batch size. A 1,500-destination analysis is budget-bound at ~3 min either
#     way; only the request count changes.
#   - Open-Meteo's nginx returns 414 above an 8,192-byte request URI. At 29
#     bytes per location (7-decimal coordinates, the precision OSM hands back)
#     250 locations already spends 7,485 of it, and `custom_destinations`
#     coordinates are never rounded, so a caller's float repr can spend more.
#   - A failed batch loses everything in it, and a big one has no sibling to
#     hide its tail latency behind.
# Re-measure if the URI cap moves or the pacer stops being the binding
# constraint; switching these calls to POST would lift the 414 ceiling.
BATCH_SIZE = 50
# In-flight fairness cap per analysis, so one giant polygon doesn't hog every
# slot. Rate protection is NOT this number's job: ratelimit.WEATHER_WEIGHT
# paces the pod's spend in weighted calls per minute, the unit Open-Meteo
# actually meters (see services.openmeteo_weight).
MAX_CONCURRENT_BATCHES = 4
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
# 2026-08-21).
_WIND_LEVELS: list[tuple[str, float]] = [
    ("wind_speed_925hPa", 762.0),
    ("wind_speed_850hPa", 1457.0),
    ("wind_speed_700hPa", 3012.0),
    ("wind_speed_600hPa", 4206.0),
    ("wind_speed_500hPa", 5574.0),
]
_FT_TO_M = 0.3048
# The height where the free-air temperature crosses freezing (issue #295).
# Spring and winter travel turns on the overnight refreeze, and a destination's
# own temperature answers that only at its own elevation — the freezing level
# says where the supportable snow starts on the way up.
#
# Open-Meteo answers in METERS above sea level, and clamps to 0.0 when the
# whole column is below freezing, so a zero means "froze to sea level" rather
# than "no answer". Measured 2026-09-12, three of the eight models serve it
# (gfs_seamless, gfs_hrrr, icon_seamless); the other five answer HTTP 200 with
# a column of nulls. That is why its aggregates are nullable on their own and
# are never reduced inside the precip/temp/wind zip below.
_FREEZING_LEVEL = "freezing_level_height"
HOURLY_VARIABLES = ",".join(
    ["precipitation", "temperature_2m", "wind_speed_10m", _FREEZING_LEVEL]
    + [name for name, _ in _WIND_LEVELS]
)
# 9 stays at weight factor 1: Open-Meteo's factor is max(1, vars x models/10)
# and a request names one model, so the five level winds and the freezing
# level ride the same weighted budget the three originals did.
N_VARIABLES = 9
PROVIDER = "Open-Meteo"

# Called as each batch completes: (processed_destinations, total_destinations,
# batches_done, total_batches). Lets the SSE route emit incremental progress.
ProgressCallback = Callable[[int, int, int, int], Awaitable[None]]

# Called when the weighted budget is about to pace us (estimated seconds).
# Lets the SSE route narrate the wait instead of appearing hung.
PaceCallback = Callable[[int], Awaitable[None]]

# What stands in for a caller's key wherever text could persist. The pod
# forwards a paid credential and must forget it, so a log line is the one
# place it could survive the request.
_REDACTED = "[redacted]"


def redacted_params(params: dict[str, Any]) -> dict[str, Any]:
    """`params` with any caller API key replaced, for logging.

    Both Open-Meteo services log their full request params at TRACE, which is
    exactly where a forwarded key would come to rest. Nothing logs `params`
    directly.
    """
    if "apikey" not in params:
        return params
    return {**params, "apikey": _REDACTED}


def redacted_error(exc: Exception, api_key: str | None) -> str:
    """An upstream exception's text with the caller's key removed.

    `raise_for_status` builds its message out of the request URL, and a keyed
    request carries the key in that URL's query string, so interpolating the
    exception straight into a log line would persist the credential that
    `redacted_params` was careful not to.
    """
    text = str(exc)
    return text.replace(api_key, _REDACTED) if api_key else text


def quota_label(api_key: str | None) -> str:
    """Whose Open-Meteo quota a batch spends: the caller's key, or this pod's.

    A metric label, so it names the owner and never the key.
    """
    return "caller" if api_key else "pod"


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


async def fetch_weather_batch(
    destinations: list[dict[str, Any]],
    start_dt: datetime,
    end_dt: datetime,
    on_progress: ProgressCallback | None = None,
    on_pace: PaceCallback | None = None,
    model: ForecastModel = DEFAULT_FORECAST_MODEL,
    api_key: str | None = None,
) -> list[dict[str, Any] | None]:
    if not destinations:
        return []

    total = len(destinations)

    # Serve repeats from the per-location cache first, then fetch only the
    # misses. A repeat Analyze on the same polygon and window costs zero
    # upstream calls; a partially-overlapping polygon pays only for what
    # actually changed.
    #
    # `api_key` is deliberately NOT part of the key. The two hosts answer the
    # same model the same way for the same location and window, so keying on
    # the key would split one cache into a copy per caller and buy nothing
    # except upstream spend.
    results: list[dict[str, Any] | None] = [None] * total
    miss_indices: list[int] = []
    for i, dest in enumerate(destinations):
        key = cache.forecast_key(
            "weather",
            dest["latitude"],
            dest["longitude"],
            start_dt.isoformat(),
            end_dt.isoformat(),
            model.value,
            dest.get("elevation_ft") or "",
        )
        hit = cache.FORECAST_CACHE.get(key)
        if hit is None:
            miss_indices.append(i)
        else:
            results[i] = None if hit == cache.NO_DATA else hit

    misses = [destinations[i] for i in miss_indices]
    chunks = [misses[i : i + BATCH_SIZE] for i in range(0, len(misses), BATCH_SIZE)]
    total_batches = len(chunks)
    cached_count = total - len(misses)

    log.info(
        "Fetching Open-Meteo weather: %d destination(s), %d cached, %d across %d batch(es)",
        total,
        cached_count,
        len(misses),
        total_batches,
    )

    processed = cached_count
    if on_progress is not None and cached_count:
        await on_progress(processed, total, 0, total_batches)
    if not misses:
        return results

    # Preserve input ordering by placing each batch's results at its own index,
    # while still reporting progress in completion order via as_completed.
    chunk_results_by_index: list[list[dict[str, Any] | None]] = [[] for _ in chunks]
    batches_done = 0

    sem = asyncio.Semaphore(MAX_CONCURRENT_BATCHES)
    tasks = [
        asyncio.create_task(
            _fetch_chunk_indexed(
                i, chunk, start_dt, end_dt, sem, on_pace, model, api_key
            )
        )
        for i, chunk in enumerate(chunks)
    ]

    try:
        for future in asyncio.as_completed(tasks):
            index, chunk_results = await future
            chunk_results_by_index[index] = chunk_results
            processed += len(chunk_results)
            batches_done += 1
            if on_progress is not None:
                await on_progress(processed, total, batches_done, total_batches)
    except BaseException:
        # A batch failed (or the client disconnected) — don't leak the siblings.
        for task in tasks:
            task.cancel()
        raise

    fetched = [item for sublist in chunk_results_by_index for item in sublist]
    for dest, result in zip(misses, fetched):
        key = cache.forecast_key(
            "weather",
            dest["latitude"],
            dest["longitude"],
            start_dt.isoformat(),
            end_dt.isoformat(),
            model.value,
            dest.get("elevation_ft") or "",
        )
        cache.FORECAST_CACHE.put(key, cache.NO_DATA if result is None else result)
    for i, result in zip(miss_indices, fetched):
        results[i] = result
    return results


async def _fetch_chunk_indexed(
    index: int,
    destinations: list[dict[str, Any]],
    start_dt: datetime,
    end_dt: datetime,
    sem: asyncio.Semaphore,
    on_pace: PaceCallback | None = None,
    model: ForecastModel = DEFAULT_FORECAST_MODEL,
    api_key: str | None = None,
) -> tuple[int, list[dict[str, Any] | None]]:
    # Per-analysis fairness slot first, then the pod's weighted spend, then a
    # pod-wide in-flight slot. The weight acquire happens BEFORE the in-flight
    # slot so a pace sleep never holds a slot another analysis could be using.
    # Weight exhaustion (wedged, not busy) raises and fails the analysis with
    # a 503, unlike best-effort AQI.
    #
    # A keyed batch skips the weighted pacer, and only the pacer: that budget
    # meters THIS POD's free-tier quota, which a keyed batch never touches, so
    # pacing one would queue a caller behind spend it does not share. The
    # in-flight slot still applies, because it guards the pod's own
    # concurrency rather than anybody's quota.
    async with sem:
        if api_key is None:
            # The model count is spelled here rather than defaulted, because
            # this is where `models=` is built: a request that ever names
            # more than one model returns a series per model and costs that
            # multiple, so the two must move together.
            weight = call_weight(
                len(destinations),
                start_dt.date(),
                end_dt.date(),
                N_VARIABLES,
                n_models=1,
            )
            if on_pace is not None:
                estimate = ratelimit.WEATHER_WEIGHT.wait_estimate_s(weight)
                if estimate > 3:
                    await on_pace(int(estimate) + 1)
            await ratelimit.WEATHER_WEIGHT.acquire(weight)
        async with ratelimit.WEATHER_BUDGET.slot():
            return index, await _fetch_chunk(
                destinations, start_dt, end_dt, model, api_key
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
    model: ForecastModel = DEFAULT_FORECAST_MODEL,
    api_key: str | None = None,
) -> list[dict[str, Any] | None]:
    lats = ",".join(str(d["latitude"]) for d in destinations)
    lons = ",".join(str(d["longitude"]) for d in destinations)
    quota = quota_label(api_key)

    log.info(
        "Open-Meteo batch: %d location(s), %s → %s, model %s",
        len(destinations),
        hour_param(start_dt),
        hour_param(end_dt),
        model.value,
    )

    params = {
        "latitude": lats,
        "longitude": lons,
        # Always named, never omitted. Sending no `models=` takes Open-Meteo's
        # `best_match` blend, which picks per location and never reports what
        # it picked — so two adjacent peaks in one response could come from two
        # different models with nothing saying so.
        "models": model.value,
        "hourly": HOURLY_VARIABLES,
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "start_hour": hour_param(start_dt),
        "end_hour": hour_param(end_dt),
        "timezone": "UTC",
    }
    # The key rides as a query parameter because that is the only place
    # Open-Meteo reads it, and only the paid host accepts it at all.
    url = FORECAST_URL
    if api_key is not None:
        url = CUSTOMER_FORECAST_URL
        params["apikey"] = api_key

    # One automatic resume for a minutely 429: that quota refills within the
    # minute, so a single paced retry usually completes the batch instead of
    # failing the whole analysis. Hourly/daily exhaustion raises immediately —
    # no wait we are willing to impose can help those.
    data: Any = None
    for attempt in (0, 1):
        try:
            log.trace("Open-Meteo request params: %s", redacted_params(params))  # type: ignore[attr-defined]
            # One duration observation per HTTP attempt, failures included, so
            # the histogram and the outcome counter tally the same events.
            attempt_start = time.perf_counter()
            try:
                resp = await http.client().get(url, params=params)
            finally:
                telemetry.OPENMETEO_DURATION.labels(
                    service="weather", quota=quota
                ).observe(time.perf_counter() - attempt_start)
            resp.raise_for_status()
            telemetry.OPENMETEO_REQUESTS.labels(
                service="weather", outcome="success", quota=quota
            ).inc()
            data = resp.json()
            break
        except httpx.HTTPStatusError as exc:
            if is_invalid_api_key(exc):
                # The caller's credential, not our outage: raised so the route
                # can answer 401 instead of a 502 no retry would fix.
                telemetry.OPENMETEO_REQUESTS.labels(
                    service="weather", outcome="invalid_key", quota=quota
                ).inc()
                log.warning("Open-Meteo rejected the supplied API key")
                raise InvalidApiKeyError() from exc
            if is_out_of_domain(exc):
                # One location outside a regional model's grid 400s the whole
                # batch, so this says nothing about which of the 50 it was.
                # Naming them would take bisecting the batch — more upstream
                # spend to refine an answer the user acts on the same way.
                telemetry.OPENMETEO_REQUESTS.labels(
                    service="weather", outcome="no_coverage", quota=quota
                ).inc()
                log.warning(
                    "Open-Meteo: %s does not cover part of this batch", model.value
                )
                raise ModelCoverageError(
                    model.value, _coverage_message(model)
                ) from exc
            if exc.response.status_code != 429:
                telemetry.OPENMETEO_REQUESTS.labels(
                    service="weather", outcome="http_error", quota=quota
                ).inc()
                log.warning(
                    "Open-Meteo request failed: %s", redacted_error(exc, api_key)
                )
                raise UpstreamError(classify_http_error(exc, PROVIDER)) from exc
            scope, retry_after = parse_rate_limit(exc)
            telemetry.OPENMETEO_REQUESTS.labels(
                service="weather", outcome="rate_limited", quota=quota
            ).inc()
            telemetry.OPENMETEO_RATE_LIMITED.labels(
                service="weather", scope=scope or "unknown", quota=quota
            ).inc()
            if scope == "minutely" and attempt == 0:
                log.warning(
                    "Open-Meteo minutely quota hit; resuming batch in %ds", retry_after
                )
                await asyncio.sleep(retry_after)
                continue
            log.warning(
                "Open-Meteo rate limited (%s): %s",
                scope or "unknown",
                redacted_error(exc, api_key),
            )
            raise UpstreamRateLimited(
                PROVIDER, scope, retry_after, rate_limit_message(PROVIDER, scope)
            ) from exc
        except httpx.HTTPError as exc:
            telemetry.OPENMETEO_REQUESTS.labels(
                service="weather", outcome="network_error", quota=quota
            ).inc()
            log.warning("Open-Meteo request failed: %s", redacted_error(exc, api_key))
            raise UpstreamError(classify_http_error(exc, PROVIDER)) from exc

    # Single location → object; multiple → array
    items = data if isinstance(data, list) else [data]
    results: list[dict[str, Any] | None] = []
    for dest, item in zip(destinations, items):
        elevation_ft = dest.get("elevation_ft")
        m = _metrics(item, start_dt, end_dt, elevation_ft)
        if m is not None:
            # Carry the raw hourly series alongside the aggregates so the route
            # can bake it into the response for the chart — one upstream fetch,
            # no re-query. The aggregates in `_metrics` stay byte-for-byte.
            m = {**m, "series": _series(item, start_dt, end_dt, elevation_ft)}
        results.append(m)
    log.trace("Open-Meteo batch returned %d result(s)", sum(1 for r in results if r is not None))  # type: ignore[attr-defined]
    return results


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


def _level_arrays(hourly: dict[str, Any]) -> list[list[Any]]:
    return [hourly.get(name, []) for name, _ in _WIND_LEVELS]


def _freeze_ft_in_window(
    hourly: dict[str, Any],
    start: datetime,
    end: datetime,
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
        v / _FT_TO_M
        for ts, v in zip(hourly.get("time", []), hourly.get(_FREEZING_LEVEL, []))
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

        start = _naive(start_dt)
        end = _naive(end_dt)

        # zip over the four core arrays keeps the pre-#257 hour-dropping
        # semantics: a missing or short LEVEL array can never drop an hour,
        # only send its wind back to the 10 m value.
        filtered = []
        for i, (ts, p, t, w) in enumerate(zip(times, precip, temp, wind)):
            parsed = _parse_ts(ts)
            if parsed is None or not (start <= parsed <= end):
                continue
            if p is None or t is None or w is None:
                continue
            w_adj = _wind_at_elevation(
                w, elevation_ft, [_at(arr, i) for arr in levels]
            )
            filtered.append((p, t, w_adj))

        if not filtered:
            return None

        p_vals, t_vals, w_vals = zip(*filtered)
        f_vals = _freeze_ft_in_window(hourly, start, end)

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
    None only when the window contains no hours at all. Wind is adjusted to
    the destination's elevation exactly as `_metrics` adjusts it, so the chart
    and the playback recoloring draw the same quantity the table ranks.
    """
    try:
        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        precip = hourly.get("precipitation", [])
        temp = hourly.get("temperature_2m", [])
        wind = hourly.get("wind_speed_10m", [])
        freeze = hourly.get(_FREEZING_LEVEL, [])
        levels = _level_arrays(hourly)

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
            t_out.append(_round_or_none(_at(temp, i), 1))
            w10 = _at(wind, i)
            w_adj = (
                None
                if w10 is None
                else _wind_at_elevation(
                    w10, elevation_ft, [_at(arr, i) for arr in levels]
                )
            )
            w_out.append(_round_or_none(w_adj, 1))
            f_m = _at(freeze, i)
            f_out.append(_round_or_none(None if f_m is None else f_m / _FT_TO_M, 0))

        if not grid:
            return None
        return {
            "times": grid,
            "precip_in": p_out,
            "temp_f": t_out,
            "wind_mph": w_out,
            "freeze_ft": f_out,
        }
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
    return int(dt_naive.replace(tzinfo=timezone.utc).timestamp() * 1000)


def _at(arr: list[Any], i: int) -> float | None:
    return arr[i] if i < len(arr) else None


def _round_or_none(v: float | None, ndigits: int) -> float | None:
    return round(v, ndigits) if v is not None else None
