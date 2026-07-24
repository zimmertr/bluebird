from __future__ import annotations

from types import SimpleNamespace

from app.main import _client_ip


def _request(headers=None, client_host="10.0.0.1"):
    return SimpleNamespace(
        headers=headers or {},
        client=SimpleNamespace(host=client_host) if client_host else None,
    )


def test_client_ip_prefers_first_forwarded_hop():
    # Behind Istio/Envoy the socket peer is the sidecar; the real client is the
    # first X-Forwarded-For hop.
    req = _request(headers={"x-forwarded-for": "203.0.113.5, 10.0.0.6"}, client_host="127.0.0.6")
    assert _client_ip(req) == "203.0.113.5"


def test_client_ip_falls_back_to_peer():
    assert _client_ip(_request(client_host="192.168.1.1")) == "192.168.1.1"


def test_client_ip_handles_missing_client():
    assert _client_ip(_request(client_host=None)) == "-"
