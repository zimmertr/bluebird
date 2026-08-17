"""Regenerate the shared weather/AQI aggregation test vectors.

The TypeScript port in `frontend/src/utils/openMeteo.ts` must produce
byte-identical aggregates to the backend, or the browser and the API would
rank the same forecast differently. These vectors are the contract: inputs
are authored here, expected outputs are computed by the backend
implementation (the reference), and the committed file is asserted by BOTH
test suites — pytest proves Python still reproduces it (so an aggregation
change forces a regeneration, making the contract change visible in review),
Vitest proves the TypeScript port matches it, and CI diffs the two committed
copies so they cannot drift apart.

The inputs deliberately include the cross-language traps: Python's
round-half-even at exactly representable boundaries (x.25 / x.5 values),
zip-stops-at-shortest arrays, times-driven series padding, malformed
timestamps, and windows containing no hours.

Run:
    cd backend && python scripts/generate_weather_vectors.py
    cp tests/data/weather_vectors.json ../frontend/src/utils/weather_vectors.json
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.routes.analyze import _aligned_aqi
from app.services import air_quality, weather

OUT = Path(__file__).parent.parent / "tests" / "data" / "weather_vectors.json"

H = [f"2026-07-21T{h:02d}:00" for h in range(6)]  # a fixed UTC day, hourly
H8 = [f"2026-07-21T{h:02d}:00" for h in range(8)]  # eight hours: /8 terminates,
# which is what lets an average of two-decimal inputs land on a fifth decimal.


def _win(start: str, end: str) -> dict[str, str]:
    return {"start": start, "end": end}


def _wx(times, precip, temp, wind) -> dict:
    return {
        "hourly": {
            "time": times,
            "precipitation": precip,
            "temperature_2m": temp,
            "wind_speed_10m": wind,
        }
    }


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
        weather_cases.append(
            {
                **case,
                "expected_metrics": weather._metrics(case["payload"], start, end),
                "expected_series": weather._series(case["payload"], start, end),
            }
        )

    aqi_cases = []
    for case in AQI_INPUTS:
        start, end = _parse(case["window"]["start"]), _parse(case["window"]["end"])
        aqi_cases.append(
            {
                **case,
                "expected_metrics": air_quality._metrics(case["payload"], start, end),
                "expected_series": air_quality._series(case["payload"], start, end),
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
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2) + "\n")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
