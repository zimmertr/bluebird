from __future__ import annotations

import json
import math
import re

import httpx


class UpstreamError(Exception):
    """A failure from an external provider, carrying a user-friendly message.

    Raised by the service layer so the route can surface the ``.message`` to the
    user verbatim instead of leaking a raw exception string like
    ``ReadTimeout('')``.
    """

    def __init__(self, message: str):
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
    ):
        super().__init__(message)
        self.provider = provider
        self.scope = scope  # "minutely" | "hourly" | "daily" | None
        self.retry_after_s = retry_after_s


class ModelCoverageError(UpstreamError):
    """The requested weather model does not cover somewhere in the batch.

    Only regional models can raise this, and in practice only HRRR. Kept apart
    from a generic :class:`UpstreamError` because it is the one upstream 400
    the user can actually fix, and the fix is naming a different model rather
    than waiting or drawing smaller.
    """

    def __init__(self, model: str, message: str):
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
    if exc.response.status_code != 400:
        return False
    try:
        body = exc.response.json()
    except (json.JSONDecodeError, UnicodeDecodeError):
        return False
    reason = body.get("reason", "") if isinstance(body, dict) else ""
    return bool(_NO_DATA_REASON.search(reason or ""))


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


def parse_rate_limit(exc: httpx.HTTPStatusError) -> tuple[str | None, int]:
    """Extract (scope, retry_after_s) from an upstream 429 response.

    Best-effort by design: a malformed body degrades to ``(None, 60)`` rather
    than raising from inside error handling.
    """
    scope: str | None = None
    try:
        body = exc.response.json()
        reason = body.get("reason", "") if isinstance(body, dict) else ""
    except (json.JSONDecodeError, UnicodeDecodeError):
        reason = ""
    match = _SCOPE_WORDS.search(reason or "")
    if match:
        scope = match.group(1).lower()

    retry_after = _SCOPE_RETRY_FLOOR_S.get(scope or "", 60)
    header = exc.response.headers.get("Retry-After")
    if header:
        try:
            retry_after = max(1, math.ceil(float(header)))
        except ValueError:
            pass
    return scope, retry_after


def rate_limit_message(provider: str, scope: str | None) -> str:
    """The user-facing sentence for an upstream 429, by quota scope."""
    if scope == "hourly":
        return (
            f"{provider} has used up its hourly request quota. Try again "
            "after the top of the hour, or analyze a smaller area."
        )
    if scope in ("daily", "monthly"):
        return (
            f"{provider} has used up its {scope} request quota. Try again "
            "later today or tomorrow, or analyze a smaller area."
        )
    return (
        f"{provider} is rate-limiting requests. Wait about a minute before "
        "trying again, or draw a smaller area to request less data."
    )


def classify_http_error(exc: Exception, provider: str) -> str:
    """Translate an httpx/network exception into an actionable message.

    ``provider`` is a human-readable name for the upstream service, e.g.
    ``"Open-Meteo (weather service)"``. The returned string names the provider,
    the likely cause, and a suggested next step where one exists.
    """
    if isinstance(exc, PartialResultError):
        return (
            f"{provider} could only return part of the results. The search area "
            "is too demanding for its servers right now. Try again shortly, or "
            "draw a smaller search area."
        )

    if isinstance(exc, httpx.TimeoutException):
        return (
            f"{provider} took too long to respond. It may be under heavy load. "
            "Wait a moment and try again, or draw a smaller search area."
        )

    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        if code == 429:
            scope, _ = parse_rate_limit(exc)
            return rate_limit_message(provider, scope)
        if code in (401, 403):
            return (
                f"{provider} rejected the request (HTTP {code}: authentication or "
                "authorization error). This is a server-side configuration issue."
            )
        if 500 <= code < 600:
            return (
                f"{provider} is having server trouble (HTTP {code}). This is on their "
                "end. Please try again shortly."
            )
        return f"{provider} returned an unexpected response (HTTP {code})."

    if isinstance(exc, httpx.ConnectError):
        return (
            f"Couldn't connect to {provider}. Check your internet connection and "
            "try again."
        )

    if isinstance(exc, httpx.RequestError):
        return f"A network error occurred while contacting {provider}. Please try again."

    return f"{provider} request failed unexpectedly: {exc}"
