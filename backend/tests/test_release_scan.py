"""Production moves only onto a scanned image, and a preview tag is pushed once.

The PR gate scans an amd64 image it builds itself, minutes before the merge.
The release then builds again, from the squash commit, for amd64 and arm64,
and that is the image production pulls. Branch protection is not strict, so
the squash tree can be a combination no PR built, and nothing gated arm64 at
all. So the release scans what it pushed, by digest rather than by tag, once
per platform, and every job after it waits on that scan (#634): the two that
move production or the chart's default image, and the GitHub release, whose
Latest is what bluebird-helm reads the chart's default image from. The image
and its tag stay published when the scan fails: production simply stays where
it is until a fix releases.

A preview tag names its PR and head commit, so a re-run or a reopen on the
same commit asks for a tag that already exists. Once `zimmertr/bluebird-pr`
refuses to overwrite a tag, that second push would fail the preview, so the
workflow asks first and builds only when the tag is new.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).parents[2]
WORKFLOWS = REPO / ".github" / "workflows"

COUNT_ACTION = "./.github/actions/trivy-crit-high"
PLATFORMS = {"linux/amd64", "linux/arm64"}
# Everything that tells the world the release is good: the production image
# tag in Kubernetes-Manifests, the chart's default image in bluebird-helm, and
# the GitHub release, whose Latest bluebird-helm's own release reads that
# default from at package time.
DOWNSTREAM = ("create-release", "update-manifests", "bump-chart-appversion")


def _workflow(name: str) -> dict:
    path = WORKFLOWS / name
    # Skips where the repo root is not mounted, like test_workflow_pins.py.
    if not path.exists():
        pytest.skip("repo root not visible")
    return yaml.safe_load(path.read_text())


def _needs(job: dict) -> list[str]:
    needs = job.get("needs", [])
    return [needs] if isinstance(needs, str) else list(needs)


def _uses(step: dict, action: str) -> bool:
    return str(step.get("uses", "")).startswith(f"{action}@")


@pytest.fixture(scope="module")
def jobs() -> dict:
    return _workflow("release.yml")["jobs"]


def _scan(jobs: dict) -> tuple[str, dict]:
    # The scan job is the one that counts Critical/High findings, whatever it
    # is called, so a rename cannot slip the bump jobs out from behind it.
    found = [
        (name, job)
        for name, job in jobs.items()
        if any(step.get("uses") == COUNT_ACTION for step in job.get("steps", []))
    ]
    assert len(found) == 1, "release.yml has no job that gates on the Trivy count"
    return found[0]


def test_the_release_scans_after_the_push(jobs):
    _, job = _scan(jobs)
    assert "build-and-push" in _needs(job)


def test_the_scan_reads_the_pushed_digest_not_a_tag(jobs):
    # The build step's own digest, so the scanned bytes are the pushed bytes.
    assert "outputs.digest" in str(jobs["build-and-push"].get("outputs", {}).get("digest", ""))
    _, job = _scan(jobs)
    trivy = [s for s in job["steps"] if _uses(s, "aquasecurity/trivy-action")]
    assert len(trivy) == 1
    ref = trivy[0]["with"]["image-ref"]
    assert "@${{ needs.build-and-push.outputs.digest }}" in ref
    assert "semVer" not in ref
    # trivy.yaml holds the exclusions the PR gate and the weekly scan apply.
    assert trivy[0]["with"].get("trivy-config") == "trivy.yaml"


def test_the_scan_covers_both_platforms(jobs):
    _, job = _scan(jobs)
    assert set(job.get("strategy", {}).get("matrix", {}).get("platform", [])) == PLATFORMS
    # The digest names the multi-platform index; without a platform Trivy
    # reads its amd64 half on every leg and arm64 is never scanned.
    trivy = next(s for s in job["steps"] if _uses(s, "aquasecurity/trivy-action"))
    assert trivy.get("env", {}).get("TRIVY_PLATFORM") == "${{ matrix.platform }}"


@pytest.mark.parametrize("downstream", DOWNSTREAM)
def test_the_release_waits_on_the_scan(jobs, downstream):
    name, _ = _scan(jobs)
    assert name in _needs(jobs[downstream])


def test_a_preview_tag_is_pushed_once():
    steps = _workflow("pr-preview.yml")["jobs"]["preview"]["steps"]
    build = [s for s in steps if _uses(s, "docker/build-push-action")]
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
