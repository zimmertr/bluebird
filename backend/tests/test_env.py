"""The one reader of a numeric env knob (`app/env.py`).

The rate-limit knobs are read at import, so `test_ratelimit.py` checks them in
a fresh interpreter, where coverage cannot see this module run.
"""

from __future__ import annotations

import logging

import pytest

from app.env import env_int


def test_an_unset_knob_takes_its_default(monkeypatch):
    monkeypatch.delenv("BLUEBIRD_FORECAST_TEST_KNOB", raising=False)
    assert env_int("BLUEBIRD_FORECAST_TEST_KNOB", 7) == 7


def test_a_set_knob_is_read_as_an_integer(monkeypatch):
    monkeypatch.setenv("BLUEBIRD_FORECAST_TEST_KNOB", "42")
    assert env_int("BLUEBIRD_FORECAST_TEST_KNOB", 7) == 42


@pytest.mark.parametrize("raw", ["", "1.5", "twelve"])
def test_a_knob_that_is_not_an_integer_is_logged_and_takes_its_default(monkeypatch, caplog, raw):
    monkeypatch.setenv("BLUEBIRD_FORECAST_TEST_KNOB", raw)
    with caplog.at_level(logging.WARNING, logger="app.env"):
        assert env_int("BLUEBIRD_FORECAST_TEST_KNOB", 7) == 7
    assert f"BLUEBIRD_FORECAST_TEST_KNOB={raw!r}" in caplog.text
