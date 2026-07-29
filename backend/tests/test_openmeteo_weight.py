"""Open-Meteo weighted-call accounting (issue #180).

The formula is the contract everything else paces against, so its floors and
factors are pinned here: getting a floor wrong is exactly the 50x accounting
error that caused the incident.
"""

from __future__ import annotations

from datetime import date

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
