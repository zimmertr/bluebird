"""The runtime stage's ``apk upgrade`` is rebuilt on every build.

Alpine fixes a package before the python base image rebuilds carrying it, and
the layer that pulls those fixes used to sit above the pip install, keyed on
the base digest alone: between base moves every build served a cached copy,
and v0.105.0 shipped zlib 1.3.2-r0 with 1.3.2-r1 already published (alert 39,
2026-10-14). BuildKit keys a ``RUN`` on every build argument in scope, and
``APP_COMMIT`` changes with every commit, so the layer now sits after the
``APP_*`` arguments and before ``USER``, where a rebuild repeats no other work.
Record: docs/decisions/0197-apk-upgrade-on-every-build.md
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).parents[2]


@pytest.fixture
def instructions() -> list[str]:
    path = REPO / "Dockerfile"
    # One entry per instruction: continuation lines fold into the line above.
    joined = re.sub(r"\\\n\s*", " ", path.read_text())
    return [line for line in joined.splitlines() if line and not line.startswith("#")]


def _runtime_stage(instructions: list[str]) -> list[str]:
    starts = [i for i, line in enumerate(instructions) if line.startswith("FROM ")]
    return instructions[starts[-1] :]


def test_apk_upgrade_follows_the_build_args_and_precedes_user(instructions):
    stage = _runtime_stage(instructions)
    upgrades = [i for i, line in enumerate(stage) if line == "RUN apk upgrade --no-cache"]
    assert len(upgrades) == 1, "exactly one apk upgrade in the runtime stage"
    (upgrade,) = upgrades
    args = [i for i, line in enumerate(stage) if re.match(r"ARG APP_(VERSION|COMMIT|BUILT_AT)=", line)]
    assert len(args) == 3 and max(args) < upgrade, "the APP_* ARGs that change per build come first"
    (user,) = [i for i, line in enumerate(stage) if line.startswith("USER ")]
    assert upgrade < user, "apk needs root"


def test_nothing_builds_after_the_apk_upgrade(instructions):
    stage = _runtime_stage(instructions)
    upgrade = stage.index("RUN apk upgrade --no-cache")
    after = [line.split()[0] for line in stage[upgrade + 1 :]]
    assert after == ["USER", "EXPOSE", "HEALTHCHECK", "CMD"]
