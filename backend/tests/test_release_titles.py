"""The release bump is read from the squash commit's title, and only from it.

GitVersion.yml holds the three patterns, and .github/scripts/check_pr_title.py
is the PR check that reads them. These cases are the table the patterns were
proven on with the real engine (GitVersion 6.8.2, the version CI resolves) in
#562; a row here that changes means the engine table must be run again, because
version 1.0.0 cut by accident cannot be withdrawn (Docker Hub tags and GitHub
releases are immutable). Decision record 0080.
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

import pytest

REPO = Path(__file__).parents[2]
SCRIPT = REPO / ".github" / "scripts" / "check_pr_title.py"


@pytest.fixture(scope="module")
def check():
    # Skips where the repo root is not mounted, like test_node_version.py.
    if not SCRIPT.exists():
        pytest.skip("repo root not visible")
    spec = importlib.util.spec_from_file_location("check_pr_title", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def patterns(check):
    return check.load_patterns(REPO / "GitVersion.yml")


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        # Any type, scoped or not, with `!` before the colon is a major.
        ("feat!: x", "major"),
        ("feat(api)!: x", "major"),
        ("fix!: x", "major"),
        ("fix(ui)!: x", "major"),
        ("chore!: x", "major"),
        ("refactor(api)!: x", "major"),
        ("build!: x", "major"),
        # GitVersion ignores case, measured.
        ("Fix!: x", "major"),
        ("feat: x", "minor"),
        ("Feat: x", "minor"),
        ("fix: x", "patch"),
        ("docs: x", "patch"),
        # The body never counts: GitHub squashes as title, blank line, PR body.
        ("feat: x\n\nBREAKING CHANGE: y", "minor"),
        ("feat: x\n\nSome prose.\n\nfix!: y", "minor"),
        ("fix: x\n\n+semver: major", "patch"),
        # A `!` anywhere but straight after the type or scope is not a major.
        ("fix: stop the crash!", "patch"),
        ("fix: handle feat!: in titles", "patch"),
        ("fix(ui): explain feat(api)!: titles", "patch"),
        # What the bots send.
        ("build(deps): Bump vite from 7.1.0 to 7.1.1", "patch"),
        ("build(deps-dev): Bump vitest from 4.0.1 to 4.0.2", "patch"),
        ("chore(release): bump chart appVersion to 0.92.2", "patch"),
        # Read by no pattern: the engine falls back to a patch and the PR check
        # refuses the title. A title that starts `BREAKING CHANGE:` is one.
        ("BREAKING CHANGE: x", None),
        ('Revert "feat!: x"', None),
        ("Merge pull request #999 from zimmertr/topic", None),
        ("Update README", None),
    ],
)
def test_the_title_decides_the_bump(check, patterns, message, expected):
    assert check.bump(message, patterns) == expected


def test_no_pattern_reads_past_the_first_line(patterns):
    for pattern in patterns.values():
        assert pattern.pattern.startswith("^"), pattern.pattern
        assert not pattern.flags & re.MULTILINE
        assert "(?m)" not in pattern.pattern


def test_every_type_the_pipeline_reads_can_be_marked_breaking(patterns):
    def types(pattern: re.Pattern[str]) -> set[str]:
        head = re.match(r"\^\(?([a-z|]+)", pattern.pattern)
        assert head, pattern.pattern
        return set(head.group(1).split("|"))

    assert types(patterns["major"]) == types(patterns["minor"]) | types(patterns["patch"])


@pytest.mark.parametrize(
    ("title", "code", "level"),
    [
        ("feat(api)!: x", 0, "::warning "),
        ("build(deps): Bump x from 1.0.0 to 1.0.1", 0, "::notice "),
        ("Update README", 1, "::error "),
    ],
)
def test_the_check_fails_only_an_unread_title(check, monkeypatch, capsys, title, code, level):
    monkeypatch.setenv("PR_TITLE", title)
    assert check.main() == code
    assert capsys.readouterr().out.startswith(level)
