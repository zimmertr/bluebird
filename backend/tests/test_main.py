from __future__ import annotations

import logging
from types import SimpleNamespace

import httpx
from conftest import FAKE_API_KEY

from app.main import _client_ip, app


def _request(headers=None, client_host="10.0.0.1"):
    return SimpleNamespace(
        headers=headers or {},
        client=SimpleNamespace(host=client_host) if client_host else None,
    )


def test_client_ip_prefers_cf_connecting_ip():
    # Cloudflare overwrites this header, so for proxied traffic it is the one
    # identity a client cannot rotate.
    req = _request(
        headers={"cf-connecting-ip": "203.0.113.5", "x-forwarded-for": "8.8.8.8, 10.0.0.6"},
        client_host="127.0.0.6",
    )
    assert _client_ip(req) == "203.0.113.5"


def test_client_ip_takes_rightmost_forwarded_hop():
    # The log prints what rate limiting counts: the rightmost XFF hop (the peer
    # our edge saw), never the client-typed leftmost one.
    req = _request(headers={"x-forwarded-for": "203.0.113.5, 10.0.0.6"}, client_host="127.0.0.6")
    assert _client_ip(req) == "10.0.0.6"


def test_client_ip_falls_back_to_peer():
    assert _client_ip(_request(client_host="192.168.1.1")) == "192.168.1.1"


def test_client_ip_handles_missing_client():
    assert _client_ip(_request(client_host=None)) == "-"


def test_the_api_description_states_the_key_requirement():
    # The document used to say "There is no API key and no authentication",
    # which #240 made false for the analyze routes and #317 replaced.
    description = app.description
    assert "There is no API key" not in description
    assert (
        "The analyze routes require an Open-Meteo API key in the X-Open-Meteo-Key"
        in description
    )
    assert "Every other route takes no key and no authentication." in description


def test_gzip_compresses_at_the_measured_level():
    # Starlette's default is 9, which on this service's largest body (the
    # national wildfire snapshot, 1,550,397 bytes) spends 124 ms more
    # event-loop CPU per request than 6 to save 0.4% of the bytes. The whole
    # measurement is in the comment beside the middleware; this pins the
    # decision so a re-measurement is what moves it (#337, finding 11).
    gzip_middleware = next(
        m for m in app.user_middleware if m.cls.__name__ == "GZipMiddleware"
    )
    assert gzip_middleware.kwargs["compresslevel"] == 6
    assert gzip_middleware.kwargs["minimum_size"] == 1024


async def test_httpx_logs_no_request_line_at_any_level(caplog):
    # httpx logs every request's full URL at INFO, and a keyed Open-Meteo
    # request carries the caller's key in its query string. `main.py` holds
    # the httpx logger at WARNING so that line never reaches the log, even
    # with the root logger at TRACE.
    transport = httpx.MockTransport(lambda request: httpx.Response(200))
    with caplog.at_level(5):  # TRACE
        async with httpx.AsyncClient(transport=transport) as http_client:
            await http_client.get(
                "https://customer-api.open-meteo.com/v1/forecast",
                params={"apikey": FAKE_API_KEY},
            )
    assert logging.getLogger("httpx").getEffectiveLevel() > logging.INFO
    assert [r for r in caplog.records if r.name.startswith("httpx")] == []
