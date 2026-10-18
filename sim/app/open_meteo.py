"""The three Open-Meteo services, on the free hosts and the customer ones.

Answers the way Open-Meteo does for the requests the app sends (read off
`frontend/src/utils/openMeteo.ts` and `backend/app/services/weather.py`): one
object for one location and an array for several, every requested variable
present, each column declared in `hourly_units` in exactly the spelling the
two unit checks compare against (`_DECLARED_UNITS` in aggregation.py and its
port), and the hours from `start_hour` to `end_hour` inclusive.

The archive is answered as the real one is (measured 2026-09-13, `docs/DATA.md`):
the pressure levels and the freezing level are columns of nulls under the unit
`undefined`, and `models=` is ignored. A variable the sim does not know is a
400, which is the real API's answer and the quickest way for a new variable on
the app's side to show the sim needs it too.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from app import values
from app.control import Endpoint, fault

# The air-quality forecast's reach past today: CAMS publishes about five days
# and Open-Meteo answers null past it (`MAX_FORECAST_DAYS` in air_quality.py).
# The one place a sim answer reads the clock, because the real answer does.
AQI_FORECAST_DAYS = 5

_LEVEL = re.compile(r"^(temperature|wind_speed|relative_humidity)_(\d+)hPa$")

# The customer hosts' refusals, in Open-Meteo's words. The pod's
# `is_invalid_api_key` matches the second to answer a caller 401.
log = logging.getLogger("sim.open_meteo")

KEY_REQUIRED = {"reason": "API key required. Please add &apikey= to the URL.", "error": True}
KEY_INVALID = {"reason": "The supplied API key is invalid.", "error": True}
# Every parameter the sim cannot read gets this one reason; the sim's log names
# the parameter.
BAD_REQUEST_REASON = "The sim could not read this request. Its log names the parameter."


@dataclass(frozen=True, slots=True)
class _Units:
    precipitation: str
    temperature: str
    wind: str


def _json(body: object, status: int = 200) -> Response:
    # Compact and UTF-8, as Open-Meteo sends it: "°F" is two bytes, not an escape.
    text = json.dumps(body, ensure_ascii=False, separators=(",", ":"))
    return Response(text.encode(), status_code=status, media_type="application/json")


def _error(reason: str, status: int = 400) -> Response:
    return _json({"error": True, "reason": reason}, status)


class _BadRequest(Exception):
    pass


def _floats(text: str | None, name: str) -> list[float]:
    if not text:
        raise _BadRequest(f"Parameter '{name}' is required")
    try:
        return [float(part) for part in text.split(",")]
    except ValueError:
        raise _BadRequest(f"Parameter '{name}' must be a list of numbers") from None


def _hour(text: str, name: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        raise _BadRequest(f"Parameter '{name}' must be an ISO8601 date-time") from None
    return parsed.replace(tzinfo=UTC, minute=0, second=0, microsecond=0)


def _window(params: dict[str, str]) -> list[datetime]:
    if params.get("start_hour") and params.get("end_hour"):
        start = _hour(params["start_hour"], "start_hour")
        end = _hour(params["end_hour"], "end_hour")
    elif params.get("start_date") and params.get("end_date"):
        start = _hour(params["start_date"] + "T00:00", "start_date")
        end = _hour(params["end_date"] + "T23:00", "end_date")
    else:
        # Open-Meteo would default to the next seven days; the sim asks instead,
        # because a default would be its one clock read on this path.
        raise _BadRequest("Parameters 'start_hour' and 'end_hour' are required by the sim")
    if end < start:
        raise _BadRequest("Parameter 'end_hour' must not be before 'start_hour'")
    hours = int((end - start).total_seconds() // 3600) + 1
    return [start + timedelta(hours=h) for h in range(hours)]


def _units(params: dict[str, str]) -> _Units:
    wind = {"kmh": "km/h", "mph": "mp/h", "ms": "m/s", "kn": "kn"}.get(params.get("wind_speed_unit", "kmh"), "km/h")
    return _Units(
        precipitation="inch" if params.get("precipitation_unit") == "inch" else "mm",
        temperature="°F" if params.get("temperature_unit") == "fahrenheit" else "°C",
        wind=wind,
    )


def _convert_temp(f: float, unit: str) -> float:
    return round(f if unit == "°F" else (f - 32) * 5 / 9, 1)


def _convert_wind(mph: float, unit: str) -> float:
    factor = {"mp/h": 1.0, "km/h": 1.609344, "m/s": 0.44704, "kn": 0.868976}[unit]
    return round(mph * factor, 1)


# A column: its declared unit and the value at (lat, lon, hour), or None.
_Column = tuple[str, Callable[[float, float, int], float | int | None]]


def _column(name: str, units: _Units, service: str, model: str | None) -> _Column:
    """The unit and the formula for one requested variable.

    Raises `_BadRequest` for a name the service does not serve, the way
    Open-Meteo does.
    """
    archive = service == "archive"
    if service == "air_quality":
        if name == "us_aqi":
            return "USAQI", values.us_aqi
        raise _BadRequest(f"Cannot initialize AirQualityVariable from invalid String value {name}")
    if name == "precipitation":
        if units.precipitation == "inch":
            return "inch", lambda la, lo, h: round(values.precipitation_in(la, lo, h), 3)
        return "mm", lambda la, lo, h: round(values.precipitation_in(la, lo, h) * 25.4, 1)
    if name == "snowfall":
        if units.precipitation == "inch":
            return "inch", lambda la, lo, h: round(values.snowfall_in(la, lo, h), 3)
        return "cm", lambda la, lo, h: round(values.snowfall_in(la, lo, h) * 2.54, 2)
    if name == "temperature_2m":
        return units.temperature, lambda la, lo, h: _convert_temp(values.temperature_2m_f(la, lo, h), units.temperature)
    if name == "wind_speed_10m":
        return units.wind, lambda la, lo, h: _convert_wind(values.wind_10m_mph(la, lo, h), units.wind)
    if name == "wind_direction_10m":
        return "°", lambda la, lo, h: round(values.wind_direction_deg(la, lo, h))
    if name == "relative_humidity_2m":
        return "%", lambda la, lo, h: round(values.relative_humidity_pct(la, lo, h, None))
    if name == "freezing_level_height":
        served = not archive and (model is None or model in values.FREEZING_LEVEL_MODELS)
        if not served:
            return ("undefined" if archive else "ft" if units.precipitation == "inch" else "m"), lambda la, lo, h: None
        # Its unit follows `precipitation_unit`, not a length parameter: feet
        # under `inch`, metres without it (measured 2026-09-13 at Rainier).
        if units.precipitation == "inch":
            return "ft", lambda la, lo, h: round(values.freezing_level_ft(la, lo, h), 1)
        return "m", lambda la, lo, h: round(values.freezing_level_ft(la, lo, h) * 0.3048, 1)
    level = _LEVEL.match(name)
    if level and int(level.group(2)) in values.ISA_HEIGHT_M:
        kind, p = level.group(1), int(level.group(2))
        if archive:
            return "undefined", lambda la, lo, h: None
        if kind == "temperature":
            return units.temperature, lambda la, lo, h: _convert_temp(
                values.temperature_level_f(la, lo, h, p), units.temperature
            )
        if kind == "wind_speed":
            return units.wind, lambda la, lo, h: _convert_wind(values.wind_level_mph(la, lo, h, p), units.wind)
        return "%", lambda la, lo, h: round(values.relative_humidity_pct(la, lo, h, p))
    raise _BadRequest(f"Cannot initialize WeatherVariable from invalid String value {name}")


def _aqi_cutoff_hour() -> int:
    end = datetime.now(UTC) + timedelta(days=AQI_FORECAST_DAYS)
    return int(end.replace(hour=23, minute=0, second=0, microsecond=0).timestamp() // 3600)


def answer(params: dict[str, str], service: str) -> Response:
    """The whole answer for one request's query parameters.

    `service` is `forecast`, `archive` or `air_quality`. Public so the tests can
    reach the body without a client.
    """
    try:
        lats = _floats(params.get("latitude"), "latitude")
        lons = _floats(params.get("longitude"), "longitude")
        if len(lats) != len(lons):
            raise _BadRequest("Parameter 'latitude' and 'longitude' must have the same number of elements")
        stamps = _window(params)
        names = [n for n in (params.get("hourly") or "").split(",") if n]
        # The archive ignores `models=` (measured 2026-09-12), so it shifts no phase.
        model = None if service == "archive" else (params.get("models") or None)
        units = _units(params)
        columns = {name: _column(name, units, service, model) for name in names}
    except _BadRequest as e:
        # The detail goes to the log, not the wire: nothing the app runs reads
        # a parameter error's wording, and an answer built from an exception
        # is the habit CodeQL flags in code that does matter.
        log.warning("Refused an Open-Meteo request: %s", e)
        return _error(BAD_REQUEST_REASON)

    unixtime = params.get("timeformat") == "unixtime"
    times: list[int | str] = (
        [int(t.timestamp()) for t in stamps] if unixtime else [t.strftime("%Y-%m-%dT%H:%M") for t in stamps]
    )
    epoch_hours = [int(t.timestamp() // 3600) for t in stamps]
    shift = values.model_shift_h(model)
    cutoff = _aqi_cutoff_hour() if service == "air_quality" else None

    items = []
    for lat, lon in zip(lats, lons, strict=True):
        hourly: dict[str, list[object]] = {"time": list(times)}
        for name, (_, formula) in columns.items():
            hourly[name] = [
                None if cutoff is not None and h > cutoff else formula(lat, lon, h + shift) for h in epoch_hours
            ]
        items.append(
            {
                "latitude": lat,
                "longitude": lon,
                "generationtime_ms": 0.1,
                "utc_offset_seconds": 0,
                "timezone": "GMT",
                "timezone_abbreviation": "GMT",
                "elevation": values.terrain_m(lat, lon),
                "hourly_units": {"time": "unixtime" if unixtime else "iso8601"}
                | {name: unit for name, (unit, _) in columns.items()},
                "hourly": hourly,
            }
        )
    return _json(items[0] if len(items) == 1 else items)


def _route(service: Endpoint, customer: bool) -> Callable[[Request], Response]:
    def handle(request: Request) -> Response:
        params = dict(request.query_params)
        if customer:
            key = params.pop("apikey", None)
            if not key:
                return _json(KEY_REQUIRED, 401)
            if key == "invalid":
                return _json(KEY_INVALID, 400)
        return answer(params, service)

    return handle


router = APIRouter()

_PATHS: dict[Endpoint, str] = {"forecast": "/v1/forecast", "archive": "/v1/archive", "air_quality": "/v1/air-quality"}
for _service, _path in _PATHS.items():
    for _prefix, _customer in (("/open-meteo", False), ("/open-meteo-customer", True)):
        router.add_api_route(
            _prefix + _path,
            _route(_service, _customer),
            methods=["GET"],
            dependencies=[Depends(fault(_service))],
            include_in_schema=False,
        )
