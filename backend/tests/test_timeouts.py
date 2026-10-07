"""Every upstream client names its timeout (#365).

``backend/app/routes/geocode.py`` was the one caller that built an
``httpx.AsyncClient`` with a bare ``timeout=10.0`` while every service named a
constant with a comment beside it saying why that number. It names ``TIMEOUT_S``
now, and this holds the line: a timeout is a decision about how long a visitor
waits, and a bare literal is a decision nobody wrote down.

``timeout=None`` passes. ``services/osm/mirrors.py`` sets it deliberately, so
each attempt can carry its own deadline from the mirror table, and says so on
the line above.
"""

import re
from pathlib import Path

APP_ROOT = Path(__file__).parent.parent / "app"

BARE_TIMEOUT = re.compile(r"AsyncClient\([^)]*\btimeout=\d")


def test_no_async_client_with_a_bare_timeout():
    violations = []
    for py_file in sorted(APP_ROOT.rglob("*.py")):
        text = py_file.read_text()
        for m in BARE_TIMEOUT.finditer(text):
            line = text.count("\n", 0, m.start()) + 1
            violations.append(f"{py_file.relative_to(APP_ROOT.parent)}:{line}: {m.group(0)}")
    assert violations == [], "\n".join(violations)


def test_the_guard_reads_every_client():
    # Vacuous if the clients moved: the scan must see the named ones.
    named = sum(
        len(re.findall(r"AsyncClient\([^)]*\btimeout=[A-Z_]", p.read_text()))
        for p in APP_ROOT.rglob("*.py")
    )
    assert named >= 5
