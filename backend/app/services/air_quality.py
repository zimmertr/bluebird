from __future__ import annotations

import asyncio
import logging
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx

from app import ratelimit, telemetry
from app.services import cache, http
from app.services.errors import (
    UpstreamRateLimited,
    parse_rate_limit,
    rate_limit_message,
)
from app.services.openmeteo_weight import call_weight

log = logging.getLogger(__name__)

AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
BATCH_SIZE = 50  # same as the weather service; see the reasoning on its constant
MAX_CONCURRENT_BATCHES = 4  # same in-flight gate as the weather service
N_VARIABLES = 1  # us_aqi
PROVIDER = "Open-Meteo (air quality)"

# The underlying CAMS model publishes ~5 days of forecast. The API accepts
# end_date a day or two past that, but the exact boundary tracks the model-run
# publish cycle (early in the UTC day it can be today+6, later today+7), so
# clamping to +5 stays safely inside it at any hour without losing real data —
# hours past ~5 days come back null anyway.
MAX_FORECAST_DAYS = 5


async def fetch_aqi_batch(
    destinations: list[dict[str, Any]],
    start_dt: datetime,
    end_dt: datetime,
) -> list[dict[str, Any] | None]:
    """Fetch US AQI stats (all EPA pollutants combined) (avg/max over the window) per destination.

    Best-effort by design: air quality is supplementary, so upstream failures
    degrade to None entries (rendered as "—") instead of failing the analysis
    the way a weather outage does.
    """
    if not destinations:
        return []

    # Clamp to the API's accepted date range; a window entirely beyond the
    # horizon skips the fetch instead of triggering a 400.
    end_cap = datetime.now(timezone.utc).date() + timedelta(days=MAX_FORECAST_DAYS)
    req_start = start_dt.date()
    req_end = min(end_dt.date(), end_cap)
    if req_start > req_end:
        log.info("AQI window starts beyond the ~%dd forecast horizon — skipping fetch", MAX_FORECAST_DAYS)
        return [None] * len(destinations)

    # Serve repeats from the per-location cache; fetch only the misses (same
    # pattern as the weather service, same incident rationale).
    results: list[dict[str, Any] | None] = [None] * len(destinations)
    miss_indices: list[int] = []
    for i, dest in enumerate(destinations):
        key = cache.forecast_key(
            "aqi",
            dest["latitude"],
            dest["longitude"],
            start_dt.isoformat(),
            end_dt.isoformat(),
        )
        hit = cache.FORECAST_CACHE.get(key)
        if hit is None:
            miss_indices.append(i)
        else:
            results[i] = None if hit == cache.NO_DATA else hit

    misses = [destinations[i] for i in miss_indices]
    if not misses:
        log.info(
            "Open-Meteo air quality: all %d destination(s) served from cache",
            len(destinations),
        )
        return results

    chunks = [misses[i : i + BATCH_SIZE] for i in range(0, len(misses), BATCH_SIZE)]
    log.info(
        "Fetching Open-Meteo air quality: %d destination(s), %d cached, %d across %d batch(es)",
        len(destinations),
        len(destinations) - len(misses),
        len(misses),
        len(chunks),
    )

    sem = asyncio.Semaphore(MAX_CONCURRENT_BATCHES)
    # Once one chunk sees a 429, the AQI quota is spent: every further batch
    # would burn budget (and the shared minute window) to learn the same
    # thing. The 2026-07-29 incident's "zombie" AQI batches did exactly that,
    # draining the next minute's budget mid-fallback — so the first rate
    # limit short-circuits the rest of this fetch to nulls.
    rate_limited = asyncio.Event()

    async def gated(chunk: list[dict[str, Any]]) -> list[dict[str, Any] | None]:
        # Per-analysis slot first, then the pod's weighted spend, then the
        # pod-wide in-flight slot. Budget exhaustion or a rate limit degrades
        # this chunk to None rows like any other AQI failure — air quality
        # never fails the analysis.
        async with sem:
            if rate_limited.is_set():
                return [None] * len(chunk)
            try:
                weight = call_weight(len(chunk), req_start, req_end, N_VARIABLES)
                await ratelimit.AQI_WEIGHT.acquire(weight)
                async with ratelimit.AQI_BUDGET.slot():
                    return await _fetch_chunk(chunk, req_start, req_end, start_dt, end_dt)
            except ratelimit.BudgetExhausted:
                telemetry.AQI_DEGRADED.labels(reason="budget").inc()
                log.warning("AQI budget exhausted (continuing without AQI)")
                return [None] * len(chunk)
            except UpstreamRateLimited as exc:
                telemetry.AQI_DEGRADED.labels(reason="rate_limited").inc()
                log.warning(
                    "AQI rate limited (%s); skipping remaining AQI batches",
                    exc.scope or "unknown",
                )
                rate_limited.set()
                return [None] * len(chunk)

    chunk_results = await asyncio.gather(*(gated(chunk) for chunk in chunks))
    fetched = [item for sublist in chunk_results for item in sublist]

    # A rate-limited or failed batch produced None rows that mean "unknown",
    # not "no data for this window" — caching those would freeze the outage
    # into the TTL. Only real answers are cached, and a real all-null window
    # is cached as NO_DATA.
    if not rate_limited.is_set():
        for dest, result in zip(misses, fetched):
            key = cache.forecast_key(
                "aqi",
                dest["latitude"],
                dest["longitude"],
                start_dt.isoformat(),
                end_dt.isoformat(),
            )
            cache.FORECAST_CACHE.put(key, cache.NO_DATA if result is None else result)
    for i, result in zip(miss_indices, fetched):
        results[i] = result
    return results


async def _fetch_chunk(
    destinations: list[dict[str, Any]],
    req_start: date,
    req_end: date,
    start_dt: datetime,
    end_dt: datetime,
) -> list[dict[str, Any] | None]:
    params = {
        "latitude": ",".join(str(d["latitude"]) for d in destinations),
        "longitude": ",".join(str(d["longitude"]) for d in destinations),
        "hourly": "us_aqi",
        "start_date": req_start.isoformat(),
        "end_date": req_end.isoformat(),
        "timezone": "UTC",
    }

    try:
        log.trace("Open-Meteo air quality request params: %s", params)  # type: ignore[attr-defined]
        # One duration observation per HTTP attempt, failures included, so the
        # histogram and the outcome counter tally the same events.
        attempt_start = time.perf_counter()
        try:
            resp = await http.client().get(AIR_QUALITY_URL, params=params)
        finally:
            telemetry.OPENMETEO_DURATION.labels(service="aqi").observe(
                time.perf_counter() - attempt_start
            )
        resp.raise_for_status()
        telemetry.OPENMETEO_REQUESTS.labels(service="aqi", outcome="success").inc()
        data = resp.json()
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            # Raised (not degraded) so the caller can stop burning the AQI
            # quota on the remaining batches; it still degrades to nulls there.
            scope, retry_after = parse_rate_limit(exc)
            telemetry.OPENMETEO_REQUESTS.labels(
                service="aqi", outcome="rate_limited"
            ).inc()
            telemetry.OPENMETEO_RATE_LIMITED.labels(
                service="aqi", scope=scope or "unknown"
            ).inc()
            raise UpstreamRateLimited(
                PROVIDER, scope, retry_after, rate_limit_message(PROVIDER, scope)
            ) from exc
        telemetry.OPENMETEO_REQUESTS.labels(service="aqi", outcome="http_error").inc()
        telemetry.AQI_DEGRADED.labels(reason="error").inc()
        log.warning("Open-Meteo air quality request failed (continuing without AQI): %s", exc)
        return [None] * len(destinations)
    except httpx.HTTPError as exc:
        telemetry.OPENMETEO_REQUESTS.labels(
            service="aqi", outcome="network_error"
        ).inc()
        telemetry.AQI_DEGRADED.labels(reason="error").inc()
        log.warning("Open-Meteo air quality request failed (continuing without AQI): %s", exc)
        return [None] * len(destinations)

    # Single location → object; multiple → array
    items = data if isinstance(data, list) else [data]
    if len(items) != len(destinations):
        # Never let a miscounted response shift rows against the destinations
        # they're zipped with downstream.
        log.warning(
            "Air quality response count mismatch (%d != %d) — dropping batch",
            len(items),
            len(destinations),
        )
        return [None] * len(destinations)
    out: list[dict[str, Any] | None] = []
    for item in items:
        m = _metrics(item, start_dt, end_dt)
        if m is not None:
            # Carry the hourly AQI alongside the avg/max so the route can align
            # it onto the weather grid for the chart — no second AQI fetch.
            m = {**m, "series": _series(item, start_dt, end_dt)}
        out.append(m)
    return out


def _metrics(
    data: dict[str, Any],
    start_dt: datetime,
    end_dt: datetime,
) -> dict[str, Any] | None:
    try:
        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        aqi = hourly.get("us_aqi", [])

        start = start_dt.replace(tzinfo=None)
        end = end_dt.replace(tzinfo=None)

        vals = [
            v
            for ts, v in zip(times, aqi)
            if v is not None
            and (parsed := _parse_ts(ts)) is not None
            and start <= parsed <= end
        ]

        if not vals:
            return None

        # US AQI is an integer index by definition
        return {
            "aqi_avg": round(sum(vals) / len(vals)),
            "aqi_min": round(min(vals)),
            "aqi_max": round(max(vals)),
        }
    except Exception:  # noqa: BLE001 — best-effort AQI degrades to None, never fails the analysis
        return None


def _series(
    data: dict[str, Any],
    start_dt: datetime,
    end_dt: datetime,
) -> dict[str, Any] | None:
    """Per-hour US AQI (combined) over the window, on its own grid.

    The route aligns this onto the (longer) weather grid; hours past the ~5-day
    AQI horizon aren't present here and become nulls there. Returns None when
    the window contains no hours.
    """
    try:
        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        aqi = hourly.get("us_aqi", [])

        start = start_dt.replace(tzinfo=None)
        end = end_dt.replace(tzinfo=None)

        grid: list[int] = []
        out: list[int | None] = []
        for i, ts in enumerate(times):
            parsed = _parse_ts(ts)
            if parsed is None or not (start <= parsed <= end):
                continue
            grid.append(_epoch_ms(parsed))
            v = aqi[i] if i < len(aqi) else None
            out.append(round(v) if v is not None else None)

        if not grid:
            return None
        return {"times": grid, "aqi": out}
    except Exception:  # noqa: BLE001 — best-effort series degrades to None, never fails the analysis
        return None


def _parse_ts(s: str) -> datetime | None:
    try:
        return datetime.fromisoformat(s).replace(tzinfo=None)
    except Exception:  # noqa: BLE001 — unparseable timestamp degrades to None
        return None


def _epoch_ms(dt_naive: datetime) -> int:
    # Times come back UTC (timezone=UTC) with tzinfo stripped by `_parse_ts`;
    # re-stamp UTC for an unambiguous epoch aligned with the weather grid.
    return int(dt_naive.replace(tzinfo=timezone.utc).timestamp() * 1000)
