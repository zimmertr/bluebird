"""Open-Meteo weighted-call accounting (issue #180).

The formula is the contract everything else paces against, so its floors and
factors are pinned here: getting a floor wrong is exactly the 50x accounting
error that caused the incident.
"""

from __future__ import annotations

from datetime import date

import pytest
from app.services.openmeteo_weight import call_weight


def test_short_window_few_variables_floors_to_per_location():
    # 50 locations, 1 day, 3 variables: floorless math would say ~1.07 calls;
    # observed enforcement says 50. The floors are load-bearing.
    assert call_weight(50, date(2026, 7, 29), date(2026, 7, 29), 3) == 50


def test_incident_shape_two_endpoints():
    # The 2026-07-29 incident: 908 destinations, 4-day window. Weather (3
    # vars) and AQI (1 var) each cost one call per location.
    weather = call_weight(908, date(2026, 7, 29), date(2026, 8, 1), 3)
    aqi = call_weight(908, date(2026, 7, 29), date(2026, 8, 1), 1)
    assert weather == 908
    assert aqi == 908


def test_long_window_scales_by_days_over_14():
    # A 16-day window costs 16/14 per location — the full-horizon worst case.
    w = call_weight(50, date(2026, 7, 1), date(2026, 7, 16), 3)
    assert w == 50 * (16 / 14)


def test_many_variables_scale_over_10():
    assert call_weight(10, date(2026, 7, 29), date(2026, 7, 29), 15) == 10 * 1.5


def test_inverted_or_same_day_never_below_one_day():
    assert call_weight(1, date(2026, 7, 29), date(2026, 7, 29), 3) == 1


def test_models_multiply_the_variable_count():
    # A request naming N models returns N series per variable, so it costs the
    # same as one model with N times the variables (issue #232). Today's eight
    # weather variables across three models is 24 series: factor 2.4.
    one_day = (date(2026, 7, 29), date(2026, 7, 29))
    assert call_weight(10, *one_day, 8, n_models=3) == call_weight(10, *one_day, 24)
    assert call_weight(10, *one_day, 8, n_models=3) == 10 * 2.4


def test_three_models_at_three_variables_still_floors_to_one():
    # The measurement behind the issue's three-model cap: 3 x 3 = 9 series is
    # still under the floor, so comparing three models costs what one does.
    assert call_weight(50, date(2026, 7, 29), date(2026, 7, 29), 3, n_models=3) == 50


@pytest.mark.parametrize(
    ("n_models", "factor"),
    [(1, 1.0), (2, 1.0), (3, 1.0), (4, 1.2), (5, 1.5), (8, 2.4)],
)
def test_model_cost_table_at_three_variables(n_models: int, factor: float):
    # The cost table measured in issue #232, at the three variables it used.
    weight = call_weight(100, date(2026, 7, 29), date(2026, 7, 29), 3, n_models=n_models)
    assert weight == pytest.approx(100 * factor)


def test_model_count_defaults_to_one():
    # Every caller that names one model may leave the argument off, and the
    # answer must not move for any of them.
    args = (908, date(2026, 7, 29), date(2026, 8, 1), 3)
    assert call_weight(*args) == call_weight(*args, n_models=1) == 908
