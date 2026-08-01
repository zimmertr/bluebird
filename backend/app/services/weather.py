from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any

import httpx

from app import ratelimit
from app.models import DEFAULT_FORECAST_MODEL, MODEL_INFO, ForecastModel
from app.services import cache, http
from app.services.errors import (
    ModelCoverageError,
    UpstreamError,
    UpstreamRateLimited,
    classify_http_error,
    is_out_of_domain,
    parse_rate_limit,
    rate_limit_message,
)
from app.services.openmeteo_weight import call_weight

log = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
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
N_VARIABLES = 3  # precipitation, temperature_2m, wind_speed_10m
PROVIDER = "Open-Meteo (weather service)"

# Called as each batch completes: (processed_destinations, total_destinations,
# batches_done, total_batches). Lets the SSE route emit incremental progress.
ProgressCallback = Callable[[int, int, int, int], Awaitable[None]]

# Called when the weighted budget is about to pace us (estimated seconds).
# Lets the SSE route narrate the wait instead of appearing hung.
PaceCallback = Callable[[int], Awaitable[None]]


async def fetch_weather_batch(
    destinations: list[dict[str, Any]],
    start_dt: datetime,
    end_dt: datetime,
    on_progress: ProgressCallback | None = None,
    on_pace: PaceCallback | None = None,
    model: ForecastModel = DEFAULT_FORECAST_MODEL,
) -> list[dict[str, Any] | None]:
    if not destinations:
        return []

    total = len(destinations)

    # Serve repeats from the per-location cache first, then fetch only the
    # misses. A repeat Analyze on the same polygon and window costs zero
    # upstream calls; a partially-overlapping polygon pays only for what
    # actually changed.
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
            _fetch_chunk_indexed(i, chunk, start_dt, end_dt, sem, on_pace, model)
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
) -> tuple[int, list[dict[str, Any] | None]]:
    # Per-analysis fairness slot first, then the pod's weighted spend, then a
    # pod-wide in-flight slot. The weight acquire happens BEFORE the in-flight
    # slot so a pace sleep never holds a slot another analysis could be using.
    # Weight exhaustion (wedged, not busy) raises and fails the analysis with
    # a 503, unlike best-effort AQI.
    async with sem:
        weight = call_weight(
            len(destinations), start_dt.date(), end_dt.date(), N_VARIABLES
        )
        if on_pace is not None:
            estimate = ratelimit.WEATHER_WEIGHT.wait_estimate_s(weight)
            if estimate > 3:
                await on_pace(int(estimate) + 1)
        await ratelimit.WEATHER_WEIGHT.acquire(weight)
        async with ratelimit.WEATHER_BUDGET.slot():
            return index, await _fetch_chunk(destinations, start_dt, end_dt, model)


def _coverage_message(model: ForecastModel) -> str:
    """Why a regional model refused, and the one thing that fixes it."""
    return (
        f"{MODEL_INFO[model].label} does not cover part of this area. It is a "
        "regional model, run over the continental US and neighbouring parts of "
        "Canada and Mexico only. Choose a global forecast model, or move the "
        "search area inside its coverage."
    )


async def _fetch_chunk(
    destinations: list[dict[str, Any]],
    start_dt: datetime,
    end_dt: datetime,
    model: ForecastModel = DEFAULT_FORECAST_MODEL,
) -> list[dict[str, Any] | None]:
    lats = ",".join(str(d["latitude"]) for d in destinations)
    lons = ",".join(str(d["longitude"]) for d in destinations)

    log.info(
        "Open-Meteo batch: %d location(s), %s → %s, model %s",
        len(destinations),
        start_dt.date().isoformat(),
        end_dt.date().isoformat(),
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
        "hourly": "precipitation,temperature_2m,wind_speed_10m",
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "start_date": start_dt.date().isoformat(),
        "end_date": end_dt.date().isoformat(),
        "timezone": "UTC",
    }

    # One automatic resume for a minutely 429: that quota refills within the
    # minute, so a single paced retry usually completes the batch instead of
    # failing the whole analysis. Hourly/daily exhaustion raises immediately —
    # no wait we are willing to impose can help those.
    data: Any = None
    for attempt in (0, 1):
        try:
            log.trace("Open-Meteo request params: %s", params)  # type: ignore[attr-defined]
            resp = await http.client().get(FORECAST_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
            break
        except httpx.HTTPStatusError as exc:
            if is_out_of_domain(exc):
                # One location outside a regional model's grid 400s the whole
                # batch, so this says nothing about which of the 50 it was.
                # Naming them would take bisecting the batch — more upstream
                # spend to refine an answer the user acts on the same way.
                log.warning(
                    "Open-Meteo: %s does not cover part of this batch", model.value
                )
                raise ModelCoverageError(
                    model.value, _coverage_message(model)
                ) from exc
            if exc.response.status_code != 429:
                log.warning("Open-Meteo request failed: %s", exc)
                raise UpstreamError(classify_http_error(exc, PROVIDER)) from exc
            scope, retry_after = parse_rate_limit(exc)
            if scope == "minutely" and attempt == 0:
                log.warning(
                    "Open-Meteo minutely quota hit; resuming batch in %ds", retry_after
                )
                await asyncio.sleep(retry_after)
                continue
            log.warning("Open-Meteo rate limited (%s): %s", scope or "unknown", exc)
            raise UpstreamRateLimited(
                PROVIDER, scope, retry_after, rate_limit_message(PROVIDER, scope)
            ) from exc
        except httpx.HTTPError as exc:
            log.warning("Open-Meteo request failed: %s", exc)
            raise UpstreamError(classify_http_error(exc, PROVIDER)) from exc

    # Single location → object; multiple → array
    items = data if isinstance(data, list) else [data]
    results: list[dict[str, Any] | None] = []
    for item in items:
        m = _metrics(item, start_dt, end_dt)
        if m is not None:
            # Carry the raw hourly series alongside the aggregates so the route
            # can bake it into the response for the chart — one upstream fetch,
            # no re-query. The aggregates in `_metrics` stay byte-for-byte.
            m = {**m, "series": _series(item, start_dt, end_dt)}
        results.append(m)
    log.trace("Open-Meteo batch returned %d result(s)", sum(1 for r in results if r is not None))  # type: ignore[attr-defined]
    return results


def _metrics(
    data: dict[str, Any],
    start_dt: datetime,
    end_dt: datetime,
) -> dict[str, Any] | None:
    try:
        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        precip = hourly.get("precipitation", [])
        temp = hourly.get("temperature_2m", [])
        wind = hourly.get("wind_speed_10m", [])

        start = _naive(start_dt)
        end = _naive(end_dt)

        filtered = [
            (p, t, w)
            for ts, p, t, w in zip(times, precip, temp, wind)
            if _parse_ts(ts) is not None and start <= _parse_ts(ts) <= end  # type: ignore[operator]
            and p is not None
            and t is not None
            and w is not None
        ]

        if not filtered:
            return None

        p_vals, t_vals, w_vals = zip(*filtered)

        return {
            "precip_total_in": round(sum(p_vals), 4),
            "precip_avg_in_hr": round(sum(p_vals) / len(p_vals), 4),
            "precip_max_in_hr": round(max(p_vals), 4),
            "temp_min_f": round(min(t_vals), 1),
            "temp_max_f": round(max(t_vals), 1),
            "temp_avg_f": round(sum(t_vals) / len(t_vals), 1),
            "wind_min_mph": round(min(w_vals), 1),
            "wind_max_mph": round(max(w_vals), 1),
            "wind_avg_mph": round(sum(w_vals) / len(w_vals), 1),
        }
    except Exception:  # noqa: BLE001 — malformed payload degrades to no metrics
        return None


def _series(
    data: dict[str, Any],
    start_dt: datetime,
    end_dt: datetime,
) -> dict[str, Any] | None:
    """Per-hour precip/temp/wind over the window, aligned to a shared grid.

    Unlike `_metrics` — which drops any hour missing a value and collapses the
    rest into aggregates — this keeps every in-window hour and preserves each
    metric's nulls independently (the chart renders them as line gaps). Returns
    None only when the window contains no hours at all.
    """
    try:
        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        precip = hourly.get("precipitation", [])
        temp = hourly.get("temperature_2m", [])
        wind = hourly.get("wind_speed_10m", [])

        start = _naive(start_dt)
        end = _naive(end_dt)

        grid: list[int] = []
        p_out: list[float | None] = []
        t_out: list[float | None] = []
        w_out: list[float | None] = []
        for i, ts in enumerate(times):
            parsed = _parse_ts(ts)
            if parsed is None or not (start <= parsed <= end):
                continue
            grid.append(_epoch_ms(parsed))
            p_out.append(_round_or_none(_at(precip, i), 4))
            t_out.append(_round_or_none(_at(temp, i), 1))
            w_out.append(_round_or_none(_at(wind, i), 1))

        if not grid:
            return None
        return {"times": grid, "precip_in": p_out, "temp_f": t_out, "wind_mph": w_out}
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
