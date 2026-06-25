from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

log = logging.getLogger(__name__)

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
BATCH_SIZE = 50  # Open-Meteo handles up to ~100; 50 is conservative


async def fetch_weather_batch(
    destinations: List[Dict[str, Any]],
    start_dt: datetime,
    end_dt: datetime,
) -> List[Optional[Dict[str, Any]]]:
    if not destinations:
        return []

    chunks = [
        destinations[i : i + BATCH_SIZE]
        for i in range(0, len(destinations), BATCH_SIZE)
    ]

    log.info(
        "Fetching Open-Meteo weather: %d destination(s) across %d batch(es)",
        len(destinations),
        len(chunks),
    )

    chunk_results = await asyncio.gather(
        *[_fetch_chunk(chunk, start_dt, end_dt) for chunk in chunks]
    )

    return [item for sublist in chunk_results for item in sublist]


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

    async with httpx.AsyncClient(timeout=60.0) as client:
        log.trace("Open-Meteo request params: %s", params)  # type: ignore[attr-defined]
        resp = await client.get(FORECAST_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    # Single location → object; multiple → array
    items = data if isinstance(data, list) else [data]
    results = [_metrics(item, start_dt, end_dt) for item in items]
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


def _parse_ts(s: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(s).replace(tzinfo=None)
    except Exception:
        return None


def _naive(dt: datetime) -> datetime:
    return dt.replace(tzinfo=None)
