"""Branding lint: no new identifier may carry the pre-rename spelling.

The product is Bluebird Forecast (#312, #313). Metric families are
``bluebird_forecast_*``, loggers are ``bluebird_forecast.*``, and the
User-Agent is ``BluebirdForecast/...``. A grep of ``backend/app`` is the whole
test, because the old spellings are the ones an agent reading an older issue or
an older dashboard would reach for first.

Repository, image, chart and Kubernetes names are deliberately NOT linted here:
they keep their old spellings until #311, #111 and #315 ship, and each of those
issues carries its own acceptance grep.
"""

import re
from pathlib import Path

APP_ROOT = Path(__file__).parent.parent / "app"

# Spelled in pieces so this file cannot match itself if it is ever moved under
# app/, the same trick styles.test.ts uses on the frontend.
OLD = "bluebird"
BANNED = {
    "metric family with the old prefix": re.compile(rf'"{OLD}_(?!forecast[_.])[a-z]'),
    "logger with the old prefix": re.compile(rf'getLogger\("{OLD}\.'),
    "User-Agent with the old product name": re.compile(rf'"{OLD.capitalize()}/\d'),
    "OpenAPI title with the old product name": re.compile(
        rf'title="{OLD.capitalize()}"'
    ),
}


def test_no_pre_rename_identifiers_in_app():
    violations = []
    for py_file in sorted(APP_ROOT.rglob("*.py")):
        text = py_file.read_text()
        for what, pattern in BANNED.items():
            for m in pattern.finditer(text):
                line = text.count("\n", 0, m.start()) + 1
                violations.append(
                    f"{py_file.relative_to(APP_ROOT.parent)}:{line}: {what}: {m.group(0)}"
                )
    assert not violations, (
        "Pre-rename identifiers (use bluebird_forecast / BluebirdForecast):\n"
        + "\n".join(violations)
    )
