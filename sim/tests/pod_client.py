"""The pod's own HTTP clients, pointed at the sim in-process.

The drift guards run the pod's real fetch functions against the sim rather than
feeding a parser a body the test built, so the request the pod sends (its
params, its pager, its fallback) is part of what is checked. Most of those
functions open their own `httpx.AsyncClient` with no way to pass a transport,
so the class itself is swapped, the way `backend/tests/test_hms.py` does it.
"""

from __future__ import annotations

import logging

import httpx
import pytest

from app.main import app as sim_app


def route_to_sim(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Send every `httpx.AsyncClient` the pod opens to the sim; returns the URLs asked."""
    asked: list[str] = []
    transport = httpx.ASGITransport(app=sim_app)
    real = httpx.AsyncClient

    class _Client(real):  # type: ignore[valid-type,misc]
        def __init__(self, **kwargs: object) -> None:
            kwargs.pop("transport", None)
            super().__init__(**kwargs, transport=transport)

        async def send(self, request: httpx.Request, **kwargs: object) -> httpx.Response:
            asked.append(str(request.url))
            return await super().send(request, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", _Client)
    # The pod's TRACE level is attached in its main.py, which the sim's own
    # `app.main` shadows; the services call `log.trace` freely.
    monkeypatch.setattr(logging.Logger, "trace", lambda self, *a, **k: None, raising=False)
    return asked
