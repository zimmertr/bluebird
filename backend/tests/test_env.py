"""The env readers' one posture: unset or unreadable takes the default, and logs."""

from __future__ import annotations

import logging

import pytest

from app.env import env_int, env_url

_DEFAULT = "https://upstream.example/v1/thing"


def test_env_int_reads_an_integer_and_falls_back_on_anything_else(monkeypatch, caplog):
    monkeypatch.setenv("SOME_KNOB", "7")
    assert env_int("SOME_KNOB", 3) == 7
    monkeypatch.setenv("SOME_KNOB", "seven")
    with caplog.at_level(logging.WARNING, logger="app.env"):
        assert env_int("SOME_KNOB", 3) == 3
    assert "SOME_KNOB" in caplog.text


def test_env_url_unset_takes_the_default(monkeypatch, caplog):
    monkeypatch.delenv("SOME_URL", raising=False)
    with caplog.at_level(logging.WARNING, logger="app.env"):
        assert env_url("SOME_URL", _DEFAULT) == _DEFAULT
    assert not caplog.records


@pytest.mark.parametrize(
    "value",
    [
        "http://localhost:8080/open-meteo/v1/forecast",
        "https://sim.example/",
        # Returned as set: a caller appends its own paths, so a trailing slash
        # is the caller's business and trimming it would change the base.
        "http://sim:8080/usfs/",
    ],
)
def test_env_url_takes_a_url_exactly_as_set(monkeypatch, value):
    monkeypatch.setenv("SOME_URL", value)
    assert env_url("SOME_URL", _DEFAULT) == value


@pytest.mark.parametrize("value", ["", "localhost:8080", "ftp://sim.example", " https://lead.space"])
def test_env_url_warns_on_a_non_url_and_takes_the_default(monkeypatch, caplog, value):
    monkeypatch.setenv("SOME_URL", value)
    with caplog.at_level(logging.WARNING, logger="app.env"):
        assert env_url("SOME_URL", _DEFAULT) == _DEFAULT
    assert "SOME_URL" in caplog.text
