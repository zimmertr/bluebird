from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from app import ratelimit, telemetry
from app.services import cache, http
from app.services.openmeteo_fetch import (
    DEGRADED,
    Pacing,
    fetch_batched,
    request_openmeteo,
)
from app.services.openmeteo_weight import call_weight
from app.services.weather import _epoch_ms, _parse_ts, hour_param

log = logging.getLogger(__name__)

AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
# Where a keyed request goes (issue #317), for the reason the weather service
# names its own customer host: the free host only redirects a keyed request.
CUSTOMER_AIR_QUALITY_URL = (
    "https://customer-air-quality-api.open-meteo.com/v1/air-quality"
)
N_VARIABLES = 1  # us_aqi
PROVIDER = "Open-Meteo (air quality)"

# The underlying CAMS model publishes ~5 days of forecast. The API accepts an
# end a day or two past that, but the exact boundary tracks the model-run
# publish cycle (early in the UTC day it can be today+6, later today+7), so
# clamping to +5 stays safely inside it at any hour without losing real data —
# hours past ~5 days come back null anyway.
MAX_FORECAST_DAYS = 5


async def fetch_aqi_batch(
    destinations: list[dict[str, Any]],
    start_dt: datetime,
    end_dt: datetime,
    api_key: str | None = None,
) -> list[dict[str, Any] | None]:
    """Fetch US AQI stats (all EPA pollutants combined) (avg/max over the window) per destination.

    Best-effort by design: air quality is supplementary, so upstream failures
    degrade to None entries (rendered as "—") instead of failing the analysis
    the way a weather outage does. A refused API key is the one exception: the
    request itself is unusable, so it raises for the route to answer 401
    rather than returning a ranking that quietly has no air quality in it.
    """
    if not destinations:
        return []

    # Clamp to the API's accepted range; a window entirely beyond the horizon
    # skips the fetch instead of triggering a 400. The cap ends at 23:00 on
    # the day MAX_FORECAST_DAYS names, which is where the whole-day request
    # this replaced already ended, so the clamp keeps its old reach exactly.
    # Wall clocks are read as UTC without converting, the same convention
    # `_naive` uses in the weather service.
    end_cap = (
        datetime.now(UTC).replace(tzinfo=None)
        + timedelta(days=MAX_FORECAST_DAYS)
    ).replace(hour=23, minute=0, second=0, microsecond=0)
    req_start = start_dt.replace(tzinfo=None, minute=0, second=0, microsecond=0)
    req_end = min(
        end_dt.replace(tzinfo=None, minute=0, second=0, microsecond=0), end_cap
    )
    if req_start > req_end:
        log.info("AQI window starts beyond the ~%dd forecast horizon — skipping fetch", MAX_FORECAST_DAYS)
        return [None] * len(destinations)

    def key(dest: dict[str, Any]) -> tuple:
        # Keyed on the caller's window rather than the clamped one, so an entry
        # answers the question that was asked. `api_key` is left out for the
        # reason the weather service leaves it out: the two hosts answer the
        # same location and window the same way.
        return cache.forecast_key(
            "aqi",
            dest["latitude"],
            dest["longitude"],
            start_dt.isoformat(),
            end_dt.isoformat(),
        )

    def weights(chunk: list[dict[str, Any]]) -> list[float]:
        # One request per chunk, priced on the clamped hours it actually asks
        # for.
        return [call_weight(len(chunk), req_start.date(), req_end.date(), N_VARIABLES)]

    def degraded(reason: str) -> None:
        telemetry.AQI_DEGRADED.labels(reason=reason).inc()

    return await fetch_batched(
        destinations,
        label="Open-Meteo air quality",
        cache_key=key,
        fetch_chunk=lambda chunk: _fetch_chunk(
            chunk, req_start, req_end, start_dt, end_dt, api_key
        ),
        slots=ratelimit.AQI_BUDGET,
        # A keyed chunk skips the weighted pacer and only the pacer, exactly as
        # the weather service does and for the same reason: that budget meters
        # the pod's own air-quality quota, which a keyed chunk never spends.
        pacing=None
        if api_key is not None
        else Pacing(ratelimit.AQI_WEIGHT, weights),
        # Air quality never fails the analysis, so a spent budget or a 429
        # becomes null rows — and the 429 stops the batches behind it, which is
        # what the incident's "zombie" AQI batches did not do.
        on_error="degrade",
        on_degraded=degraded,
    )


async def _fetch_chunk(
    destinations: list[dict[str, Any]],
    req_start: datetime,
    req_end: datetime,
    start_dt: datetime,
    end_dt: datetime,
    api_key: str | None = None,
) -> list[dict[str, Any] | None]:
    params = {
        "latitude": ",".join(str(d["latitude"]) for d in destinations),
        "longitude": ",".join(str(d["longitude"]) for d in destinations),
        "hourly": "us_aqi",
        "start_hour": hour_param(req_start),
        "end_hour": hour_param(req_end),
        "timezone": "UTC",
    }
    url = AIR_QUALITY_URL
    if api_key is not None:
        url = CUSTOMER_AIR_QUALITY_URL
        params["apikey"] = api_key

    # A refused key and a 429 still raise out of here. The key is the caller's
    # to fix and the same one rides every batch, and the 429 is what stops the
    # batches behind this one; everything else this service absorbs.
    data = await request_openmeteo(
        http.client(),
        url,
        params,
        service="aqi",
        provider=PROVIDER,
        api_key=api_key,
        on_error="degrade",
    )
    if data is DEGRADED:
        telemetry.AQI_DEGRADED.labels(reason="error").inc()
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
            for ts, v in zip(times, aqi, strict=False)
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
