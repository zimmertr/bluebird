"""The error-code contract itself: the vocabulary, and the lints that keep
every raise site inside it.

The per-route bodies are asserted where those routes are already tested. What
lives here is what no single route can prove: that the vocabulary is closed,
that `retryable` says the same thing everywhere, and that a new raise site
cannot quietly answer without a code.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.error_codes import (
    RETRYABLE,
    ApiError,
    ErrorCode,
    api_error_handler,
    error_object,
)
from app.main import app
from app.models import ApiErrorInfo

APP_ROOT = Path(__file__).parent.parent / "app"
ROUTES = APP_ROOT / "routes"

client = TestClient(app)


def test_every_code_answers_the_retry_question():
    assert set(RETRYABLE) == set(ErrorCode)


# Spelled out rather than derived from RETRYABLE, so changing the table is a
# two-file edit that shows up in review. `retryable` is a promise a caller
# writes a retry loop against: flipping one by accident is worse than a wrong
# status code, because the wrong status is visible and this is not.
@pytest.mark.parametrize(
    "code",
    [
        ErrorCode.validation,
        ErrorCode.refusal,
        ErrorCode.model_coverage,
        ErrorCode.invalid_api_key,
        ErrorCode.not_found,
        ErrorCode.method_not_allowed,
    ],
)
def test_a_caller_fixable_failure_is_not_retryable(code):
    assert RETRYABLE[code] is False


@pytest.mark.parametrize(
    "code",
    [
        ErrorCode.rate_limited,
        ErrorCode.upstream_rate_limited,
        ErrorCode.upstream_unavailable,
        ErrorCode.busy,
        ErrorCode.snapshot_unavailable,
        ErrorCode.internal,
    ],
)
def test_a_failure_nobody_can_fix_by_editing_the_request_is_retryable(code):
    assert RETRYABLE[code] is True


def test_the_two_ways_to_build_the_field_agree():
    # One hand-built (the catch-all and the refusal), one modelled (the
    # schema). A disagreement would put two shapes on one contract.
    for code in ErrorCode:
        assert ApiErrorInfo.for_code(code).model_dump(mode="json") == error_object(code)


async def test_the_handler_keeps_the_detail_and_the_retry_after_header():
    # `detail` is approved user-facing copy: the handler adds a field beside
    # it and must never reword or restructure it. The header matters as much —
    # a retryable error that lost its Retry-After tells a client to retry and
    # not when.
    response = await api_error_handler(
        None,
        ApiError(
            status_code=503,
            detail="Bluebird Forecast is busy. Try again later.",
            code=ErrorCode.busy,
            headers={"Retry-After": "7"},
        ),
    )
    assert response.status_code == 503
    assert response.headers["retry-after"] == "7"
    assert json.loads(response.body) == {
        "detail": "Bluebird Forecast is busy. Try again later.",
        "error": {"code": "busy", "retryable": True},
    }


# The browser shows a 422's `msg` as-is, so our own validator's sentence must
# arrive as written rather than behind Pydantic's "Value error, " prefix. The
# body keeps the stock 422 shape: a list, and no `error` object.
def test_a_validator_message_arrives_as_the_validator_wrote_it():
    response = client.post(
        "/api/destinations",
        json={
            "destination_types": [],
            "custom_destinations": [{"name": "X", "latitude": 95, "longitude": -121}],
        },
    )
    assert response.status_code == 422
    body = response.json()
    assert "error" not in body
    [error] = body["detail"]
    assert error["type"] == "value_error"
    assert error["msg"] == "Latitude 95.0 is outside the valid -90 to 90 range."


# Pydantic's own messages carry no prefix and pass through untouched.
def test_a_pydantic_message_passes_through_unchanged():
    response = client.post(
        "/api/destinations",
        json={
            "destination_types": [],
            "custom_destinations": [{"name": "X", "latitude": "north", "longitude": -121}],
        },
    )
    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert error["type"] == "float_parsing"
    assert error["msg"] == "Input should be a valid number, unable to parse string as a number"


# An unknown field is refused in Pydantic's own words, in the stock 422 shape
# docs/API.md shows, rather than dropped (issue #563).
def test_an_unknown_request_field_is_a_422_naming_it():
    response = client.post(
        "/api/destinations",
        json={
            "destination_types": [],
            "custom_destinations": [{"name": "X", "latitude": 47, "longitude": -121, "elev": 4000}],
        },
    )
    assert response.status_code == 422
    [error] = response.json()["detail"]
    assert {k: error[k] for k in ("type", "loc", "msg", "input")} == {
        "type": "extra_forbidden",
        "loc": ["body", "custom_destinations", 0, "elev"],
        "msg": "Extra inputs are not permitted",
        "input": 4000,
    }


def test_a_page_route_404_stays_outside_the_api_contract(tmp_path, monkeypatch):
    # The document pages raise a plain HTTPException. The handler is registered
    # for ApiError alone precisely so that 404 keeps FastAPI's stock body: it
    # is an HTML page that is missing, not an API call that failed.
    from app import main as main_mod

    monkeypatch.setattr(main_mod, "_privacy_page", tmp_path / "missing" / "index.html")
    response = client.get("/privacy")
    assert response.status_code == 404
    assert "error" not in response.json()


def test_every_stream_error_event_carries_the_field():
    """The SSE half of the same rule.

    The stream has no status code to carry a failure, so an `error` event that
    forgot the field would be the one failure path a client cannot branch on.
    `_sse_error` builds it; the refusal spreads a body that already holds it.

    Every module of the analyze package is read, and the stream's own module
    must hold at least one `error` event, so a move that takes the rendering
    somewhere else fails here instead of leaving nothing to check.
    """
    package = ROUTES / "analyze"
    built = [
        (py.name, line.strip())
        for py in sorted(package.glob("*.py"))
        for line in py.read_text().splitlines()
        if re.search(r'_sse\(\s*"error"', line)
    ]
    assert any(name == "sse.py" for name, _ in built), "no error event found in routes/analyze/sse.py"
    bare = [line for _, line in built if "error=" not in line and "**body" not in line]
    assert not bare, f"error events built without a code: {bare}"
