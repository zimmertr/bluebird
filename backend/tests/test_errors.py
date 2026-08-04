from __future__ import annotations

import httpx
import pytest
from app.services.errors import PartialResultError, UpstreamError, classify_http_error

PROVIDER = "Test Provider"


def _status_error(code: int) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", "https://example.test")
    response = httpx.Response(code, request=request)
    return httpx.HTTPStatusError("boom", request=request, response=response)


def test_upstream_error_carries_message():
    err = UpstreamError("something friendly")
    assert err.message == "something friendly"
    assert str(err) == "something friendly"


def test_timeout_message():
    msg = classify_http_error(httpx.TimeoutException("slow"), PROVIDER)
    assert PROVIDER in msg
    assert "too long" in msg


def test_rate_limit_429():
    msg = classify_http_error(_status_error(429), PROVIDER)
    assert "rate-limiting" in msg


@pytest.mark.parametrize("code", [401, 403])
def test_auth_errors(code):
    msg = classify_http_error(_status_error(code), PROVIDER)
    assert "rejected the request" in msg


@pytest.mark.parametrize("code", [500, 502, 503])
def test_server_errors(code):
    msg = classify_http_error(_status_error(code), PROVIDER)
    assert f"HTTP {code}" in msg
    assert "failed" in msg


def test_other_status_code():
    msg = classify_http_error(_status_error(418), PROVIDER)
    assert "error (HTTP 418)" in msg


def test_connect_error():
    msg = classify_http_error(httpx.ConnectError("no route"), PROVIDER)
    assert "Cannot reach" in msg


def test_generic_request_error():
    # A RequestError that is neither a timeout nor a connect error.
    msg = classify_http_error(httpx.RequestError("weird"), PROVIDER)
    assert "request failed" in msg


def test_partial_result_message():
    msg = classify_http_error(PartialResultError("runtime error: Query timed out"), PROVIDER)
    assert PROVIDER in msg
    assert "partial results" in msg


def test_non_httpx_exception_falls_through():
    msg = classify_http_error(ValueError("nope"), PROVIDER)
    assert "request failed" in msg
