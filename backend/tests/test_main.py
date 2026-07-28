from __future__ import annotations

from types import SimpleNamespace

from app.main import _client_ip


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
