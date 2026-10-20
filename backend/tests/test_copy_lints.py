"""Copy lints for user-facing strings in backend code."""

import re
from pathlib import Path


def test_no_smaller_area_remedy_in_app_copy():
    """'Analyze a smaller area' and 'draw a smaller area' were the remedy the
    Open-Meteo rate-limit messages carried (#181) until the string audit
    removed it (#238). A message states what is wrong and names a remedy only
    where it works (docs/STYLES.md).
    """
    backend_root = Path(__file__).parent.parent / "app"

    # Scan all Python files in backend/app
    banned_patterns = [
        r"analyze a smaller area",
        r"draw a smaller area",
    ]

    pattern = re.compile("|".join(banned_patterns), re.IGNORECASE)

    found_violations = []
    for py_file in backend_root.rglob("*.py"):
        with open(py_file) as f:
            content = f.read()
            if pattern.search(content):
                found_violations.append(str(py_file))

    assert not found_violations, (
        f"Found the old smaller-area remedy in: {', '.join(found_violations)}"
    )
