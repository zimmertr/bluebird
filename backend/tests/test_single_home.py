"""Shared helpers stay in one module (issue #388).

Each name below existed as two to four exact copies. A copy comes back the
moment someone needs the helper in a module that does not import it yet, which
is how four modules each grew their own environment reader, so a grep over
``backend/app`` is the whole test. It fails loudly with the file that grew the
second definition, because the duplicate works perfectly and nothing else
notices it.
"""

from __future__ import annotations

import re
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


def test_user_agent_has_one_home():
    # Any literal naming the product and a version, wherever it is spelled.
    # Split so this file cannot match itself if it is ever moved under app/.
    pattern = re.compile(r'"' + "Bluebird" + r'Forecast/\d')
    assert _files_matching(pattern) == ["app/services/http.py"]
