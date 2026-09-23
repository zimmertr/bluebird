"""The forecast arithmetic both analysis paths share, and nothing else.

Every function here turns one location's Open-Meteo hourly payload into the
numbers a row ranks on: the weather aggregates and series, the air-quality
aggregates and series, and the join that makes a window split across two
endpoints look like any other window first. The browser runs a line-for-line
port of this file in `frontend/src/utils/openMeteoAggregate.ts`, and
`tests/data/weather_vectors.json` pins the two to identical outputs.

It is its own module so the two halves of that contract can be read side by
side: the fetch, the cache and the pacing stay in `weather.py` and
`air_quality.py`, which call in here once per location. The functions are
listed in the order the port lists them, and a Vitest suite reads both files
and fails when the names or their order drift apart.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from app.services.errors import UpstreamError

log = logging.getLogger(__name__)

# Named here rather than in `weather.py` because the one refusal this module
# raises names the provider, and `weather.py` imports from this module.
PROVIDER = "Open-Meteo"



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

# The height of each standard pressure level in the ICAO standard atmosphere,
# in metres. Every level-reading below takes its height from here rather than
# from a geopotential it fetched: real level heights move a few percent with the
# weather, and fetching them would double a request's variable count for a
# correction smaller than the model's own grid error. The wind and temperature
# read the five from 925 to 500 hPa; the cloud base reads all eight, because a
# saturated layer can sit under the lowest summit (1000 hPa) and a clear column
# has to be checked to the top of every summit on Earth (300 hPa, 30,100 ft).
# Mirrored in the browser and pinned by `mirrored_constants.json`.
ISA_HEIGHT_M: dict[int, float] = {
    1000: 111.0,
    925: 762.0,
    850: 1457.0,
    700: 3012.0,
    600: 4206.0,
    500: 5574.0,
    400: 7185.0,
    300: 9164.0,
}

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
    (f"wind_speed_{p}hPa", ISA_HEIGHT_M[p]) for p in (925, 850, 700, 600, 500)
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
    (f"temperature_{p}hPa", ISA_HEIGHT_M[p]) for p in (925, 850, 700, 600, 500)
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


_JOIN_KEYS: tuple[str, ...] = ("time", *HOURLY_VARIABLES.split(","))

# The cloud base (issue #117): the lowest height in the air column over a
# destination where the air is saturated, read off the relative humidity at the
# destination's own 2 m point and at every standard level above it.
#
# Open-Meteo serves no cloud base of its own (`cloud_base` answers the unit
# `undefined` and a column of nulls on all eight models and the archive,
# measured 2026-09-22), and the destination's own temperature and dew point
# cannot answer the question alone: Open-Meteo lapses that pair to the
# destination's height, so a parcel base computed from it can only ever sit AT
# or ABOVE the summit, never under it. Whether a summit stands above a deck is
# a question about the column beneath it, so the column is what is read.
#
# 95 % rather than 100 %: a model's grid cell is tens of square kilometres, and
# a cell whose mean humidity reaches the mid-90s is one where cloud is forming
# in part of it. Pinned as a mirrored constant, and deliberately one number
# rather than a tuned curve: it has not been fitted to observed ceilings.
CLOUD_SATURATION_RH = 95.0
# Espy's rule: an unsaturated parcel lifted from the surface condenses about
# 125 m higher for every degree Celsius between its temperature and its dew
# point. It is the fallback for a column with nothing saturated in it, so a
# clear day reads a high base rather than no base at all.
ESPY_M_PER_C = 125.0
_CLOUD_LEVELS: list[tuple[str, float]] = [
    (f"relative_humidity_{p}hPa", h) for p, h in ISA_HEIGHT_M.items()
]
# The cloud variables ride a request of their own, made only when a ranking or
# a bound asks for a cloud metric: twelve more variables on every analysis
# would take the weighted price of each from 1.5 to 2.7 (issue #117). The pair
# at 2 m is fetched in Celsius, the unit Espy's rule is stated in, so the
# request sends no `temperature_unit`.
CLOUD_VARIABLES = ",".join(
    ["cloud_cover", "relative_humidity_2m", "temperature_2m", "dew_point_2m"]
    + [name for name, _ in _CLOUD_LEVELS]
)
CLOUD_JOIN_KEYS: tuple[str, ...] = ("time", *CLOUD_VARIABLES.split(","))


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


def _join_hours(
    parts: Sequence[dict[str, Any]], keys: Sequence[str] = _JOIN_KEYS
) -> dict[str, Any]:
    """One location's half-windows as a single hourly payload.

    The aggregation is pinned byte-for-byte against the browser port by the
    shared vectors, so a spanning window is made to look like every other window
    BEFORE it reaches `_weather_metrics`: the halves are concatenated in time order (the
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

    `keys` names the arrays to keep parallel, which is the request's own
    variable list: the weather request and the cloud request ask for
    different ones.
    """
    if len(parts) == 1:
        return parts[0]
    declared = [part.get("hourly_units") or {} for part in parts]
    if not _units_agree(declared):
        return {}
    joined: dict[str, list[Any]] = {key: [] for key in keys}
    seen: set[Any] = set()
    for part in parts:
        hourly = part.get("hourly") or {}
        for i, ts in enumerate(hourly.get("time") or []):
            if ts in seen:
                continue
            seen.add(ts)
            joined["time"].append(ts)
            for key in keys[1:]:
                joined[key].append(_at(hourly.get(key) or [], i))
    return {**parts[0], "hourly_units": _join_units(declared), "hourly": joined}


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

    Read against its own pair of arrays rather than inside `_weather_metrics`'s zip,
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


def _weather_metrics(
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


def _weather_series(
    data: dict[str, Any],
    start_dt: datetime,
    end_dt: datetime,
    elevation_ft: float | None = None,
) -> dict[str, Any] | None:
    """Per-hour precip/temp/wind/freezing level over the window, on one grid.

    Unlike `_weather_metrics` — which drops any hour missing a value and collapses the
    rest into aggregates — this keeps every in-window hour and preserves each
    metric's nulls independently (the chart renders them as line gaps). Returns
    None when the window contains no hours at all, or when the payload is
    malformed — an unreadable freezing level unit is the one exception, and it
    raises. Wind and temperature are adjusted to the destination's elevation
    exactly as `_weather_metrics` adjusts them, so the chart and the playback
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
        # `_weather_metrics` does not absorb it either: an unreadable unit is a number
        # we would have to invent, not an hour we can leave blank.
        raise
    except Exception:  # noqa: BLE001 — best-effort series degrades to None, never fails the analysis
        return None


def _aqi_metrics(
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


def _aqi_series(
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


def _cloud_base_m(
    elevation_ft: float | None,
    rh2m: float | None,
    t2m: float | None,
    td2m: float | None,
    levels: list[float | None],
) -> float | None:
    """One hour's cloud base, in metres above sea level, or None.

    The column is the destination's own 2 m point followed by every standard
    level ABOVE the destination, walked upward. The first saturated point ends
    the walk: at the 2 m point the destination itself is in cloud and the base
    is its own elevation; higher up, the height is interpolated linearly in
    relative humidity between the last dry point and this one, to where the
    humidity crosses `CLOUD_SATURATION_RH`. A null point is skipped, so the
    interpolation spans whatever gap it leaves.

    A column that answered and is dry all the way up falls back to Espy's
    parcel base over the destination, so a clear sky reads a high number. A
    column that did not answer at all is None: the archive endpoint serves no
    pressure levels, and a base read off the 2 m pair alone would be the
    parcel's rather than the column's. No elevation is None too, because the
    walk has nowhere to start.
    """
    if elevation_ft is None:
        return None
    elev_m = elevation_ft * _FT_TO_M
    column: list[tuple[float, float | None]] = [(elev_m, rh2m)]
    answered = False
    for k in range(len(_CLOUD_LEVELS)):
        height = _CLOUD_LEVELS[k][1]
        if height <= elev_m:
            continue
        rh = levels[k] if k < len(levels) else None
        if rh is not None:
            answered = True
        column.append((height, rh))
    if not answered:
        return None
    prev: tuple[float, float] | None = None
    for height, rh in column:
        if rh is None:
            continue
        if rh >= CLOUD_SATURATION_RH:
            if prev is None:
                return height
            lo_h, lo_rh = prev
            return lo_h + (height - lo_h) * ((CLOUD_SATURATION_RH - lo_rh) / (rh - lo_rh))
        prev = (height, rh)
    if t2m is None or td2m is None:
        return None
    return elev_m + ESPY_M_PER_C * max(0.0, t2m - td2m)


def _cloud_level_arrays(hourly: dict[str, Any]) -> list[list[Any]]:
    return [hourly.get(name, []) for name, _ in _CLOUD_LEVELS]


def _cloud_base_ft_at(
    hourly: dict[str, Any],
    i: int,
    elevation_ft: float | None,
    levels: list[list[Any]],
) -> float | None:
    base = _cloud_base_m(
        elevation_ft,
        _at(hourly.get("relative_humidity_2m", []), i),
        _at(hourly.get("temperature_2m", []), i),
        _at(hourly.get("dew_point_2m", []), i),
        [_at(arr, i) for arr in levels],
    )
    return None if base is None else base / _FT_TO_M


def _cloud_metrics(
    data: dict[str, Any],
    start_dt: datetime,
    end_dt: datetime,
    elevation_ft: float | None = None,
) -> dict[str, Any] | None:
    """The window's cloud base and cloud cover, each reduced on its own.

    Times-driven rather than a zip, and each quantity drops only its own null
    hours, which is the freezing level's rule for the freezing level's reason:
    an archive hour has cloud cover and no base, and losing the cover with the
    base would blank a column the archive does serve. None only when the window
    holds no hours at all; a window with no base in it reports null base
    aggregates beside whatever cover it has.
    """
    try:
        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        cover = hourly.get("cloud_cover", [])
        levels = _cloud_level_arrays(hourly)

        start = _naive(start_dt)
        end = _naive(end_dt)

        hours = 0
        bases: list[float] = []
        covers: list[float] = []
        for i, ts in enumerate(times):
            parsed = _parse_ts(ts)
            if parsed is None or not (start <= parsed <= end):
                continue
            hours += 1
            c = _at(cover, i)
            if c is not None:
                covers.append(c)
            base = _cloud_base_ft_at(hourly, i, elevation_ft, levels)
            if base is not None:
                bases.append(base)

        if hours == 0:
            return None
        return {
            # Whole feet, for the freezing level's reason: the levels are
            # hundreds of metres apart, so a decimal is precision nothing
            # measured.
            "cloud_base_min_ft": round(min(bases), 0) if bases else None,
            "cloud_base_max_ft": round(max(bases), 0) if bases else None,
            "cloud_base_avg_ft": round(sum(bases) / len(bases), 0) if bases else None,
            "cloud_cover_min_pct": round(min(covers), 0) if covers else None,
            "cloud_cover_max_pct": round(max(covers), 0) if covers else None,
            "cloud_cover_avg_pct": round(sum(covers) / len(covers), 0) if covers else None,
        }
    except Exception:  # noqa: BLE001 — malformed payload degrades to no metrics
        return None


def _cloud_series(
    data: dict[str, Any],
    start_dt: datetime,
    end_dt: datetime,
    elevation_ft: float | None = None,
) -> dict[str, Any] | None:
    """Per-hour cloud base and cloud cover over the window, nulls kept."""
    try:
        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        cover = hourly.get("cloud_cover", [])
        levels = _cloud_level_arrays(hourly)

        start = _naive(start_dt)
        end = _naive(end_dt)

        grid: list[int] = []
        b_out: list[float | None] = []
        c_out: list[float | None] = []
        for i, ts in enumerate(times):
            parsed = _parse_ts(ts)
            if parsed is None or not (start <= parsed <= end):
                continue
            grid.append(_epoch_ms(parsed))
            b_out.append(_round_or_none(_cloud_base_ft_at(hourly, i, elevation_ft, levels), 0))
            c_out.append(_round_or_none(_at(cover, i), 0))

        if not grid:
            return None
        return {"times": grid, "cloud_base_ft": b_out, "cloud_cover_pct": c_out}
    except Exception:  # noqa: BLE001 — best-effort series degrades to None
        return None
