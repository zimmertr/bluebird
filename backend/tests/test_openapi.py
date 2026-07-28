from __future__ import annotations

import json
from pathlib import Path

import pytest
from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)

SNAPSHOT = Path(__file__).resolve().parent.parent / "openapi.json"


@pytest.fixture(scope="module")
def schema() -> dict:
    return app.openapi()


def test_every_operation_is_tagged(schema):
    # Untagged operations render as one flat, ungrouped list in /docs, which is
    # what the reference page looked like before.
    untagged = [
        f"{method.upper()} {path}"
        for path, operations in schema["paths"].items()
        for method, operation in operations.items()
        if not operation.get("tags")
    ]
    assert untagged == []


def test_declared_tags_cover_every_tag_in_use(schema):
    declared = {tag["name"] for tag in schema["tags"]}
    used = {
        tag
        for operations in schema["paths"].values()
        for operation in operations.values()
        for tag in operation.get("tags", [])
    }
    assert used <= declared


def test_every_operation_has_a_summary(schema):
    missing = [
        f"{method.upper()} {path}"
        for path, operations in schema["paths"].items()
        for method, operation in operations.items()
        if not operation.get("summary")
    ]
    assert missing == []


def test_analyze_declares_the_errors_it_actually_raises(schema):
    # The route raises 400 in five places and 502 in four, but the schema used
    # to promise only 200 and 422. A generated client had no model for the two
    # statuses it would actually meet in the wild.
    responses = schema["paths"]["/api/analyze"]["post"]["responses"]
    assert {"200", "400", "422", "502"} <= set(responses)
    for status in ("400", "502"):
        content = responses[status]["content"]["application/json"]
        assert content["schema"]["$ref"].endswith("ErrorResponse")


def test_geocode_declares_its_upstream_failure(schema):
    assert "502" in schema["paths"]["/api/geocode"]["get"]["responses"]


def test_stream_is_documented_as_server_sent_events(schema):
    # It returns text/event-stream but was declared application/json, which is
    # actively misleading for the one endpoint the SPA actually uses.
    content = schema["paths"]["/api/analyze/stream"]["post"]["responses"]["200"][
        "content"
    ]
    assert list(content) == ["text/event-stream"]


def test_request_and_response_fields_carry_descriptions(schema):
    # Every property, with no exemptions: Pydantic puts the description on the
    # parent even for a nullable field (which it renders as `anyOf`), so there
    # is no shape that legitimately lacks one.
    schemas = schema["components"]["schemas"]
    for model in ("AnalyzeRequest", "DestinationResult"):
        undocumented = [
            name
            for name, spec in schemas[model]["properties"].items()
            if not spec.get("description")
        ]
        assert undocumented == [], f"{model} has undocumented fields"


def test_analyze_request_carries_a_worked_example(schema):
    examples = schema["components"]["schemas"]["AnalyzeRequest"].get("examples")
    assert examples and examples[0]["destination_type"] == "peak"


def test_redoc_is_gone_and_docs_is_served(schema):
    # One renderer of one document is enough, and ReDoc was the one pulling
    # Montserrat and Roboto from Google Fonts.
    assert client.get("/redoc").status_code == 404
    assert client.get("/docs").status_code == 200


def test_docs_page_points_at_this_services_own_schema():
    assert app.openapi_url in client.get("/docs").text


def test_servers_is_unset_so_try_it_out_targets_the_current_origin(schema):
    # FastAPI's default leaves "Try it out" aimed at whatever origin served the
    # page, which is what makes it work unchanged in local dev, a PR preview,
    # and production. Pinning it would make a local /docs hit the live site.
    assert "servers" not in schema


def test_committed_snapshot_matches_the_live_schema(schema):
    # Mirrors the CI gate so drift is caught by a plain `pytest` run too.
    committed = json.loads(SNAPSHOT.read_text())
    live = json.loads(json.dumps(schema))
    # info.version comes from the build environment. The snapshot pins it, so
    # normalize both sides rather than failing on every released build.
    committed["info"]["version"] = live["info"]["version"] = "pinned"
    assert live == committed, (
        "openapi.json is stale. Run: cd backend && python scripts/generate_openapi.py"
    )
