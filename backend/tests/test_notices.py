"""NOTICES.md's software tables name every direct runtime dependency (#571).

The image's ``third-party-licenses.txt`` is written by the build from what it
actually ships, so nothing there can go stale. The two tables in NOTICES.md are
hand-written, and nothing tied them to the manifests: a dependency added to
``frontend/package.json`` or ``backend/requirements.in`` reached production
with no row, and the one license column that had drifted (prometheus-client,
which is two licenses) went unnoticed. This holds both tables to their manifest
in both directions, and each license cell to the license the package itself
declares: the npm lockfile's ``license`` field, and the installed
distribution's metadata for pip, which is what the build's license file reads.

Development dependencies are out of scope: they are not in either table, and
the few that ship anything (tailwindcss, swagger-ui-dist) are named in the
prose around them rather than in a row.
"""

from __future__ import annotations

import json
import re
from importlib.metadata import PackageNotFoundError, metadata
from pathlib import Path

import pytest

REPO = Path(__file__).parents[2]
NOTICES = REPO / "NOTICES.md"
PACKAGE_JSON = REPO / "frontend" / "package.json"
PACKAGE_LOCK = REPO / "frontend" / "package-lock.json"
REQUIREMENTS = REPO / "backend" / "requirements.in"


def _canonical(name: str) -> str:
    # PEP 503: pip treats prometheus_client and prometheus-client as one name.
    return re.sub(r"[-_.]+", "-", name).lower()


def _table(heading: str) -> dict[str, str]:
    """The package -> license rows of the table that follows ``heading``.

    A cell may name several packages under one license (``react, react-dom``).
    """
    text = NOTICES.read_text()
    start = text.index(heading)
    rows: dict[str, str] = {}
    seen_table = False
    for line in text[start:].splitlines()[1:]:
        if not line.startswith("|"):
            if seen_table:
                break
            continue
        seen_table = True
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if cells[0] in ("Package", "") or set(cells[0]) <= {"-"}:
            continue
        for name in cells[0].split(","):
            rows[name.strip()] = cells[1]
    return rows


@pytest.fixture(autouse=True)
def _repo_root():
    # Skips where the repo root is not mounted, like the Node version test.
    if not NOTICES.exists():
        pytest.skip("repo root not visible")


def test_the_npm_table_names_exactly_the_runtime_dependencies():
    declared = set(json.loads(PACKAGE_JSON.read_text())["dependencies"])
    assert set(_table("Frontend (npm)")) == declared


def test_each_npm_row_carries_the_license_the_lockfile_records():
    packages = json.loads(PACKAGE_LOCK.read_text())["packages"]
    wrong = {
        name: (row, packages[f"node_modules/{name}"].get("license"))
        for name, row in _table("Frontend (npm)").items()
        if packages[f"node_modules/{name}"].get("license") != row
    }
    assert wrong == {}, "NOTICES.md row vs lockfile license"


def _requirements() -> set[str]:
    names = set()
    for line in REQUIREMENTS.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if line and not line.startswith("-"):
            names.add(_canonical(re.split(r"[\[=<>!~; ]", line, maxsplit=1)[0]))
    return names


def test_the_pip_table_names_exactly_the_requirements():
    assert {_canonical(name) for name in _table("Backend (pip)")} == _requirements()


def test_each_pip_row_carries_the_license_the_distribution_declares():
    # Read from the installed metadata, the source the image's license file
    # uses: License-Expression where a wheel has one, else the License header.
    wrong = {}
    for name, row in _table("Backend (pip)").items():
        try:
            meta = metadata(name)
        except PackageNotFoundError:
            pytest.fail(f"{name} is not installed; run the suite through `make test-backend`")
        declared = meta.get("License-Expression") or meta.get("License")
        if declared != row:
            wrong[name] = (row, declared)
    assert wrong == {}, "NOTICES.md row vs installed metadata"
