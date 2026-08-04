"""Copy lints for user-facing strings in backend code."""

import re
from pathlib import Path


def test_no_defect_2_remedy_phrases():
    """L5: No 'analyze a smaller area' / 'draw a smaller area' phrases.

    The defect-2 remedy has been replaced with more specific suggestions.
    This test scans backend/app/**/*.py source for those phrases.
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
        with open(py_file, "r") as f:
            content = f.read()
            if pattern.search(content):
                found_violations.append(str(py_file))

    assert not found_violations, (
        f"Found defect-2 remedy phrases in: {', '.join(found_violations)}"
    )
