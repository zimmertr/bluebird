from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional

import httpx

from app.services.errors import UpstreamError, classify_http_error

log = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
BATCH_SIZE = 50  # Open-Meteo handles up to ~100; 50 is conservative
# Exhaustive analyses can mean dozens of batches — gate how many are in
# flight at once so a big polygon doesn't burst-hammer the free API.
MAX_CONCURRENT_BATCHES = 4
PROVIDER = "Open-Meteo (weather service)"

# Called as each batch completes: (processed_destinations, total_destinations,
# batches_done, total_batches). Lets the SSE route emit incremental progress.
ProgressCallback = Callable[[int, int, int, int], Awaitable[None]]


async def fetch_weather_batch(
    destinations: List[Dict[str, Any]],
    start_dt: datetime,
    end_dt: datetime,
    on_progress: Optional[ProgressCallback] = None,
) -> List[Optional[Dict[str, Any]]]:
    if not destinations:
        return []

    chunks = [
        destinations[i : i + BATCH_SIZE]
        for i in range(0, len(destinations), BATCH_SIZE)
    ]
    total = len(destinations)
    total_batches = len(chunks)

    log.info(
        "Fetching Open-Meteo weather: %d destination(s) across %d batch(es)",
        total,
        total_batches,
    )

    # Preserve input ordering by placing each batch's results at its own index,
    # while still reporting progress in completion order via as_completed.
    results_by_index: List[List[Optional[Dict[str, Any]]]] = [[] for _ in chunks]
    processed = 0
    batches_done = 0

    sem = asyncio.Semaphore(MAX_CONCURRENT_BATCHES)
    tasks = [
        asyncio.create_task(_fetch_chunk_indexed(i, chunk, start_dt, end_dt, sem))
        for i, chunk in enumerate(chunks)
    ]

    try:
        for future in asyncio.as_completed(tasks):
            index, chunk_results = await future
            results_by_index[index] = chunk_results
            processed += len(chunk_results)
            batches_done += 1
            if on_progress is not None:
                await on_progress(processed, total, batches_done, total_batches)
    except BaseException:
        # A batch failed (or the client disconnected) — don't leak the siblings.
        for task in tasks:
            task.cancel()
        raise

    return [item for sublist in results_by_index for item in sublist]


async def _fetch_chunk_indexed(
    index: int,
    destinations: List[Dict[str, Any]],
    start_dt: datetime,
    end_dt: datetime,
    sem: asyncio.Semaphore,
) -> tuple[int, List[Optional[Dict[str, Any]]]]:
    async with sem:
        return index, await _fetch_chunk(destinations, start_dt, end_dt)


async def _fetch_chunk(
    destinations: List[Dict[str, Any]],
    start_dt: datetime,
    end_dt: datetime,
) -> List[Optional[Dict[str, Any]]]:
    lats = ",".join(str(d["latitude"]) for d in destinations)
    lons = ",".join(str(d["longitude"]) for d in destinations)

    log.info(
        "Open-Meteo batch: %d location(s), %s → %s",
        len(destinations),
        start_dt.date().isoformat(),
        end_dt.date().isoformat(),
    )

    params = {
        "latitude": lats,
        "longitude": lons,
        "hourly": "precipitation,temperature_2m,wind_speed_10m",
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "start_date": start_dt.date().isoformat(),
        "end_date": end_dt.date().isoformat(),
        "timezone": "UTC",
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            log.trace("Open-Meteo request params: %s", params)  # type: ignore[attr-defined]
            resp = await client.get(FORECAST_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        log.warning("Open-Meteo request failed: %s", exc)
        raise UpstreamError(classify_http_error(exc, PROVIDER)) from exc

    # Single location → object; multiple → array
    items = data if isinstance(data, list) else [data]
    results: List[Optional[Dict[str, Any]]] = []
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
    data: Dict[str, Any],
    start_dt: datetime,
    end_dt: datetime,
) -> Optional[Dict[str, Any]]:
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
    except Exception:
        return None


def _series(
    data: Dict[str, Any],
    start_dt: datetime,
    end_dt: datetime,
) -> Optional[Dict[str, Any]]:
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

        grid: List[int] = []
        p_out: List[Optional[float]] = []
        t_out: List[Optional[float]] = []
        w_out: List[Optional[float]] = []
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
    except Exception:
        return None


def _parse_ts(s: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(s).replace(tzinfo=None)
    except Exception:
        return None


def _naive(dt: datetime) -> datetime:
    return dt.replace(tzinfo=None)


def _epoch_ms(dt_naive: datetime) -> int:
    # Open-Meteo times are UTC (we request timezone=UTC) and `_parse_ts` strips
    # the tzinfo, so re-stamp UTC before converting to an unambiguous epoch the
    # browser can render in the viewer's local zone.
    return int(dt_naive.replace(tzinfo=timezone.utc).timestamp() * 1000)


def _at(arr: List[Any], i: int) -> Optional[float]:
    return arr[i] if i < len(arr) else None


def _round_or_none(v: Optional[float], ndigits: int) -> Optional[float]:
    return round(v, ndigits) if v is not None else None
