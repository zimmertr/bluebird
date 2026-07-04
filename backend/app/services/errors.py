from __future__ import annotations

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


def classify_http_error(exc: Exception, provider: str) -> str:
    """Translate an httpx/network exception into an actionable message.

    ``provider`` is a human-readable name for the upstream service, e.g.
    ``"Open-Meteo (weather service)"``. The returned string names the provider,
    the likely cause, and a suggested next step where one exists.
    """
    if isinstance(exc, httpx.TimeoutException):
        return (
            f"{provider} took too long to respond. It may be under heavy load — "
            "wait a moment and try again, or draw a smaller search area."
        )

    if isinstance(exc, httpx.HTTPStatusError):
        code = exc.response.status_code
        if code == 429:
            return (
                f"{provider} is rate-limiting requests. Wait about a minute before "
                "trying again, or draw a smaller area to request less data."
            )
        if code in (401, 403):
            return (
                f"{provider} rejected the request (HTTP {code} — authentication or "
                "authorization error). This is a server-side configuration issue."
            )
        if 500 <= code < 600:
            return (
                f"{provider} is having server trouble (HTTP {code}). This is on their "
                "end — please try again shortly."
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
