"""Shared helpers stay in one module (issue #388).

Each name below existed as two to four exact copies. A copy comes back the
moment someone needs the helper in a module that does not import it yet, which
is how four modules each grew their own environment reader, so a grep over
``backend/app`` is the whole test. It fails loudly with the file that grew the
second definition, because the duplicate works perfectly and nothing else
notices it.
"""

from __future__ import annotations

import ast
import re
from collections.abc import Callable
from pathlib import Path

APP_ROOT = Path(__file__).parent.parent / "app"


def _files_matching(pattern: re.Pattern[str]) -> list[str]:
    return [
        str(py.relative_to(APP_ROOT.parent))
        for py in sorted(APP_ROOT.rglob("*.py"))
        if pattern.search(py.read_text())
    ]


def test_env_reader_has_one_home():
    # The underscore alternative catches the private copies this replaced.
    pattern = re.compile(r"^def _?env_int\(", re.MULTILINE)
    assert _files_matching(pattern) == ["app/env.py"]


def test_the_cold_snapshot_answer_has_one_home():
    # Both national overlays answer an empty cache the same way, and the two
    # copies of that answer are what let one drift into a different status
    # code, message or Retry-After than the other.
    assert _files_matching(re.compile(r"^def unavailable_message\(", re.MULTILINE)) == [
        "app/services/snapshot.py"
    ]
    assert _files_matching(re.compile(r"code=ErrorCode\.snapshot_unavailable")) == [
        "app/services/snapshot.py"
    ]


def test_user_agent_has_one_home():
    # Any literal naming the product and a version, wherever it is spelled.
    # Split so this file cannot match itself if it is ever moved under app/.
    pattern = re.compile(r'"' + "Bluebird" + r'Forecast/\d')
    assert _files_matching(pattern) == ["app/services/http.py"]


def test_an_hourly_column_has_one_reading():
    # `.get(name, [])` answers None for a column sent as an explicit JSON
    # null, where `.get(name) or []` and the browser's `?? []` answer an empty
    # column, and a None column costs a location all of its weather.
    source = (APP_ROOT / "services" / "aggregation.py").read_text()
    assert re.findall(r"\.get\([^()]*,\s*(?:\[\]|\{\})\)", source) == []


def _calls_outside(
    module: Path, wanted: Callable[[ast.Call], bool], home: str | None
) -> list[str]:
    """Each call `wanted` picks out in `module`, unless it sits in `home`."""
    tree = ast.parse(module.read_text())
    found: list[str] = []

    def visit(node: ast.AST, function: str | None) -> None:
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            function = node.name
        if isinstance(node, ast.Call) and wanted(node) and function != home:
            found.append(f"{module.relative_to(APP_ROOT.parent)}:{node.lineno}")
        for child in ast.iter_child_nodes(node):
            visit(child, function)

    visit(tree, None)
    return found


def test_the_hour_floor_has_one_home():
    # A `.replace` that zeroes the minutes and leaves the hour is the hour
    # floor; the day floor and the air-quality cap name `hour=` and are other
    # rules.
    def hour_floor(call: ast.Call) -> bool:
        names = {k.arg for k in call.keywords}
        return (
            isinstance(call.func, ast.Attribute)
            and call.func.attr == "replace"
            and "minute" in names
            and "hour" not in names
        )

    stray = [
        site
        for py in sorted(APP_ROOT.rglob("*.py"))
        for site in _calls_outside(py, hour_floor, "floor_hour")
    ]
    assert stray == []
    assert _files_matching(re.compile(r"^def floor_hour\(", re.MULTILINE)) == ["app/limits.py"]


def test_the_log_reason_has_one_home():
    # A failure with no text of its own is named one way in every log line:
    # its type, or the deadline when it is one, never nothing at all.
    assert _files_matching(re.compile(r"str\(\w+\) or ")) == []
    assert _files_matching(re.compile(r"^def log_reason\(", re.MULTILINE)) == [
        "app/services/errors.py"
    ]


def test_a_retry_after_is_rounded_in_one_place():
    # A rounding without the floor answers `Retry-After: 0` to a shed under a
    # negative configured wait, which asks the caller to come straight back.
    def ceil(call: ast.Call) -> bool:
        return (
            isinstance(call.func, ast.Attribute)
            and call.func.attr == "ceil"
            and isinstance(call.func.value, ast.Name)
            and call.func.value.id == "math"
        )

    modules = [*sorted((APP_ROOT / "ratelimit").glob("*.py")), APP_ROOT / "services" / "errors.py"]
    assert [site for py in modules for site in _calls_outside(py, ceil, "retry_after_seconds")] == []


def test_a_coordinates_identity_has_one_spelling():
    # Two spellings of the 5-decimal rule disagree at zero: a rounded float
    # loses its sign there and the formatted text keeps it.
    home = APP_ROOT / "services" / "cache.py"
    [point_key] = [
        node
        for node in ast.walk(ast.parse(home.read_text()))
        if isinstance(node, ast.FunctionDef) and node.name == "point_key"
    ]
    inside = range(point_key.lineno, (point_key.end_lineno or point_key.lineno) + 1)
    spellings = re.compile(r":\.5f\}|round\([^()]*,\s*5\)")
    hits = [
        f"{py.relative_to(APP_ROOT.parent)}:{n}"
        for py in (home, APP_ROOT / "services" / "candidates.py", APP_ROOT / "services" / "osm" / "enrich.py")
        for n, line in enumerate(py.read_text().splitlines(), 1)
        if spellings.search(line) and not (py == home and n in inside)
    ]
    assert hits == []
