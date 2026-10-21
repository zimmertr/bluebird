from __future__ import annotations

import json
import math
import re
from typing import Any

import httpx


class UpstreamError(Exception):
    """A failure from an external provider, carrying a user-friendly message.

    Raised by the service layer so the route can surface the ``.message`` to the
    user verbatim instead of leaking a raw exception string like
    ``ReadTimeout('')``.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class UpstreamRateLimited(UpstreamError):
    """An upstream answered 429: reachable, refusing volume, not down.

    Distinct from a generic :class:`UpstreamError` because the right reaction
    differs by ``scope``: a minutely quota refills within the minute (pace and
    retry), while an hourly or daily quota makes retrying pointless until its
    boundary. ``retry_after_s`` is the provider's Retry-After when sent, else a
    scope-derived floor.
    """

    def __init__(
        self,
        provider: str,
        scope: str | None,
        retry_after_s: int,
        message: str,
    ) -> None:
        super().__init__(message)
        self.provider = provider
        self.scope = scope  # "minutely" | "hourly" | "daily" | None
        self.retry_after_s = retry_after_s


class InvalidApiKeyError(UpstreamError):
    """Open-Meteo refused the caller's API key.

    Kept apart from a generic :class:`UpstreamError` because the upstream is
    healthy and the request is the problem, so the route answers 401 rather
    than 502. Its message is fixed and carries nothing of the key: the key is
    a paid credential the pod only forwards, and an error body is read by
    whoever sent the request and by whoever reads the logs.
    """

    def __init__(self) -> None:
        super().__init__("Open-Meteo rejected the API key.")


class ModelCoverageError(UpstreamError):
    """The requested weather model does not cover somewhere in the batch.

    Only regional models can raise this, and in practice only HRRR. Kept apart
    from a generic :class:`UpstreamError` because it is the one upstream 400
    the user can actually fix, and the fix is naming a different model rather
    than waiting or drawing smaller.
    """

    def __init__(self, model: str, message: str) -> None:
        super().__init__(message)
        self.model = model


# How Open-Meteo refuses a point outside a regional model's grid. Measured
# 2026-08-01: `models=gfs_hrrr` at 46.5,8.0 answers HTTP 400 with
# {"error": true, "reason": "No data is available for this location"} — and a
# batch answers the same way if a *single* one of its locations is outside,
# taking the other 49 down with it, which is why this is worth recognising
# rather than reporting as a generic bad request.
_NO_DATA_REASON = re.compile(r"no data is available for this location", re.IGNORECASE)


def is_out_of_domain(exc: httpx.HTTPStatusError) -> bool:
    """Is this 400 a regional model refusing a location outside its grid?"""
    return _reason_matches(exc, _NO_DATA_REASON)


# How Open-Meteo's customer hosts refuse a bad key. Measured 2026-09-11 on both
# `customer-api` and `customer-air-quality-api`: HTTP 400 with
# {"error": true, "reason": "The supplied API key is invalid."}. A 400 rather
# than a 401, which is why this needs recognising by reason text: left to
# `classify_http_error` it would reach the caller as a 502 "try again later"
# for a request no retry can fix.
_INVALID_KEY_REASON = re.compile(r"the supplied api key is invalid", re.IGNORECASE)


def is_invalid_api_key(exc: httpx.HTTPStatusError) -> bool:
    """Is this 400 Open-Meteo refusing the key the request carried?"""
    return _reason_matches(exc, _INVALID_KEY_REASON)


def _reason_matches(exc: httpx.HTTPStatusError, pattern: re.Pattern[str]) -> bool:
    if exc.response.status_code != 400:
        return False
    try:
        body = exc.response.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        return False
    return bool(pattern.search(_reason(body)))


def _reason(body: object) -> str:
    """The `reason` of an Open-Meteo error body, or "" if it has none to read.

    Both readers run inside the `except httpx.HTTPStatusError` of a request
    that may carry a caller's key in its URL, so anything they raised would
    chain that URL into a traceback. A reason that is not a string is
    therefore read as absent rather than handed to a regex that would raise.
    """
    reason = body.get("reason") if isinstance(body, dict) else None
    return reason if isinstance(reason, str) else ""


class PartialResultError(RuntimeError):
    """An upstream returned HTTP 200 but only part of the requested data.

    Overpass signals mid-query timeouts this way (a ``remark`` field alongside
    truncated ``elements``), so this deserves its own user-facing message: the
    query was too demanding, not the network or the service as a whole.
    """


# Open-Meteo's 429 body is JSON like {"error": true, "reason": "Minutely API
# request limit exceeded. Please try again in one minute."}. The reason's first
# word names which quota tripped, which is exactly the fact that decides
# whether an automatic resume can help.
_SCOPE_WORDS = re.compile(r"\b(minutely|hourly|daily|monthly)\b", re.IGNORECASE)

# Without a Retry-After header the true reset moment is unknowable (the quota
# windows are the provider's, not ours), so each scope gets a conservative
# floor: long enough that a retry after it has a real chance, short enough not
# to stall a user pointlessly.
_SCOPE_RETRY_FLOOR_S = {"minutely": 60, "hourly": 900, "daily": 3600, "monthly": 3600}


def finite_float(value: Any) -> float | None:
    """`value` read as a finite number, or None when it is not one.

    `float` reads "nan" and "inf" out of text, where the browser's `Number`
    with `Number.isFinite` refuses both, and whatever rounds the result next
    raises on either (`math.ceil` and `round` to an integer both do, and an
    infinity raises OverflowError, which a ValueError guard misses).
    """
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def retry_after_seconds(wait_s: float) -> int:
    """A wait as a `Retry-After` value: whole seconds, rounded up, at least 1.

    A refusal that said 0 would tell its caller to come straight back, which a
    shed under a misconfigured negative wait would otherwise do.
    """
    return max(1, math.ceil(wait_s))


def retry_after_header(response: httpx.Response) -> int | None:
    """The `Retry-After` an upstream sent, in whole seconds, or None.

    None when there is no header or it is not a number this can read; the
    HTTP-date form is one of those, and the caller's own default stands.
    """
    seconds = finite_float(response.headers.get("Retry-After"))
    return None if seconds is None else retry_after_seconds(seconds)


def parse_rate_limit(exc: httpx.HTTPStatusError) -> tuple[str | None, int]:
    """Extract (scope, retry_after_s) from an upstream 429 response.

    Best-effort by design: a malformed body degrades to ``(None, 60)`` rather
    than raising from inside error handling.
    """
    scope: str | None = None
    try:
        reason = _reason(exc.response.json())
    except (json.JSONDecodeError, UnicodeDecodeError):
        reason = ""
    match = _SCOPE_WORDS.search(reason)
    if match:
        scope = match.group(1).lower()

    sent = retry_after_header(exc.response)
    if sent is not None:
        return scope, sent
    return scope, _SCOPE_RETRY_FLOOR_S.get(scope or "", 60)


def rate_limit_message(provider: str, scope: str | None) -> str:
    """The user-facing sentence for an upstream 429, by quota scope."""
    if scope in ("hourly", "daily", "monthly"):
        return f"{provider} quota reached. Try again later."
    return f"{provider} is rate-limiting. Try again later."


def log_reason(
    exc: BaseException, *, text: str | None = None, deadline_s: float | None = None
) -> str:
    """What a log line says a failure was, never an empty string.

    `text` stands in for `str(exc)` where that is unsafe to log: an Open-Meteo
    error carries the caller's key in its URL, so those sites pass
    `redacted_error`'s text. A failure with no text of its own is named by its
    type, except the builtin TimeoutError an `asyncio.timeout` ends in, which
    reads as the deadline the caller set when it passes one. A connection the
    server reset carries no text either (seen 2026-10-07 from
    overpass-api.de), and it is not a timeout, so it must not read as one.
    """
    message = str(exc) if text is None else text
    if message:
        return message
    if deadline_s is not None and isinstance(exc, TimeoutError):
        return f"no answer within {deadline_s:.0f}s"
    return type(exc).__name__


def classify_http_error(exc: Exception, provider: str) -> str:
    """Translate an httpx/network exception into an actionable message.

    ``provider`` is a human-readable name for the upstream service, e.g.
    ``"Open-Meteo"``. The returned string names the provider,
    the likely cause, and a suggested next step where one exists.
    """
    if isinstance(exc, PartialResultError):
        return f"{provider} partial results. Try again later."

    # A builtin TimeoutError is an asyncio deadline over several requests (the
    # snapshot refresh's), which is the same fact as one request timing out.
    if isinstance(exc, (httpx.TimeoutException, TimeoutError)):
        return f"{provider} took too long. Try again later."

    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        if code == 429:
            scope, _ = parse_rate_limit(exc)
            return rate_limit_message(provider, scope)
        if code in (401, 403):
            return f"{provider} rejected the request. Try again later."
        if 500 <= code < 600:
            return f"{provider} failed (HTTP {code}). Try again later."
        return f"{provider} error (HTTP {code}). Try again later."

    if isinstance(exc, httpx.ConnectError):
        return f"Cannot reach {provider}. Try again later."

    if isinstance(exc, httpx.RequestError):
        return f"{provider} request failed. Try again later."

    # Log the exception at error level instead of interpolating into user text
    return f"{provider} request failed. Try again later."
