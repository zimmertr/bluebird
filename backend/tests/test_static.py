"""What the image serves from its build output, through the SPA mount.

The image mounts ``static/`` at ``/``, and a source checkout has no such
directory, so these run against stand-in files at the same paths (the
``static_mount`` fixture). ``tests/structure-test.yaml`` checks that the image
holds the real files; together the two say the image serves them.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_the_spa_is_served_at_the_root(static_mount):
    response = client.get("/")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "<title>Bluebird Forecast</title>" in response.text


def test_swagger_ui_is_served_from_this_origin(static_mount):
    assert client.get("/swagger-ui/swagger-ui-bundle.js").status_code == 200


def test_the_bundles_own_notice_is_served_beside_it(static_mount):
    # The notices (#571): the bundle's license ships, and is served, beside it.
    assert client.get("/swagger-ui/swagger-ui-bundle.js.LICENSE.txt").status_code == 200


def test_the_third_party_license_file_is_served_as_text(static_mount):
    response = client.get("/third-party-licenses.txt")
    assert response.status_code == 200
    assert response.headers["content-type"] == "text/plain; charset=utf-8"
