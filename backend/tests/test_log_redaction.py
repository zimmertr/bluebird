"""Every record the server writes passes one redacting formatter (#626).

`redacted_error` cleans the lines that call it. A traceback is not one of
them: an exception raised while an `HTTPStatusError` is being handled chains
it, and the traceback prints its text, which is the keyed request URL. So the
key is masked, and terminal control characters escaped, on the whole formatted
record at the root handler, which every logger here propagates to.
"""

from __future__ import annotations

import logging
import os
import subprocess
import sys
from pathlib import Path

import httpx
import pytest
from conftest import FAKE_API_KEY

from app.log_redaction import RedactingFormatter, clean

BACKEND = Path(__file__).resolve().parent.parent

# Run in a fresh interpreter because the wiring under test happens at import,
# in the order the production CMD (`uvicorn app.main:app`) does it: uvicorn
# applies its own logging config, then imports the app. Under pytest the root
# logger already carries pytest's handlers, so `basicConfig` in main.py would
# install nothing and the test would be checking pytest's formatter.
_SERVE_ONE_ERROR_AND_ONE_PATH = r"""
import logging.config, sys
import httpx
from uvicorn.config import LOGGING_CONFIG

logging.config.dictConfig(LOGGING_CONFIG)
from app.main import app
from fastapi.testclient import TestClient

key = sys.argv[1]
url = "https://customer-api.open-meteo.com/v1/forecast"
request = httpx.Request("GET", url, params={"latitude": 47.0, "apikey": key})
answer = httpx.Response(400, json={"error": True, "reason": 123}, request=request)
try:
    try:
        answer.raise_for_status()
    except httpx.HTTPStatusError:
        # Anything raised here chains the refusal, whose text is its URL.
        raise TypeError("expected string or bytes-like object, got 'int'")
except TypeError as exc:
    # What uvicorn's protocol does with an exception no handler took.
    logging.getLogger("uvicorn.error").error("Exception in ASGI application", exc_info=exc)

# The access log prints the decoded path, and %1B decodes to ESC.
TestClient(app).get("/api/%1B[2Jnot-a-route")
"""


@pytest.fixture(scope="module")
def served_log() -> str:
    run = subprocess.run(
        [sys.executable, "-c", _SERVE_ONE_ERROR_AND_ONE_PATH, FAKE_API_KEY],
        cwd=BACKEND,
        env={**os.environ, "LOG_LEVEL": "INFO", "PYTHONPATH": str(BACKEND)},
        capture_output=True,
        text=True,
        timeout=60,
        check=True,
    )
    return run.stderr


def test_a_chained_traceback_through_uvicorns_logger_carries_no_key(served_log):
    assert "Exception in ASGI application" in served_log
    assert "HTTPStatusError" in served_log, "the chained refusal was not printed"
    encoded = str(httpx.QueryParams({"apikey": FAKE_API_KEY})).removeprefix("apikey=")
    for form in (FAKE_API_KEY, encoded):
        assert form not in served_log
    assert "apikey=[redacted]" in served_log


def test_a_control_character_in_a_logged_path_is_escaped(served_log):
    assert "\x1b" not in served_log
    assert "/api/\\x1b[2Jnot-a-route" in served_log


# ── the formatter itself ───────────────────────────────────────────────────


def test_a_traceback_is_masked_whatever_logger_holds_it():
    request = httpx.Request("GET", "https://stub.invalid", params={"apikey": FAKE_API_KEY})
    try:
        raise httpx.HTTPStatusError(f"refused {request.url}", request=request, response=None)  # type: ignore[arg-type]
    except httpx.HTTPStatusError:
        record = logging.makeLogRecord(
            {"name": "any.logger", "levelno": logging.ERROR, "msg": "failed", "exc_info": sys.exc_info()}
        )
    text = RedactingFormatter("%(message)s").format(record)
    assert "Traceback" in text
    assert "not%2Ba" not in text
    assert "apikey=[redacted]" in text


def test_newline_and_tab_survive_because_a_traceback_is_made_of_them():
    assert clean("a\n\tb") == "a\n\tb"


@pytest.mark.parametrize(
    ("raw", "escaped"),
    [("\x1b[2J", "\\x1b[2J"), ("\r", "\\x0d"), ("\x00", "\\x00"), ("\x7f", "\\x7f"), ("\x9b", "\\x9b")],
)
def test_every_other_control_character_is_escaped(raw, escaped):
    assert clean(f"/api/{raw}x") == f"/api/{escaped}x"


def test_ordinary_text_is_untouched():
    line = "GET /api/analyze 200 (12 ms) client=203.0.113.7 caf\u00e9 \u2014 ok"
    assert clean(line) == line
