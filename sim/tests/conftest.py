"""Shared fixtures, and the backend's parsers made importable beside the sim.

The sim's package and the backend's are both called `app`. Rather than rename
either, the backend's `app/` directory is appended to the sim package's
search path, after the sim's own: the sim's modules still win every name
they define, and the names only the backend has (`app.services`, `app.limits`
and the rest) resolve to the backend's files. That is what lets the drift
guards read a sim answer with the pod's own `aggregation.py` rather than with
a copy of it that could agree with the sim and not with the pod.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app

REPO = Path(__file__).resolve().parents[2]
app.__path__.append(str(REPO / "backend" / "app"))

from app import control  # noqa: E402
from app.main import app as sim_app  # noqa: E402


@pytest.fixture
def client() -> Iterator[TestClient]:
    control.reset()
    with TestClient(sim_app) as c:
        yield c
    control.reset()


def read_source(relative: str) -> str:
    """A file of the repo as text, for the guards that read the browser's
    TypeScript the way `openMeteoAggregate.test.ts` reads the Python."""
    return (REPO / relative).read_text()


def as_json(response) -> object:
    return json.loads(response.content)
