"""Fail a pull request whose title the release pipeline cannot read.

A squash merge makes the PR title the commit's first line, and GitVersion
picks the release bump from that line alone. A title that matches none of its
three patterns still releases, as a patch, so a typo in the prefix of a
breaking change ships it as a patch. This check refuses such a title while it
can still be edited, and names the bump of every title it accepts.

The patterns are read from GitVersion.yml rather than spelled here, so the
check and the engine cannot disagree. GitVersion matches them without regard
to case (measured on 6.8.2: `Fix!: x` is a major), so this does too. Python's
`re` and .NET read the subset the patterns use the same way.

Standard library only: the workflow runs it on the runner's own Python with
no install step, which is what keeps the job free of secrets and caches.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

CONFIG = Path(__file__).resolve().parents[2] / "GitVersion.yml"

# GitVersion tries the major pattern first, then minor, then patch; the first
# match decides, so the order here is the engine's order.
BUMPS = ("major", "minor", "patch")

_LINE = re.compile(r"^(major|minor|patch)-version-bump-message:\s*'(.*)'\s*$", re.MULTILINE)


def load_patterns(config: Path = CONFIG) -> dict[str, re.Pattern[str]]:
    found = {name: raw.replace("''", "'") for name, raw in _LINE.findall(config.read_text())}
    missing = [name for name in BUMPS if name not in found]
    if missing:
        raise ValueError(f"{config.name} has no {', '.join(missing)}-version-bump-message line")
    return {name: re.compile(found[name], re.IGNORECASE) for name in BUMPS}


def bump(title: str, patterns: dict[str, re.Pattern[str]]) -> str | None:
    for name in BUMPS:
        # search, not match: a pattern says for itself where it is anchored.
        if patterns[name].search(title):
            return name
    return None


def main() -> int:
    title = os.environ.get("PR_TITLE", "")
    result = bump(title, load_patterns())
    if result is None:
        print(
            f"::error title=PR title::{title!r} is not a title the release pipeline reads. "
            "Use type(scope): summary, where type is one of the prefixes GitVersion.yml "
            "names, the scope is optional, and a ! before the colon marks a breaking change."
        )
        return 1
    # A major is the one bump that cannot be taken back (image tags and
    # releases are immutable), so it is raised as a warning on the PR page.
    level = "warning" if result == "major" else "notice"
    print(f"::{level} title=PR title::Merging this PR releases a {result} version.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
