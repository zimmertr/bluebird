"""The image's structure test names every direct dependency, and only those.

``tests/structure-test.yaml`` checks that the image's
``third-party-licenses.txt`` names each direct dependency, one pattern per
name, because container-structure-test cannot read the manifests at the repo
root. This holds that list to ``frontend/package.json`` and
``backend/requirements.in`` in both directions, so a dependency added to either
fails here until the structure test checks its notice too.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).parents[2]
STRUCTURE_TEST = REPO / "tests" / "structure-test.yaml"


def _npm_names() -> set[str]:
    return set(json.loads((REPO / "frontend" / "package.json").read_text())["dependencies"])


def _pip_names() -> set[str]:
    names = set()
    for line in (REPO / "backend" / "requirements.in").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith(("#", "-")):
            continue
        names.add(re.split(r"[\[<>=!~ ;]", line, maxsplit=1)[0])
    return names


def _pattern(name: str, *, pip: bool) -> str:
    # pip reads prometheus_client and prometheus-client as one name, and the
    # file spells it the way the distribution's metadata does.
    if pip:
        name = re.sub(r"[-_.]+", "[-_.]+", name.lower())
    return rf"(?im)^{name} \S+$"


def test_the_notice_patterns_are_the_direct_dependencies():
    written = set(re.findall(r"^\s*- '(\(\?im\)\^.+)'$", STRUCTURE_TEST.read_text(), re.MULTILINE))
    wanted = {_pattern(name, pip=False) for name in _npm_names()} | {
        _pattern(name, pip=True) for name in _pip_names()
    }
    assert written == wanted, (
        "tests/structure-test.yaml's third-party-licenses.txt patterns differ from the manifests.\n"
        f"Missing: {sorted(wanted - written)}\nExtra: {sorted(written - wanted)}"
    )
