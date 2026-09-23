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


def test_a_page_route_404_stays_outside_the_api_contract(tmp_path, monkeypatch):
    # The document pages raise a plain HTTPException. The handler is registered
    # for ApiError alone precisely so that 404 keeps FastAPI's stock body: it
    # is an HTML page that is missing, not an API call that failed.
    from app import main as main_mod

    monkeypatch.setattr(main_mod, "_privacy_page", tmp_path / "missing" / "index.html")
    response = client.get("/privacy")
    assert response.status_code == 404
    assert "error" not in response.json()


def _sources() -> list[Path]:
    return sorted(ROUTES.glob("*.py")) + sorted((APP_ROOT / "ratelimit").glob("*.py"))


def test_no_route_raises_an_uncoded_error():
    """Every 4xx/5xx a route raises must name a code.

    A bare `HTTPException` answers `{"detail": ...}` and nothing else, which is
    exactly the shape this feature exists to replace. The scan is the guard
    because the omission is invisible: the route still works, and only a client
    branching on the code ever notices.
    """
    offenders = [
        path.name for path in _sources() if "HTTPException(" in path.read_text()
    ]
    assert not offenders, (
        f"raise ApiError(..., code=ErrorCode.x) instead of HTTPException in: {offenders}"
    )


def test_every_stream_error_event_carries_the_field():
    """The SSE half of the same rule.

    The stream has no status code to carry a failure, so an `error` event that
    forgot the field would be the one failure path a client cannot branch on.
    `_sse_error` builds it; the refusal spreads a body that already holds it.
    """
    source = (ROUTES / "analyze.py").read_text()
    bare = [
        line.strip()
        for line in source.splitlines()
        if re.search(r'_sse\(\s*"error"', line)
        and "error=" not in line
        and "**body" not in line
    ]
    assert not bare, f"error events built without a code: {bare}"
