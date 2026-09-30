"""What both analyze routes answer, pinned byte for byte.

`tests/data/analyze_golden.json` records, for a fixed set of stubbed requests,
the JSON route's status, `Retry-After` and body, every event of the stream, and
how many destinations each upstream fetch was asked about. It is the guard for
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


# The upstream fetches every route test stubs. A test replaces each one on its
# service module, so code that reads it any other way escapes every stub and
# reaches the real API.
_STUBBED = {
    "app.services.weather": {"fetch_weather_batch", "fetch_cloud_batch"},
    "app.services.air_quality": {"fetch_aqi_batch"},
    "app.services.osm": {"query_osm", "enrich_custom"},
}


def test_the_stubbed_fetches_are_read_through_their_module():
    """`from app.services.weather import fetch_weather_batch` binds the real
    function into the importing module, and a stub installed later on
    `weather` never reaches it. The only allowed importer is the osm package
    itself, which re-exports its own two functions from the modules that
    define them. ruff's banned-api cannot say this: it bans the name however
    it is reached, so it also flags the correct `weather.fetch_weather_batch`.
    """
    allowed = {APP_ROOT / "services" / "osm" / "__init__.py"}
    found = []
    for py in sorted(APP_ROOT.rglob("*.py")):
        if py in allowed:
            continue
        for node in ast.walk(ast.parse(py.read_text())):
            if not isinstance(node, ast.ImportFrom) or node.module is None:
                continue
            for module, names in _STUBBED.items():
                if node.module == module or node.module.startswith(module + "."):
                    found += [
                        f"{py.relative_to(APP_ROOT.parent)}:{node.lineno} {a.name}"
                        for a in node.names
                        if a.name in names
                    ]
    assert not found, f"import the service module and call through it instead: {found}"
