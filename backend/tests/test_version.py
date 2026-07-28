from __future__ import annotations

import pytest
from app.main import app
from app.version import DEV, get_built_at, get_commit, get_version
from fastapi.testclient import TestClient

client = TestClient(app)

BAKED = {
    "APP_VERSION": "1.2.3",
    "APP_COMMIT": "abc1234def",
    "APP_BUILT_AT": "2026-07-27T12:00:00Z",
}


def test_version_reports_the_baked_build(monkeypatch):
    for name, value in BAKED.items():
        monkeypatch.setenv(name, value)
    assert client.get("/api/version").json() == {
        "version": "1.2.3",
        "commit": "abc1234def",
        "built_at": "2026-07-27T12:00:00Z",
    }


def test_version_falls_back_to_dev(monkeypatch):
    # A source checkout or a plain `docker compose up` bakes nothing, and saying
    # so is the point: a build that cannot identify itself must not look like a
    # release.
    for name in BAKED:
        monkeypatch.delenv(name, raising=False)
    assert client.get("/api/version").json() == {
        "version": DEV,
        "commit": DEV,
        "built_at": DEV,
    }


@pytest.mark.parametrize(
    ("getter", "name"),
    [
        (get_version, "APP_VERSION"),
        (get_commit, "APP_COMMIT"),
        (get_built_at, "APP_BUILT_AT"),
    ],
)
def test_empty_build_arg_reads_as_dev(monkeypatch, getter, name):
    # A workflow expression that resolves to nothing passes an empty string
    # rather than leaving the variable absent, so the fallback has to catch
    # falsiness, not just absence.
    monkeypatch.setenv(name, "")
    assert getter() == DEV


def test_openapi_version_tracks_the_build():
    # Guards the original defect: `version` was a hardcoded literal that still
    # read 0.1.0 well into the 0.x series, making the one machine-readable
    # version claim the service published a lie. Under pytest nothing is baked,
    # so the honest answer is "dev"; a released image reports its real semver
    # through the identical path.
    assert app.version == DEV
    assert app.openapi()["info"]["version"] == DEV


def test_version_is_documented_and_tagged():
    operation = app.openapi()["paths"]["/api/version"]["get"]
    assert operation["tags"] == ["metadata"]
    assert operation["summary"]
