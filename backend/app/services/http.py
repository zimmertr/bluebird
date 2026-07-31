"""The process-wide HTTP client the Open-Meteo services share.

httpx pools connections per *client*, so a client constructed inside a chunk
loop throws that pool away every batch and pays a fresh TCP+TLS handshake for
the next one. Weather and air quality both fan out in batches of
``BATCH_SIZE``, which is thirty handshakes each on a 1,500-destination
analysis. One client for the process turns that into one handshake per host
that the rest of the batches ride on.

One client covers both services because httpx keys its pool by host, so
``api.open-meteo.com`` and ``air-quality-api.open-meteo.com`` get their own
connections out of the same object.
"""

from __future__ import annotations

import httpx

# Matches the per-request timeout the services used when each built its own
# client. It is generous because a 50-location, 16-day batch is a real payload
# (measured ~700 KB), not because upstream is expected to be slow.
TIMEOUT_S = 60.0

_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    """The shared client, created on first use.

    Lazy rather than built at import so it binds to the running event loop.
    `main.py`'s lifespan closes it; a test or script that never opens one just
    gets an unclosed client at exit, which costs nothing.
    """
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=TIMEOUT_S)
    return _client


async def aclose() -> None:
    """Release the pooled connections. Called from the app's lifespan."""
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
