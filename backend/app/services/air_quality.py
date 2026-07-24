from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

import httpx

log = logging.getLogger(__name__)

AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
BATCH_SIZE = 50  # same conservative batching as the weather service
MAX_CONCURRENT_BATCHES = 4  # same in-flight gate as the weather service

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
    """Fetch PM2.5 US AQI stats (avg/max over the window) per destination.

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

    chunks = [
        destinations[i : i + BATCH_SIZE]
        for i in range(0, len(destinations), BATCH_SIZE)
    ]
    log.info(
        "Fetching Open-Meteo air quality: %d destination(s) across %d batch(es)",
        len(destinations),
        len(chunks),
    )

    sem = asyncio.Semaphore(MAX_CONCURRENT_BATCHES)

    async def gated(chunk: list[dict[str, Any]]) -> list[dict[str, Any] | None]:
        async with sem:
            return await _fetch_chunk(chunk, req_start, req_end, start_dt, end_dt)

    chunk_results = await asyncio.gather(*(gated(chunk) for chunk in chunks))
    return [item for sublist in chunk_results for item in sublist]


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
        "hourly": "us_aqi_pm2_5",
        "start_date": req_start.isoformat(),
        "end_date": req_end.isoformat(),
        "timezone": "UTC",
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            log.trace("Open-Meteo air quality request params: %s", params)  # type: ignore[attr-defined]
            resp = await client.get(AIR_QUALITY_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
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
        aqi = hourly.get("us_aqi_pm2_5", [])

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
            "aqi_max": round(max(vals)),
        }
    except Exception:  # noqa: BLE001 — best-effort AQI degrades to None, never fails the analysis
        return None


def _series(
    data: dict[str, Any],
    start_dt: datetime,
    end_dt: datetime,
) -> dict[str, Any] | None:
    """Per-hour PM2.5 US AQI over the window, on its own grid.

    The route aligns this onto the (longer) weather grid; hours past the ~5-day
    AQI horizon aren't present here and become nulls there. Returns None when
    the window contains no hours.
    """
    try:
        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        aqi = hourly.get("us_aqi_pm2_5", [])

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
