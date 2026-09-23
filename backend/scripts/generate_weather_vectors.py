"""Regenerate the shared weather/AQI aggregation test vectors.

The TypeScript port in `frontend/src/utils/openMeteoAggregate.ts` must produce
byte-identical aggregates to the backend, or the browser and the API would
rank the same forecast differently. These vectors are the contract: inputs
are authored here, expected outputs are computed by the backend
implementation (the reference), and the one committed file is asserted by
BOTH test suites — pytest proves Python still reproduces it (so an
aggregation change forces a regeneration, making the contract change visible
in review) and Vitest proves the TypeScript port matches it.

The inputs deliberately include the cross-language traps: Python's
round-half-even at exactly representable boundaries (x.25 / x.5 values),
zip-stops-at-shortest arrays, times-driven series padding, malformed
timestamps, and windows containing no hours.

Run:
    cd backend && python scripts/generate_weather_vectors.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.routes.analyze import _aligned_aqi
from app.services import aggregation

OUT = Path(__file__).parent.parent / "tests" / "data" / "weather_vectors.json"

H = [f"2026-07-21T{h:02d}:00" for h in range(6)]  # a fixed UTC day, hourly
H8 = [f"2026-07-21T{h:02d}:00" for h in range(8)]  # eight hours: /8 terminates,
# which is what lets an average of two-decimal inputs land on a fifth decimal.


def _win(start: str, end: str) -> dict[str, str]:
    return {"start": start, "end": end}


def _wx(times, precip, temp, wind, levels=None, freeze=None, freeze_unit="m") -> dict:
    """A weather payload; `levels` maps pressure-level variable names
    (`wind_speed_925hPa` … `wind_speed_500hPa` for the elevation-adjusted wind
    cases, issue #257, and `temperature_925hPa` … `temperature_500hPa` for the
    elevation-adjusted temperature ones, issue #443) to hourly arrays. One
    mapping carries both families, because a real payload does. `freeze` is the hourly
    freezing level (issue #295), omitted entirely where a payload stands in
    for one of the five models that do not publish it, and quoted in the unit
    `freeze_unit` names — which the payload carries in `hourly_units`, because
    Open-Meteo's unit for this variable follows `precipitation_unit` and the
    aggregation reads it rather than assuming either one."""
    hourly = {
        "time": times,
        "precipitation": precip,
        "temperature_2m": temp,
        "wind_speed_10m": wind,
    }
    if levels:
        hourly.update(levels)
    payload = {"hourly": hourly}
    if freeze is not None:
        hourly["freezing_level_height"] = freeze
        payload["hourly_units"] = {"freezing_level_height": freeze_unit}
    return payload


def _aq(times, aqi) -> dict:
    return {"hourly": {"time": times, "us_aqi": aqi}}


WEATHER_INPUTS = [
    {
        "name": "simple_aggregation",
        "window": _win(H[0], H[2]),
        "payload": _wx(H[:3], [0.1, 0.2, 0.0], [50.0, 52.0, 54.0], [5.0, 7.0, 9.0]),
    },
    {
        # An hour missing ANY metric is dropped from aggregates entirely, but
        # the series keeps every in-window hour with per-metric nulls.
        "name": "partial_nulls_drop_the_hour_from_metrics_only",
        "window": _win(H[0], H[2]),
        "payload": _wx(H[:3], [0.1, None, 0.3], [50.0, 52.0, None], [5.0, 7.0, 9.0]),
    },
    {
        "name": "all_hours_incomplete_metrics_null_series_kept",
        "window": _win(H[0], H[2]),
        "payload": _wx(H[:3], [None, None, None], [50.0, 52.0, 54.0], [5.0, 7.0, 9.0]),
    },
    {
        # The normalized point-sample window: floored hour, one minute span.
        "name": "point_sample_single_hour",
        "window": _win("2026-07-21T01:00", "2026-07-21T01:01"),
        "payload": _wx(H[:3], [0.1, 0.2, 0.4], [50.0, 52.0, 54.0], [5.0, 7.0, 9.0]),
    },
    {
        "name": "empty_payload_is_null_null",
        "window": _win(H[0], H[2]),
        "payload": _wx([], [], [], []),
    },
    {
        "name": "no_hours_inside_window_is_null_null",
        "window": _win(H[0], H[2]),
        "payload": _wx(["2020-01-01T00:00"], [0.1], [50.0], [5.0]),
    },
    {
        # One unparseable stamp is skipped; the rest still aggregate.
        "name": "malformed_timestamp_skipped",
        "window": _win(H[0], H[2]),
        "payload": _wx(
            [H[0], "not-a-time", H[2]], [0.1, 0.2, 0.3], [50.0, 51.0, 52.0], [5.0, 6.0, 7.0]
        ),
    },
    {
        # Metric arrays shorter than times: aggregates see zip-of-shortest;
        # the series is times-driven and pads the missing tail with nulls.
        "name": "short_metric_array_zip_vs_series_padding",
        "window": _win(H[0], H[2]),
        "payload": _wx(H[:3], [0.1, 0.2], [50.0, 52.0, 54.0], [5.0, 7.0, 9.0]),
    },
    {
        # 50.25 and 0.03125 are exactly representable doubles whose averages
        # land on a rounding boundary: Python's round-half-even keeps them at
        # 50.2 / 0.0312 where naive away-from-zero rounding says 50.3 / 0.0313.
        "name": "half_even_rounding_boundary",
        "window": _win(H[0], H[1]),
        "payload": _wx(
            H[:2], [0.03125, 0.03125], [50.25, 50.25], [7.25, 7.25]
        ),
    },
    {
        # The case the boundary vector above cannot reach. 20.1 and 20.2 are the
        # shape a real API returns (one decimal), and their average is
        # 20.1499999999999986, which rounds DOWN. A port that scales by 10 first
        # gets exactly 201.5 out of that multiply, reads a tie that is not there,
        # and answers 20.2. Same for wind. Measured across realistic windows, the
        # class covered ~4% of temperature averages before it was fixed.
        "name": "manufactured_tie_from_decimal_inputs",
        "window": _win(H[0], H[1]),
        "payload": _wx(H[:2], [0.1, 0.2], [20.1, 20.2], [20.1, 20.2]),
    },
    {
        # Negatives, which no other vector carries, and which December supplies
        # daily at altitude. -0.35 rounds toward zero (-0.3) and -69.65 rounds
        # away from it (-69.7): the direction is a property of the true value,
        # not of the sign, so a port that breaks ties on Math.floor alone gets
        # one of these two wrong whichever way it leans.
        "name": "negative_temperatures_round_from_the_true_value",
        "window": _win(H[0], H[1]),
        "payload": _wx(H[:2], [0.0, 0.0], [-0.4, -0.3], [0.0, 0.0]),
    },
    {
        "name": "negative_temperature_rounds_away_from_zero",
        "window": _win(H[0], H[1]),
        "payload": _wx(H[:2], [0.0, 0.0], [-69.6, -69.7], [0.0, 0.0]),
    },
    {
        # Precipitation carries four decimals, so the manufactured tie lands one
        # place deeper: eight hours of two-decimal values averaging to a fifth
        # decimal of 5. 1.77 / 8 = 0.22125.
        "name": "precip_average_manufactured_tie_at_fifth_decimal",
        "window": _win(H8[0], H8[7]),
        "payload": _wx(
            H8,
            [0.05, 0.19, 0.10, 0.22, 0.33, 0.32, 0.28, 0.28],
            [50.0] * 8,
            [5.0] * 8,
        ),
    },
    # ── Elevation-adjusted wind (issue #257) ──────────────────────────────
    # The ISA level heights are 762 / 1457 / 3012 / 4206 / 5574 m; elevations
    # below are in feet, as destinations carry them (× 0.3048 to meters).
    {
        # 8,000 ft = 2438.4 m sits between 850 hPa (1457 m) and 700 hPa
        # (3012 m); the interpolation and its fraction ride the contract, so a
        # port that interpolates in a different order of operations fails here.
        "name": "elevation_interpolates_between_bracketing_levels",
        "window": _win(H[0], H[1]),
        "elevation_ft": 8000.0,
        "payload": _wx(
            H[:2],
            [0.0, 0.1],
            [40.0, 41.0],
            [5.0, 6.0],
            {
                "wind_speed_925hPa": [7.0, 7.0],
                "wind_speed_850hPa": [10.0, 12.0],
                "wind_speed_700hPa": [30.0, 24.0],
                "wind_speed_600hPa": [40.0, 40.0],
                "wind_speed_500hPa": [50.0, 50.0],
            },
        ),
    },
    {
        # 2,000 ft = 609.6 m is under the lowest level: a valley destination
        # is sheltered and keeps the 10 m wind even with level data present.
        "name": "elevation_below_lowest_level_keeps_10m_wind",
        "window": _win(H[0], H[1]),
        "elevation_ft": 2000.0,
        "payload": _wx(
            H[:2],
            [0.0, 0.0],
            [50.0, 50.0],
            [5.0, 6.0],
            {
                "wind_speed_925hPa": [20.0, 20.0],
                "wind_speed_850hPa": [30.0, 30.0],
                "wind_speed_700hPa": [40.0, 40.0],
                "wind_speed_600hPa": [50.0, 50.0],
                "wind_speed_500hPa": [60.0, 60.0],
            },
        ),
    },
    {
        # 20,000 ft = 6096 m is above the top level and clamps to 500 hPa.
        "name": "elevation_above_top_level_clamps_to_500hPa",
        "window": _win(H[0], H[1]),
        "elevation_ft": 20000.0,
        "payload": _wx(
            H[:2],
            [0.0, 0.0],
            [10.0, 10.0],
            [8.0, 8.0],
            {
                "wind_speed_925hPa": [10.0, 10.0],
                "wind_speed_850hPa": [15.0, 15.0],
                "wind_speed_700hPa": [25.0, 25.0],
                "wind_speed_600hPa": [35.0, 35.0],
                "wind_speed_500hPa": [45.0, 47.0],
            },
        ),
    },
    {
        # Free air weaker than the surface keeps the 10 m value: the floor is
        # max(w10, interpolated), because altitude can only add exposure.
        "name": "free_air_weaker_than_10m_keeps_10m_wind",
        "window": _win(H[0], H[1]),
        "elevation_ft": 8000.0,
        "payload": _wx(
            H[:2],
            [0.0, 0.0],
            [30.0, 30.0],
            [18.0, 18.0],
            {
                "wind_speed_925hPa": [2.0, 2.0],
                "wind_speed_850hPa": [3.0, 3.0],
                "wind_speed_700hPa": [4.0, 4.0],
                "wind_speed_600hPa": [5.0, 5.0],
                "wind_speed_500hPa": [6.0, 6.0],
            },
        ),
    },
    {
        # No level arrays at all (the forecast-grid lattice's payload shape,
        # and any model hour the levels are missing for): 10 m wind, and the
        # hour is never dropped.
        "name": "elevation_with_missing_levels_falls_back_to_10m",
        "window": _win(H[0], H[1]),
        "elevation_ft": 8000.0,
        "payload": _wx(H[:2], [0.0, 0.0], [30.0, 30.0], [11.0, 13.0]),
    },
    {
        # A null at ONE bracketing level sends that hour back to 10 m; the
        # neighboring hour with both levels still interpolates.
        "name": "null_bracketing_level_falls_back_that_hour_only",
        "window": _win(H[0], H[1]),
        "elevation_ft": 8000.0,
        "payload": _wx(
            H[:2],
            [0.0, 0.0],
            [30.0, 30.0],
            [5.0, 5.0],
            {
                "wind_speed_925hPa": [7.0, 7.0],
                "wind_speed_850hPa": [None, 10.0],
                "wind_speed_700hPa": [30.0, 30.0],
                "wind_speed_600hPa": [40.0, 40.0],
                "wind_speed_500hPa": [50.0, 50.0],
            },
        ),
    },
    # ── Elevation-adjusted temperature (issue #443) ───────────────────────
    # Same five ISA heights as the wind, and the same fallback rules — with one
    # difference that every vector here exists to pin: there is NO floor, so a
    # free air COLDER than the 2 m reading is reported as it stands.
    {
        # 8,000 ft = 2438.4 m between 850 hPa (1457 m) and 700 hPa (3012 m).
        # The 2 m value is the radiatively cooled one this issue is about: it
        # reads 25.0 where the interpolated free air is above freezing.
        "name": "temperature_interpolates_between_bracketing_levels",
        "window": _win(H[0], H[1]),
        "elevation_ft": 8000.0,
        "payload": _wx(
            H[:2],
            [0.0, 0.0],
            [25.0, 27.0],
            [5.0, 5.0],
            {
                "temperature_925hPa": [55.0, 55.0],
                "temperature_850hPa": [48.0, 50.0],
                "temperature_700hPa": [38.0, 36.0],
                "temperature_600hPa": [28.0, 28.0],
                "temperature_500hPa": [14.0, 14.0],
            },
        ),
    },
    {
        # Free air COLDER than the 2 m reading is kept, which is the whole of
        # what "no floor" means: the wind vector above would have clamped it.
        "name": "temperature_free_air_colder_than_2m_is_kept",
        "window": _win(H[0], H[1]),
        "elevation_ft": 8000.0,
        "payload": _wx(
            H[:2],
            [0.0, 0.0],
            [60.0, 60.0],
            [5.0, 5.0],
            {
                "temperature_925hPa": [50.0, 50.0],
                "temperature_850hPa": [44.0, 44.0],
                "temperature_700hPa": [30.0, 30.0],
                "temperature_600hPa": [20.0, 20.0],
                "temperature_500hPa": [10.0, 10.0],
            },
        ),
    },
    {
        # 2,000 ft = 609.6 m is under the lowest level: a valley destination IS
        # its own surface layer, so the 2 m value stands.
        "name": "temperature_below_lowest_level_keeps_2m",
        "window": _win(H[0], H[1]),
        "elevation_ft": 2000.0,
        "payload": _wx(
            H[:2],
            [0.0, 0.0],
            [25.0, 26.0],
            [5.0, 5.0],
            {
                "temperature_925hPa": [55.0, 55.0],
                "temperature_850hPa": [48.0, 48.0],
                "temperature_700hPa": [38.0, 38.0],
                "temperature_600hPa": [28.0, 28.0],
                "temperature_500hPa": [14.0, 14.0],
            },
        ),
    },
    {
        # 20,000 ft = 6096 m is above the top level and clamps to 500 hPa.
        "name": "temperature_above_top_level_clamps_to_500hPa",
        "window": _win(H[0], H[1]),
        "elevation_ft": 20000.0,
        "payload": _wx(
            H[:2],
            [0.0, 0.0],
            [40.0, 40.0],
            [5.0, 5.0],
            {
                "temperature_925hPa": [55.0, 55.0],
                "temperature_850hPa": [48.0, 48.0],
                "temperature_700hPa": [38.0, 38.0],
                "temperature_600hPa": [28.0, 28.0],
                "temperature_500hPa": [-1.2, -3.4],
            },
        ),
    },
    {
        # A null at ONE bracketing level sends that hour back to the 2 m value
        # and does NOT drop it; the neighbouring hour still interpolates.
        "name": "temperature_null_bracketing_level_falls_back_that_hour_only",
        "window": _win(H[0], H[1]),
        "elevation_ft": 8000.0,
        "payload": _wx(
            H[:2],
            [0.0, 0.0],
            [25.0, 25.0],
            [5.0, 5.0],
            {
                "temperature_925hPa": [55.0, 55.0],
                "temperature_850hPa": [None, 48.0],
                "temperature_700hPa": [38.0, 38.0],
                "temperature_600hPa": [28.0, 28.0],
                "temperature_500hPa": [14.0, 14.0],
            },
        ),
    },
    {
        # The archive shape: every level null for every hour, which is what the
        # archive endpoint answers (measured 2026-09-16). Every figure must come
        # back exactly as the same payload with no levels at all produces it.
        "name": "temperature_all_levels_null_is_the_archive_fallback",
        "window": _win(H[0], H[1]),
        "elevation_ft": 8000.0,
        "payload": _wx(
            H[:2],
            [0.0, 0.0],
            [25.0, 27.0],
            [5.0, 5.0],
            {
                "temperature_925hPa": [None, None],
                "temperature_850hPa": [None, None],
                "temperature_700hPa": [None, None],
                "temperature_600hPa": [None, None],
                "temperature_500hPa": [None, None],
            },
        ),
    },
    {
        # No elevation at all, with every level present: the 2 m value stands,
        # because nothing says which level to read.
        "name": "temperature_no_elevation_keeps_2m",
        "window": _win(H[0], H[1]),
        "payload": _wx(
            H[:2],
            [0.0, 0.0],
            [25.0, 27.0],
            [5.0, 5.0],
            {
                "temperature_925hPa": [55.0, 55.0],
                "temperature_850hPa": [48.0, 50.0],
                "temperature_700hPa": [38.0, 36.0],
                "temperature_600hPa": [28.0, 28.0],
                "temperature_500hPa": [14.0, 14.0],
            },
        ),
    },
    {
        # Wind and temperature levels in ONE payload, which is the only shape a
        # real response has: the two interpolations read their own five arrays
        # and neither reaches into the other's.
        "name": "wind_and_temperature_levels_together",
        "window": _win(H[0], H[1]),
        "elevation_ft": 9000.0,
        "payload": _wx(
            H[:2],
            [0.0, 0.05],
            [25.2, 26.4],
            [5.0, 6.0],
            {
                "wind_speed_925hPa": [7.0, 7.0],
                "wind_speed_850hPa": [10.0, 12.0],
                "wind_speed_700hPa": [30.0, 24.0],
                "wind_speed_600hPa": [40.0, 40.0],
                "wind_speed_500hPa": [50.0, 50.0],
                "temperature_925hPa": [56.0, 56.0],
                "temperature_850hPa": [47.4, 48.1],
                "temperature_700hPa": [27.6, 29.0],
                "temperature_600hPa": [15.4, 16.1],
                "temperature_500hPa": [-1.2, -0.8],
            },
        ),
    },
    # ── Freezing level (issue #295) ───────────────────────────────────────
    # Every vector above omits the variable, which is the shape the five
    # models that do not publish it return; these cover the three that do.
    # Inputs are heights above sea level in the unit each payload declares:
    # Open-Meteo's unit for this variable follows `precipitation_unit`, so both
    # branches are pinned here rather than one being assumed.
    {
        # 3,000 m is 9842.519685… ft, so the conversion and the whole-foot
        # rounding both ride the contract.
        "name": "freezing_level_converts_meters_to_feet",
        "window": _win(H[0], H[2]),
        "payload": _wx(
            H[:3],
            [0.0, 0.0, 0.0],
            [30.0, 31.0, 32.0],
            [5.0, 5.0, 5.0],
            freeze=[3000.0, 3100.0, 3050.0],
        ),
    },
    {
        # The unit every Bluebird Forecast request actually gets, because they
        # all send `precipitation_unit=inch`: feet, passed through with no
        # conversion at all. The values are one Rainier hour as Open-Meteo
        # quotes them (three decimals, measured 2026-09-13); a port that
        # divided them by 0.3048 anyway would answer more than three times as
        # high, which is why this branch is a vector rather than a comment.
        "name": "freezing_level_in_feet_is_not_converted",
        "window": _win(H[0], H[2]),
        "payload": _wx(
            H[:3],
            [0.0, 0.0, 0.0],
            [30.0, 31.0, 32.0],
            [5.0, 5.0, 5.0],
            freeze=[8398.95, 8727.034, 8562.992],
            freeze_unit="ft",
        ),
    },
    {
        # The five-model shape, stated rather than implied: a column of nulls
        # nulls the three freeze aggregates and leaves every other figure
        # exactly as the same payload without the variable produces it.
        "name": "freezing_level_all_null_leaves_the_other_metrics",
        "window": _win(H[0], H[2]),
        "payload": _wx(
            H[:3],
            [0.1, 0.2, 0.0],
            [50.0, 52.0, 54.0],
            [5.0, 7.0, 9.0],
            freeze=[None, None, None],
        ),
    },
    {
        # One null hour is skipped by the aggregates and kept by the series —
        # and, unlike the core metrics, does not drop the hour.
        "name": "freezing_level_null_hour_skipped_not_dropped",
        "window": _win(H[0], H[2]),
        "payload": _wx(
            H[:3],
            [0.1, 0.2, 0.3],
            [50.0, 52.0, 54.0],
            [5.0, 7.0, 9.0],
            freeze=[2000.0, None, 2200.0],
        ),
    },
    {
        # Open-Meteo clamps to 0.0 when the whole column is below freezing:
        # that is a reading, not a gap, so the aggregates must be 0.0 rather
        # than null.
        "name": "freezing_level_zero_is_a_value_not_a_gap",
        "window": _win(H[0], H[1]),
        "payload": _wx(H[:2], [0.0, 0.0], [10.0, 11.0], [5.0, 5.0], freeze=[0.0, 0.0]),
    },
    {
        # 0.1524 m and 0.4572 m are half a foot and one and a half feet: both
        # land on a rounding tie, and half-even sends them to 0 and 2.
        "name": "freezing_level_half_even_at_whole_feet",
        "window": _win(H[0], H[1]),
        "payload": _wx(
            H[:2], [0.0, 0.0], [10.0, 11.0], [5.0, 5.0], freeze=[0.1524, 0.4572]
        ),
    },
    {
        # Shorter than times: the aggregates zip to the shortest and the
        # series pads with nulls, the same asymmetry the core metrics keep.
        "name": "freezing_level_short_array_zip_vs_series_padding",
        "window": _win(H[0], H[2]),
        "payload": _wx(
            H[:3],
            [0.1, 0.2, 0.3],
            [50.0, 52.0, 54.0],
            [5.0, 7.0, 9.0],
            freeze=[1500.0],
        ),
    },
]

def _cl(times, cover, rh2m, t2m, td2m, levels=None, units=None) -> dict:
    """A cloud payload (issue #117): cloud cover, the 2 m humidity pair and the
    2 m temperature in Celsius, and `levels` mapping `relative_humidity_{p}hPa`
    names to hourly arrays. `units` is the payload's `hourly_units`, which only
    the archive case sets: it answers the levels it does not serve with the
    unit `undefined`."""
    hourly = {
        "time": times,
        "cloud_cover": cover,
        "relative_humidity_2m": rh2m,
        "temperature_2m": t2m,
        "dew_point_2m": td2m,
    }
    if levels:
        hourly.update(levels)
    payload: dict = {"hourly": hourly}
    if units is not None:
        payload["hourly_units"] = units
    return payload


def _rh(**by_level) -> dict:
    """`_rh(p850=[...])` as `{"relative_humidity_850hPa": [...]}`."""
    return {f"relative_humidity_{k[1:]}hPa": v for k, v in by_level.items()}


_ALL_LEVELS = (1000, 925, 850, 700, 600, 500, 400, 300)

CLOUD_INPUTS = [
    {
        # The 2 m point is saturated at every hour: the destination is in
        # cloud, so the base is its own elevation whatever the levels say.
        "name": "in_cloud_at_2m_is_the_destination_elevation",
        "window": _win(H[0], H[2]),
        "elevation_ft": 5000.0,
        "payload": _cl(
            H[:3],
            [100, 95, 90],
            [97.0, 95.0, 99.0],
            [2.0, 2.0, 2.0],
            [1.5, 1.2, 1.9],
            _rh(p850=[40.0, 40.0, 40.0], p700=[30.0, 30.0, 30.0]),
        ),
    },
    {
        # 4,000 ft is 1219.2 m. The 2 m point and 850 hPa are dry, 700 hPa is
        # saturated, so the base lies between 1457 m and 3012 m where the
        # humidity crosses 95 %. Three different crossings, so the three
        # aggregates differ.
        "name": "interpolated_between_the_bracketing_levels",
        "window": _win(H[0], H[2]),
        "elevation_ft": 4000.0,
        "payload": _cl(
            H[:3],
            [80, 85.5, 72],
            [70.0, 75.0, 72.0],
            [8.0, 8.0, 8.0],
            [3.0, 3.0, 3.0],
            _rh(
                p1000=[20.0, 20.0, 20.0],
                p925=[20.0, 20.0, 20.0],
                p850=[80.0, 90.0, 94.0],
                p700=[99.0, 100.0, 95.0],
                p600=[100.0, 100.0, 100.0],
            ),
        ),
    },
    {
        # 8,000 ft is 2438.4 m, above 1000, 925 and 850 hPa. Those three are
        # saturated (a valley fog) and must be skipped: the base is read from
        # the 2 m point up, between 700 hPa (dry) and 600 hPa (saturated).
        "name": "levels_below_the_destination_are_skipped",
        "window": _win(H[0], H[1]),
        "elevation_ft": 8000.0,
        "payload": _cl(
            H[:2],
            [60, 65],
            [50.0, 55.0],
            [-2.0, -2.0],
            [-9.0, -9.0],
            _rh(
                p1000=[100.0, 100.0],
                p925=[100.0, 100.0],
                p850=[100.0, 100.0],
                p700=[60.0, 70.0],
                p600=[96.0, 98.0],
            ),
        ),
    },
    {
        # Nothing saturated anywhere in the column: the base falls back to
        # the destination's own parcel base, 125 m per degree of spread.
        # Spreads of 8, 12.5 and 0 degrees; the last is a saturated parcel
        # under a dry column, which puts the base at the destination.
        "name": "dry_column_falls_back_to_the_parcel_base",
        "window": _win(H[0], H[2]),
        "elevation_ft": 6000.0,
        "payload": _cl(
            H[:3],
            [0, 5, 10],
            [60.0, 50.0, 90.0],
            [10.0, 15.0, 4.0],
            [2.0, 2.5, 4.0],
            _rh(**{f"p{p}": [30.0, 30.0, 30.0] for p in _ALL_LEVELS}),
        ),
    },
    {
        # No level variable at all: the column did not answer, so the base
        # is null at every hour even with a saturated 2 m point, and the
        # cloud cover still aggregates on its own.
        "name": "no_level_answered_is_a_null_base",
        "window": _win(H[0], H[2]),
        "elevation_ft": 5000.0,
        "payload": _cl(H[:3], [40, 50, 70], [99.0, 60.0, 60.0], [5.0, 5.0, 5.0], [4.0, 1.0, 1.0]),
    },
    {
        # The archive shape: every level accepted and answered null under the
        # unit `undefined`. The base is null, the cover is served, and the
        # 2 m pair is not enough to stand in for a column.
        "name": "archive_undefined_levels_null_base_cover_served",
        "window": _win(H[0], H[1]),
        "elevation_ft": 5000.0,
        "payload": _cl(
            H[:2],
            [20, 30],
            [60.0, 60.0],
            [5.0, 5.0],
            [1.0, 1.0],
            _rh(**{f"p{p}": [None, None] for p in _ALL_LEVELS}),
            units={
                "cloud_cover": "%",
                "relative_humidity_2m": "%",
                "temperature_2m": "°C",
                "dew_point_2m": "°C",
                **{f"relative_humidity_{p}hPa": "undefined" for p in _ALL_LEVELS},
            },
        ),
    },
    {
        # 3,000 ft is 914.4 m. 850 hPa is null, so the walk spans the gap it
        # leaves: the base is interpolated between the 2 m point and 700 hPa.
        "name": "null_level_mid_column_is_spanned",
        "window": _win(H[0], H[0]),
        "elevation_ft": 3000.0,
        "payload": _cl(
            H[:1],
            [90],
            [60.0],
            [6.0],
            [0.0],
            _rh(p1000=[20.0], p925=[20.0], p850=[None], p700=[99.0]),
        ),
    },
    {
        # A destination with no known elevation: the walk has nowhere to
        # start, so the base is null while the cover aggregates.
        "name": "no_elevation_is_a_null_base",
        "window": _win(H[0], H[1]),
        "payload": _cl(
            H[:2],
            [10, 11],
            [99.0, 99.0],
            [5.0, 5.0],
            [5.0, 5.0],
            _rh(p850=[99.0, 99.0]),
        ),
    },
    {
        # A null hour of cover and a null 2 m point: each quantity drops only
        # its own null hour, and the series keeps every hour.
        "name": "each_quantity_drops_only_its_own_null_hours",
        "window": _win(H[0], H[2]),
        "elevation_ft": 2000.0,
        "payload": _cl(
            H[:3],
            [25, None, 75],
            [None, 99.0, 50.0],
            [5.0, 5.0, None],
            [1.0, 1.0, 1.0],
            _rh(p925=[99.0, 50.0, 50.0], p850=[99.0, 50.0, 50.0]),
        ),
    },
    {
        "name": "empty_payload_is_null_null",
        "window": _win(H[0], H[2]),
        "elevation_ft": 5000.0,
        "payload": _cl([], [], [], [], []),
    },
]

AQI_INPUTS = [
    {
        "name": "simple_aggregation",
        "window": _win(H[0], H[2]),
        "payload": _aq(H[:3], [80, 90, 100]),
    },
    {
        "name": "half_even_80_5_rounds_down_to_even",
        "window": _win(H[0], H[1]),
        "payload": _aq(H[:2], [80, 81]),
    },
    {
        "name": "half_even_81_5_rounds_up_to_even",
        "window": _win(H[0], H[1]),
        "payload": _aq(H[:2], [81, 82]),
    },
    {
        "name": "nulls_skipped_in_metrics_kept_in_series",
        "window": _win(H[0], H[2]),
        "payload": _aq(H[:3], [80, None, 100]),
    },
    {
        "name": "all_null_metrics_null_series_kept",
        "window": _win(H[0], H[1]),
        "payload": _aq(H[:2], [None, None]),
    },
    {
        "name": "empty_payload_is_null_null",
        "window": _win(H[0], H[2]),
        "payload": _aq([], []),
    },
]


def _parse(s: str) -> datetime:
    return datetime.fromisoformat(s)


def main() -> None:
    weather_cases = []
    for case in WEATHER_INPUTS:
        start, end = _parse(case["window"]["start"]), _parse(case["window"]["end"])
        elevation_ft = case.get("elevation_ft")
        weather_cases.append(
            {
                **case,
                "expected_metrics": aggregation._weather_metrics(
                    case["payload"], start, end, elevation_ft
                ),
                "expected_series": aggregation._weather_series(
                    case["payload"], start, end, elevation_ft
                ),
            }
        )

    cloud_cases = []
    for case in CLOUD_INPUTS:
        start, end = _parse(case["window"]["start"]), _parse(case["window"]["end"])
        elevation_ft = case.get("elevation_ft")
        cloud_cases.append(
            {
                **case,
                "expected_metrics": aggregation._cloud_metrics(
                    case["payload"], start, end, elevation_ft
                ),
                "expected_series": aggregation._cloud_series(
                    case["payload"], start, end, elevation_ft
                ),
            }
        )

    aqi_cases = []
    for case in AQI_INPUTS:
        start, end = _parse(case["window"]["start"]), _parse(case["window"]["end"])
        aqi_cases.append(
            {
                **case,
                "expected_metrics": aggregation._aqi_metrics(case["payload"], start, end),
                "expected_series": aggregation._aqi_series(case["payload"], start, end),
            }
        )

    # The AQI-onto-weather-grid alignment (analyze._aligned_aqi): a shorter
    # AQI series nulls out past its horizon; no series nulls out entirely.
    grid = [1784592000000, 1784595600000, 1784599200000]
    align_inputs = [
        {"name": "shorter_series_nulls_past_horizon", "times_ms": grid,
         "aqi_series": {"times": grid[:2], "aqi": [80, 90]}},
        {"name": "missing_series_is_all_nulls", "times_ms": grid, "aqi_series": None},
        {"name": "exact_cover", "times_ms": grid,
         "aqi_series": {"times": grid, "aqi": [80, None, 100]}},
    ]
    align_cases = [
        {**case, "expected": _aligned_aqi(case["times_ms"], case["aqi_series"])}
        for case in align_inputs
    ]

    out = {
        "_generated_by": "backend/scripts/generate_weather_vectors.py — do not hand-edit",
        "weather": weather_cases,
        "aqi": aqi_cases,
        "align": align_cases,
        "cloud": cloud_cases,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
