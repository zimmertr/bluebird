"""The backend half of the shared-vector contract.

`tests/data/weather_vectors.json` pins the aggregation semantics that the
TypeScript port in the frontend must reproduce exactly. This suite asserts
the backend still produces the committed expectations, so any change to the
aggregation code forces a visible regeneration
(`python scripts/generate_weather_vectors.py`) in the same PR — and the
frontend copy (CI-diffed against this one) drags the port along with it.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import pytest
from app.routes.analyze import _aligned_aqi
from app.services import air_quality, weather

VECTORS = json.loads(
    (Path(__file__).parent / "data" / "weather_vectors.json").read_text()
)


def _window(case: dict) -> tuple[datetime, datetime]:
    return (
        datetime.fromisoformat(case["window"]["start"]),
        datetime.fromisoformat(case["window"]["end"]),
    )


@pytest.mark.parametrize("case", VECTORS["weather"], ids=lambda c: c["name"])
def test_weather_reference_reproduces_vectors(case):
    start, end = _window(case)
    assert weather._metrics(case["payload"], start, end) == case["expected_metrics"]
    assert weather._series(case["payload"], start, end) == case["expected_series"]


@pytest.mark.parametrize("case", VECTORS["aqi"], ids=lambda c: c["name"])
def test_aqi_reference_reproduces_vectors(case):
    start, end = _window(case)
    assert air_quality._metrics(case["payload"], start, end) == case["expected_metrics"]
    assert air_quality._series(case["payload"], start, end) == case["expected_series"]


@pytest.mark.parametrize("case", VECTORS["align"], ids=lambda c: c["name"])
def test_align_reference_reproduces_vectors(case):
    assert _aligned_aqi(case["times_ms"], case["aqi_series"]) == case["expected"]
