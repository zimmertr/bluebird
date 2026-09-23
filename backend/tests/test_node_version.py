"""The Node major is named once, in ``.node-version``.

CI reads that file through setup-node and the Makefile reads it for every
container, but the Dockerfile cannot: a ``FROM`` line takes no file, and a
build argument would hide the tag from Dependabot's base-image bumps. So the
Dockerfile keeps a literal tag and this test holds it to the file. A Dependabot
bump of the base image fails here until ``.node-version`` moves with it, which
is the point: CI would otherwise test a runtime the image no longer ships.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).parents[2]
NODE_VERSION = REPO / ".node-version"


@pytest.fixture
def node_major() -> str:
    # Skips where the repo root is not mounted, like the CSP allowlist test.
    if not NODE_VERSION.exists():
        pytest.skip("repo root not visible")
    return NODE_VERSION.read_text().strip()


def test_the_image_builds_on_the_pinned_major(node_major):
    tags = re.findall(r"^FROM .*?node:(\d+)-", (REPO / "Dockerfile").read_text(), re.MULTILINE)
    assert tags == [node_major]


@pytest.mark.parametrize("path", ["Makefile", "docs/DEVELOPMENT.md", ".github/workflows/pr.yml"])
def test_no_second_spelling_of_the_major(node_major, path):
    text = (REPO / path).read_text()
    assert not re.search(r"node:\d+|node-version:\s", text), f"{path} names a Node version"
