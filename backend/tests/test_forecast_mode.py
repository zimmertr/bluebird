from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from app.models import AnalyzeRequest, ForecastMode
from pydantic import ValidationError


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _request(**overrides) -> AnalyzeRequest:
    base = {
        "destination_types": [],
        "custom_destinations": [{"name": "X", "latitude": 47.0, "longitude": -121.0}],
    }
    base.update(overrides)
    return AnalyzeRequest(**base)


# ── the three modes ────────────────────────────────────────────────────────


def test_current_needs_no_timestamps():
    request = _request(forecast_mode="current")
    assert request.forecast_mode is ForecastMode.current
    # Normalized to the single hour containing now.
    assert request.end_datetime - request.start_datetime == timedelta(minutes=1)
    assert request.start_datetime.minute == 0


def test_at_samples_the_hour_containing_its_moment():
    moment = _now() + timedelta(days=2)
    request = _request(forecast_mode="at", start_datetime=moment)
    assert request.end_datetime - request.start_datetime == timedelta(minutes=1)
    assert request.start_datetime.hour == moment.hour


def test_at_accepts_a_moment_in_the_past():
    # The reason this mode is not called "future": the weather API serves
    # roughly 90 days of history, so a backdated sample is legitimate.
    request = _request(forecast_mode="at", start_datetime=_now() - timedelta(days=30))
    assert request.forecast_mode is ForecastMode.at


def test_window_keeps_the_span_it_was_given():
    start = _now()
    request = _request(
        forecast_mode="window", start_datetime=start, end_datetime=start + timedelta(days=1)
    )
    assert request.end_datetime - request.start_datetime == timedelta(days=1)


# ── each mode rejects the fields that do not belong to it ──────────────────


@pytest.mark.parametrize("field", ["start_datetime", "end_datetime"])
def test_current_rejects_any_timestamp(field):
    with pytest.raises(ValidationError, match="takes no timestamps"):
        _request(forecast_mode="current", **{field: _now()})


def test_at_rejects_an_end_datetime():
    now = _now()
    with pytest.raises(ValidationError, match="takes no end_datetime"):
        _request(forecast_mode="at", start_datetime=now, end_datetime=now)


def test_at_requires_a_start_datetime():
    with pytest.raises(ValidationError, match="requires start_datetime"):
        _request(forecast_mode="at")


@pytest.mark.parametrize("supplied", [{}, {"start_datetime": True}, {"end_datetime": True}])
def test_window_requires_both_timestamps(supplied):
    kwargs = {name: _now() for name in supplied}
    with pytest.raises(ValidationError, match="requires both"):
        _request(forecast_mode="window", **kwargs)


# ── inference when the mode is omitted ─────────────────────────────────────


def test_both_timestamps_infer_a_window():
    # Every caller predating forecast_mode sends exactly this, so it has to
    # keep meaning what it always meant.
    start = _now()
    request = _request(start_datetime=start, end_datetime=start + timedelta(days=1))
    assert request.forecast_mode is ForecastMode.window
    assert request.end_datetime - request.start_datetime == timedelta(days=1)


def test_no_timestamps_infer_current():
    assert _request().forecast_mode is ForecastMode.current


@pytest.mark.parametrize("field", ["start_datetime", "end_datetime"])
def test_one_timestamp_without_a_mode_is_refused(field):
    # The defect the discriminator exists to remove: guessing here would let a
    # window missing its end collapse silently into a one-hour sample.
    with pytest.raises(ValidationError, match="Ambiguous request"):
        _request(**{field: _now()})


# ── the horizon checks still apply after resolution ────────────────────────


def test_resolved_window_is_still_horizon_checked():
    with pytest.raises(ValidationError, match="forecast horizon"):
        _request(forecast_mode="at", start_datetime=_now() + timedelta(days=365))
