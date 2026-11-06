"""No expression is pasted into a script, and the base images are pinned by digest.

Only the two checks no maintained tool makes here yet. GitHub's "require
actions to be pinned to a full-length commit SHA" setting refuses an action
named by tag. zizmor's template-injection audit flags a pasted expression, and
the expression test goes when this repo runs yggdrasil's lint module
(zimmertr/yggdrasil#7). No linter checked for a base image digest on
2026-11-06: not hadolint, Trivy 0.69.1 or Checkov 3.

A `${{ }}` expression inside a `run:` script is pasted into the shell before
the shell parses it, so a value carrying `$(...)` would run. Values reach a
script through `env:` instead.

A digest is the image, a tag is whatever was pushed last (#632).
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

REPO = Path(__file__).parents[2]


def test_no_expression_is_pasted_into_a_script():
    files = sorted((REPO / ".github" / "workflows").glob("*.yml"))
    # A moved directory or a broken glob would otherwise pass with nothing checked.
    assert files
    pasted = [
        f"{p.relative_to(REPO)}: {step.get('name') or step['run'].splitlines()[0]}"
        for p in files
        for job in yaml.safe_load(p.read_text())["jobs"].values()
        for step in job.get("steps", [])
        if "${{" in step.get("run", "")
    ]
    assert pasted == []


def test_the_base_images_are_pinned_by_digest():
    path = REPO / "Dockerfile"
    froms = re.findall(r"^FROM (?:--\S+ )*(\S+)", path.read_text(), re.MULTILINE)
    assert froms
    # tag@digest, so the tag stays readable (and test_node_version.py can read
    # the Node major off it) while the digest decides what is pulled.
    assert [f for f in froms if not re.fullmatch(r"[\w./-]+:[\w.-]+@sha256:[0-9a-f]{64}", f)] == []
