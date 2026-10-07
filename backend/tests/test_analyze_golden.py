"""What both analyze routes answer, pinned byte for byte.

`tests/data/analyze_golden.json` records, for a fixed set of stubbed requests,
the JSON route's status, `Retry-After` and body, every event of the stream, and
every argument each upstream fetch was given. It is the guard for
restructuring the analysis: a change meant to move no behavior leaves the file
unchanged, and a change meant to move an answer regenerates it
(`python scripts/generate_analyze_golden.py`) in the same PR and says why.

This module and the script import nothing from the analyze route module, so
moving code out of that module cannot edit the check that the move is judged
by.
"""

from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))

from generate_analyze_golden import CASES, render  # noqa: E402 — after the sys.path insert above

GOLDEN = Path(__file__).parent / "data" / "analyze_golden.json"
APP_ROOT = Path(__file__).resolve().parent.parent / "app"


@pytest.fixture(scope="module")
def rendered() -> str:
    return render()


def test_every_case_answers_as_recorded(rendered):
    # Case by case first, so a failure names the request and the route that
    # moved rather than printing one diff of the whole file.
    recorded = {c["name"]: c for c in json.loads(GOLDEN.read_text())["cases"]}
    now = {c["name"]: c for c in json.loads(rendered)["cases"]}
    assert list(now) == list(recorded), "the case list changed; regenerate the record"
    for name, case in now.items():
        for route in ("json", "stream"):
            assert case[route] == recorded[name][route], (
                f"{name} on the {route} route no longer answers as recorded.\n"
                "If that change is intended, regenerate the record:\n"
                "    cd backend && python scripts/generate_analyze_golden.py"
            )


def test_the_record_is_byte_for_byte_what_the_script_writes(rendered):
    # Parsed equality above cannot see an escape or a key order inside a
    # recorded body, because each body is stored as the exact text sent.
    assert GOLDEN.read_text() == rendered


def test_the_record_reads_the_cases_it_claims_to():
    # A stub that stopped being reached would record the same empty answer for
    # every case, and a record of nothing agrees with itself.
    cases = json.loads(GOLDEN.read_text())["cases"]
    assert len(cases) == len(CASES)
    statuses = {c["json"]["status"] for c in cases}
    assert {200, 400, 401, 429, 502, 503} <= statuses
    assert any(c["json"]["calls"]["weather"] for c in cases)
    assert any(c["json"]["calls"]["cloud"] for c in cases)


# The upstream fetches every route test stubs, by the module a test patches.
# A test replaces each one there, so code that reaches it any other way escapes
# every stub and calls the real API.
_STUBBED = {
    "app.services.weather": {"fetch_weather_batch", "fetch_cloud_batch"},
    "app.services.air_quality": {"fetch_aqi_batch"},
    "app.services.osm": {"query_osm", "enrich_custom", "enrich_custom_reporting"},
}
# The osm package's inner modules that define the two discovery fetches. The
# package re-exports both and a test patches them there, so reaching either
# through its inner module calls the real function.
_OSM_INSIDE = {"mirrors", "enrich"}


def _module_of(py: Path) -> list[str]:
    """The dotted package a file's relative imports resolve against."""
    parts = list(py.relative_to(APP_ROOT.parent).with_suffix("").parts)
    # A package's own `__init__` resolves against the package itself.
    return parts[:-1]


def _resolve(py: Path, node: ast.ImportFrom) -> str:
    if not node.level:
        return node.module or ""
    package = _module_of(py)
    base = package[: len(package) - (node.level - 1)]
    return ".".join(base + ([node.module] if node.module else []))


def _stub_escapes(py: Path) -> list[str]:
    """Every way this file reaches a stubbed fetch other than through the
    module a test patches."""
    inside_osm = py.is_relative_to(APP_ROOT / "services" / "osm")
    escapes = []
    for node in ast.walk(ast.parse(py.read_text())):
        where = f"{py.relative_to(APP_ROOT.parent)}:{getattr(node, 'lineno', 0)}"
        if isinstance(node, ast.ImportFrom):
            module = _resolve(py, node)
            for owner, names in _STUBBED.items():
                if module != owner and not module.startswith(owner + "."):
                    continue
                for alias in node.names:
                    # The osm package re-exports its own two fetches, which is
                    # the one binding a test's patch on the package replaces.
                    reexport = py == APP_ROOT / "services" / "osm" / "__init__.py"
                    if (alias.name in names and not reexport) or alias.name == "*":
                        escapes.append(f"{where} from {module} import {alias.name}")
            if module == "app.services.osm" and not inside_osm:
                escapes += [f"{where} imports osm.{a.name}" for a in node.names if a.name in _OSM_INSIDE]
        elif isinstance(node, ast.Import) and not inside_osm:
            escapes += [
                f"{where} import {a.name}"
                for a in node.names
                if a.name.startswith("app.services.osm.")
            ]
        elif isinstance(node, ast.Attribute) and not inside_osm:
            # `osm.mirrors.query_osm`, or `mirrors.query_osm` after importing
            # the inner module, calls the function the patch replaced on the
            # package rather than the patch.
            inner = node.value
            if (
                node.attr in _STUBBED["app.services.osm"]
                and isinstance(inner, (ast.Attribute, ast.Name))
                and getattr(inner, "attr", getattr(inner, "id", None)) in _OSM_INSIDE
            ):
                escapes.append(f"{where} {ast.unparse(node)}")
    return escapes


def test_the_stubbed_fetches_are_read_through_their_module():
    """`from app.services.weather import fetch_weather_batch` binds the real
    function into the importing module, and a stub installed later on
    `weather` never reaches it. So does a relative spelling of the same import,
    a star import, and a discovery fetch reached through the osm package's
    inner modules rather than the package. ruff's banned-api cannot say this:
    it bans the name however it is reached, so it also flags the correct
    `weather.fetch_weather_batch`.
    """
    found = [e for py in sorted(APP_ROOT.rglob("*.py")) for e in _stub_escapes(py)]
    assert not found, f"import the service module and call through it instead: {found}"
