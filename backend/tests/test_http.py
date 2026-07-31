from __future__ import annotations

import httpx
import pytest
from app.main import app
from app.services import http
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
async def _own_the_client():
    # The client is module state, so one left open by a test would make the
    # next test's identity assertions depend on ordering.
    await http.aclose()
    yield
    await http.aclose()


async def test_repeated_calls_hand_back_the_same_client():
    # The pooled connections live on the client object, so a fresh one per
    # call is exactly the per-batch handshake this module exists to remove.
    assert http.client() is http.client()


async def test_aclose_releases_the_client():
    client = http.client()

    await http.aclose()

    assert client.is_closed
    assert http._client is None


async def test_aclose_on_a_process_that_never_fetched_is_a_no_op():
    # The lifespan closes unconditionally, and a pod can shut down having
    # served nothing that touched Open-Meteo.
    await http.aclose()


async def test_a_closed_client_is_replaced_rather_than_reused():
    # Shutdown races nothing today, but handing a caller a closed client would
    # fail every request on it rather than reconnecting.
    first = http.client()
    await first.aclose()

    second = http.client()

    assert second is not first
    assert not second.is_closed


def test_the_app_lifespan_closes_the_shared_client():
    # The pod's keep-alive connections should go away with the process rather
    # than linger until upstream's idle timeout. Entering the TestClient
    # context is what runs the lifespan; without it the shutdown half never
    # fires and this passes for the wrong reason.
    with TestClient(app):
        client = http.client()
        assert not client.is_closed

    assert client.is_closed


async def test_the_shared_client_carries_the_services_timeout():
    # Each service used to set this on the client it built; the shared one is
    # now the only place it is spelled.
    assert http.client().timeout == httpx.Timeout(http.TIMEOUT_S)
