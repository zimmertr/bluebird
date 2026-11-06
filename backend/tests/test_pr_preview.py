"""A preview tag is pushed once.

A preview tag names its PR and head commit, so a re-run or a reopen on the
same commit asks for a tag that already exists. Once `zimmertr/bluebird-pr`
refuses to overwrite a tag, that second push would fail the preview, so the
workflow asks first and builds only when the tag is new.
"""

from __future__ import annotations

from pathlib import Path

import yaml

WORKFLOW = Path(__file__).parents[2] / ".github" / "workflows" / "pr-preview.yml"


def test_a_preview_tag_is_pushed_once():
    steps = yaml.safe_load(WORKFLOW.read_text())["jobs"]["preview"]["steps"]
    build = [s for s in steps if str(s.get("uses", "")).startswith("docker/build-push-action@")]
    assert len(build) == 1
    condition = str(build[0].get("if", ""))
    checks = [
        s
        for s in steps
        if s.get("id")
        and f"steps.{s['id']}.outputs." in condition
        and "docker manifest inspect" in s.get("run", "")
    ]
    assert checks, "the preview build runs without asking whether its tag exists"
