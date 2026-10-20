from __future__ import annotations

import httpx
import pytest
from conftest import fake_response

from app.services.errors import (
    PartialResultError,
    UpstreamError,
    classify_http_error,
    finite_float,
    is_invalid_api_key,
    is_out_of_domain,
    log_reason,
    retry_after_seconds,
)

PROVIDER = "Test Provider"


def _status_error(code: int) -> httpx.HTTPStatusError:
    response = fake_response({}, code)
    return httpx.HTTPStatusError("boom", request=response.request, response=response)


def test_upstream_error_carries_message():
    err = UpstreamError("something friendly")
    assert err.message == "something friendly"
    assert str(err) == "something friendly"


def test_timeout_message():
    msg = classify_http_error(httpx.TimeoutException("slow"), PROVIDER)
    assert msg == f"{PROVIDER} took too long. Try again later."


def test_rate_limit_429():
    # A 429 that gives no reason has no scope to name.
    msg = classify_http_error(_status_error(429), PROVIDER)
    assert msg == f"{PROVIDER} is rate-limiting. Try again later."


@pytest.mark.parametrize("code", [401, 403])
def test_a_401_or_403_reads_as_rejected(code):
    msg = classify_http_error(_status_error(code), PROVIDER)
    assert msg == f"{PROVIDER} rejected the request. Try again later."


@pytest.mark.parametrize("code", [500, 502, 503])
def test_a_5xx_names_its_status(code):
    msg = classify_http_error(_status_error(code), PROVIDER)
    assert msg == f"{PROVIDER} failed (HTTP {code}). Try again later."


def test_an_unlisted_status_names_its_status():
    msg = classify_http_error(_status_error(418), PROVIDER)
    assert msg == f"{PROVIDER} error (HTTP 418). Try again later."


def test_connect_error():
    msg = classify_http_error(httpx.ConnectError("no route"), PROVIDER)
    assert msg == f"Cannot reach {PROVIDER}. Try again later."


def test_generic_request_error():
    # A RequestError that is neither a timeout nor a connect error.
    msg = classify_http_error(httpx.RequestError("weird"), PROVIDER)
    assert msg == f"{PROVIDER} request failed. Try again later."


def test_partial_result_message():
    msg = classify_http_error(PartialResultError("runtime error: Query timed out"), PROVIDER)
    assert msg == f"{PROVIDER} partial results. Try again later."


def test_non_httpx_exception_falls_through():
    msg = classify_http_error(ValueError("nope"), PROVIDER)
    assert msg == f"{PROVIDER} request failed. Try again later."


def test_an_asyncio_deadline_reads_as_a_timeout():
    # The snapshot refresh's total deadline ends in a builtin TimeoutError.
    msg = classify_http_error(TimeoutError(), PROVIDER)
    assert msg == f"{PROVIDER} took too long. Try again later."


# ── a malformed refusal body is read as no reason ──────────────────────────

# Each runs inside the `except httpx.HTTPStatusError` in openmeteo_fetch, so
# an exception from one would chain the keyed request URL into a traceback.
_NOT_A_STRING = [123, ["The supplied API key is invalid."], {"text": "x"}, True]


@pytest.mark.parametrize("reason", _NOT_A_STRING, ids=repr)
@pytest.mark.parametrize("reads", [is_invalid_api_key, is_out_of_domain])
def test_a_reason_that_is_not_a_string_matches_nothing(reads, reason):
    response = fake_response({"error": True, "reason": reason}, 400)
    exc = httpx.HTTPStatusError("400", request=response.request, response=response)
    assert reads(exc) is False


def test_a_400_that_is_not_json_is_not_a_bad_key():
    # A proxy's HTML page in front of the API is not the caller's key.
    response = fake_response(None, 400, text="<html>Bad Request</html>")
    exc = httpx.HTTPStatusError("400", request=response.request, response=response)
    assert is_invalid_api_key(exc) is False


# ── reading a number out of untrusted text ─────────────────────────────────


@pytest.mark.parametrize(
    ("value", "expected"),
    [("1000", 1000.0), ("-12.5", -12.5), (7, 7.0), ("nan", None), ("inf", None),
     ("-Infinity", None), ("high", None), ("", None), (None, None), ([], None)],
)
def test_finite_float_reads_only_a_finite_number(value, expected):
    assert finite_float(value) == expected


@pytest.mark.parametrize(
    ("wait_s", "expected"), [(0.0, 1), (-3.0, 1), (0.2, 1), (1.0, 1), (1.01, 2), (59.5, 60)]
)
def test_a_retry_after_is_whole_seconds_and_at_least_one(wait_s, expected):
    assert retry_after_seconds(wait_s) == expected


# ── what a log line says a failure was ─────────────────────────────────────


def test_a_failure_with_text_logs_its_text():
    assert log_reason(httpx.ReadError("connection reset"), deadline_s=60) == "connection reset"


def test_a_silent_failure_logs_its_type_rather_than_a_deadline():
    # A reset connection carries no message and is not a timeout.
    assert log_reason(httpx.ReadError(""), deadline_s=60) == "ReadError"


def test_a_silent_deadline_logs_the_deadline_it_ran_out_of():
    assert log_reason(TimeoutError(), deadline_s=60) == "no answer within 60s"
    assert log_reason(TimeoutError()) == "TimeoutError"


def test_a_replacement_text_is_logged_in_place_of_the_exception():
    # The Open-Meteo sites hand in the redacted text; the raw one must not leak.
    exc = httpx.ReadError("https://x.test/?apikey=secret")
    assert log_reason(exc, text="https://x.test/?apikey=REDACTED") == (
        "https://x.test/?apikey=REDACTED"
    )
    assert log_reason(TimeoutError(), text="", deadline_s=5) == "no answer within 5s"
