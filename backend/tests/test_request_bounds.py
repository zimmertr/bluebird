"""How large a request may be: the body cap and the list bounds (#618, #619).

A body is refused by its size before FastAPI reads or parses it, and every
list a request body carries has a maximum length the schema states, so a body
under the size cap but over a list bound is refused with Pydantic's own 422.
"""

from __future__ import annotations

import json
import math

import pytest
from fastapi.testclient import TestClient

from app import ratelimit
from app.main import app
from app.models import MAX_ANALYZE_PEAKS, MAX_POLYGON_POINTS, MAX_REQUEST_BYTES
from app.services import osm as osm_mod

client = TestClient(app)

_SQUARE = [[0, 0], [0.1, 0], [0.1, 0.1], [0, 0.1], [0, 0]]
_TOO_LARGE = {
    "detail": f"Request body is too large. Maximum is {MAX_REQUEST_BYTES:,} bytes.",
    "error": {"code": "validation", "retryable": False},
}


class _Calls(ratelimit.RateLimiter):
    """A disabled limiter that counts how often the destinations route's
    rate-limit dependency asked it, beside a count of discoveries the route
    ran, so a test can tell whether any of the route ran at all."""

    def __init__(self) -> None:
        super().__init__(0, 1)
        self.dependency = 0
        self.discovery = 0

    def check(self, key: str) -> tuple[bool, float]:
        self.dependency += 1
        return super().check(key)


@pytest.fixture
def route_calls(monkeypatch) -> _Calls:
    calls = _Calls()
    monkeypatch.setattr(ratelimit.client, "DESTINATIONS_LIMITER", calls)

    async def no_discovery(*_args, **_kwargs):
        calls.discovery += 1
        return []

    monkeypatch.setattr(osm_mod, "query_osm", no_discovery)
    return calls


def _ring(positions: int) -> list[list[float]]:
    """A closed ring of exactly `positions` positions inside a ~1 km circle."""
    distinct = positions - 1
    pts = [
        [
            -121.7 + 0.005 * math.cos(2 * math.pi * i / distinct),
            46.8 + 0.005 * math.sin(2 * math.pi * i / distinct),
        ]
        for i in range(distinct)
    ]
    return [*pts, pts[0]]


def _discovery(polygon: dict | None = None, **overrides) -> dict:
    body = {
        "polygon": polygon or {"type": "Polygon", "coordinates": [_SQUARE]},
        "destination_types": ["peak"],
    }
    return {**body, **overrides}


def _padded(size: int) -> bytes:
    """A valid discovery body of exactly `size` bytes. JSON allows any
    whitespace after the value, so only the length differs between two sizes."""
    raw = json.dumps(_discovery()).encode()
    return raw + b" " * (size - len(raw))


def _post(content, **headers) -> object:
    return client.post(
        "/api/destinations",
        content=content,
        headers={"Content-Type": "application/json", **headers},
    )


# --- the body cap ---------------------------------------------------------


def test_a_body_one_byte_over_the_cap_is_refused_before_the_route_runs(route_calls):
    response = _post(_padded(MAX_REQUEST_BYTES + 1))
    assert response.status_code == 413
    assert response.json() == _TOO_LARGE
    # Neither the rate-limit dependency nor the handler ran: the size alone
    # refused it.
    assert route_calls.dependency == 0
    assert route_calls.discovery == 0


def test_a_chunked_body_is_cut_off_at_the_cap_while_it_streams(route_calls):
    # No Content-Length to read, so the cap has to count what arrives.
    body = _padded(MAX_REQUEST_BYTES + 1)
    chunk = 64 * 1024

    def stream():
        for start in range(0, len(body), chunk):
            yield body[start : start + chunk]

    response = _post(stream())
    assert response.request.headers.get("transfer-encoding") == "chunked"
    assert response.status_code == 413
    assert response.json() == _TOO_LARGE
    assert route_calls.dependency == 0
    assert route_calls.discovery == 0


def test_a_body_exactly_at_the_cap_is_read(route_calls):
    response = _post(_padded(MAX_REQUEST_BYTES))
    assert response.status_code == 200
    assert route_calls.discovery == 1


def test_the_refusal_leaves_with_the_headers_every_response_carries():
    # The cap sits inside the CORS, security-header and access-log layers, so a
    # cross-origin caller can read the refusal and it is logged and counted
    # like any other 4xx.
    response = _post(_padded(MAX_REQUEST_BYTES + 1), Origin="https://example.test")
    assert response.status_code == 413
    assert response.headers["access-control-allow-origin"] == "*"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_the_largest_body_the_models_accept_fits_under_the_cap(route_calls):
    # The worst case measured for the cap's comment: the most custom rows, each
    # name the most characters allowed, every character four UTF-8 bytes and
    # sent as `\u` escape pairs (Python's `json.dumps` default), with
    # coordinates at full precision. A different character per row, because a
    # repeated name would be merged into one row.
    rows = [
        {
            "name": chr(0x1F300 + i) * 255,
            "latitude": -89.0 + i * 0.0123456789012345,
            "longitude": -179.12345678901234,
            "elevation_ft": -1499.1234567890123,
        }
        for i in range(MAX_ANALYZE_PEAKS)
    ]
    body = json.dumps(
        _discovery(
            {"type": "Polygon", "coordinates": [_ring(MAX_POLYGON_POINTS)]},
            destination_types=["peak", "trailhead", "lake"],
            custom_destinations=rows,
        )
    ).encode()
    assert 4 * 1024 * 1024 < len(body) <= MAX_REQUEST_BYTES
    response = _post(body)
    assert response.status_code == 200, response.text
    assert response.json()["total"] == MAX_ANALYZE_PEAKS


# --- the list bounds -------------------------------------------------------


def _only_error(response) -> dict:
    assert response.status_code == 422, response.text
    [error] = response.json()["detail"]
    return error


def test_a_ring_one_point_over_its_cap_is_refused_with_pydantics_message(route_calls):
    over = MAX_POLYGON_POINTS + 1
    error = _only_error(
        client.post(
            "/api/destinations",
            json=_discovery({"type": "Polygon", "coordinates": [_ring(over)]}),
        )
    )
    assert error["type"] == "too_long"
    assert error["loc"] == ["body", "polygon", "coordinates", 0]
    assert error["msg"] == (
        f"List should have at most {MAX_POLYGON_POINTS} items after validation, not {over}"
    )
    assert route_calls.discovery == 0


def test_a_ring_at_its_cap_is_accepted(route_calls):
    response = client.post(
        "/api/destinations",
        json=_discovery({"type": "Polygon", "coordinates": [_ring(MAX_POLYGON_POINTS)]}),
    )
    assert response.status_code == 200, response.text
    assert route_calls.discovery == 1


def test_a_polygon_with_eleven_rings_is_refused(route_calls):
    error = _only_error(
        client.post(
            "/api/destinations",
            json=_discovery({"type": "Polygon", "coordinates": [_SQUARE] * 11}),
        )
    )
    assert (error["type"], error["loc"]) == ("too_long", ["body", "polygon", "coordinates"])


def test_a_bbox_with_seven_numbers_is_refused(route_calls):
    polygon = {"type": "Polygon", "coordinates": [_SQUARE], "bbox": [0, 0, 0, 0.1, 0.1, 0, 0]}
    error = _only_error(client.post("/api/destinations", json=_discovery(polygon)))
    assert (error["type"], error["loc"]) == ("too_long", ["body", "polygon", "bbox"])


def test_a_six_number_bbox_is_still_accepted_and_ignored(route_calls):
    polygon = {"type": "Polygon", "coordinates": [_SQUARE], "bbox": [0, 0, 0, 0.1, 0.1, 0]}
    assert client.post("/api/destinations", json=_discovery(polygon)).status_code == 200


@pytest.mark.parametrize("path", ["/api/destinations", "/api/analyze"])
def test_eleven_destination_types_are_refused(path, route_calls):
    error = _only_error(client.post(path, json=_discovery(destination_types=["peak"] * 11)))
    assert (error["type"], error["loc"]) == ("too_long", ["body", "destination_types"])


@pytest.mark.parametrize(
    ("path", "verb"), [("/api/destinations", "resolve"), ("/api/analyze", "analyze")]
)
def test_an_over_long_custom_list_keeps_its_approved_sentence(path, verb):
    rows = [
        {"name": f"P{i}", "latitude": 1.0, "longitude": 2.0} for i in range(MAX_ANALYZE_PEAKS + 1)
    ]
    error = _only_error(
        client.post(path, json={"destination_types": [], "custom_destinations": rows})
    )
    assert error["loc"] == ["body", "custom_destinations"]
    assert error["msg"].startswith(
        f"Too many custom destinations ({MAX_ANALYZE_PEAKS + 1:,}). Maximum is "
        f"{MAX_ANALYZE_PEAKS:,}."
    )


# --- what /api/capabilities and the schema say -----------------------------


def test_capabilities_publishes_both_caps():
    limits = client.get("/api/capabilities").json()["limits"]
    assert limits["max_request_bytes"] == MAX_REQUEST_BYTES
    assert limits["max_polygon_points"] == MAX_POLYGON_POINTS


def _arrays(node: object, schemas: dict, seen: set[str], path: str = ""):
    """Every array schema reachable from `node`, with where it was found."""
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str):
            name = ref.rsplit("/", 1)[-1]
            if name not in seen:
                seen.add(name)
                yield from _arrays(schemas[name], schemas, seen, name)
            return
        if node.get("type") == "array":
            yield path, node
        for key, value in node.items():
            yield from _arrays(value, schemas, seen, f"{path}.{key}")
    elif isinstance(node, list):
        for i, value in enumerate(node):
            yield from _arrays(value, schemas, seen, f"{path}[{i}]")


def test_every_list_a_request_body_carries_has_a_maximum_length():
    # A list with no maximum is a body that can grow until the size cap, and
    # every element of it is parsed and validated before anything reads it.
    schema = app.openapi()
    bodies = [
        op["requestBody"]
        for operations in schema["paths"].values()
        for op in operations.values()
        if "requestBody" in op
    ]
    arrays = list(_arrays(bodies, schema["components"]["schemas"], set()))
    assert arrays
    unbounded = sorted(path for path, spec in arrays if "maxItems" not in spec)
    assert unbounded == []
