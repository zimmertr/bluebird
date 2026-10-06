"""What the release pipeline runs is fixed by commit, and only main releases.

A tag is a pointer its owner can move, so an action named by tag runs whatever
that tag names on the day of the run, inside a job that may hold a write token
or `GH_PAT`. A full commit SHA cannot move; the version beside it in a comment
is what Dependabot reads to propose the next pin. The same holds for the base
images: a digest is the image, a tag is whatever was pushed last (#632).

`release.yml` also accepts `workflow_dispatch`, and a dispatch from any other
branch would build that branch, push its image and open the bump into
Kubernetes-Manifests, so every job carries a ref check.

A `${{ }}` expression inside a `run:` script is pasted into the shell before
the shell parses it, so a value carrying `$(...)` would run. Values reach a
script through `env:` instead, the way the PR title already does.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).parents[2]
GITHUB = REPO / ".github"

# owner/repo[/path]@<40 hex> # <version>
PINNED = re.compile(r"^[\w.-]+/[\w./-]+@[0-9a-f]{40} # v?\d+\.\d+\.\d+$")
MAIN_ONLY = "github.ref == 'refs/heads/main'"


@pytest.fixture(scope="module")
def files() -> list[Path]:
    # Skips where the repo root is not mounted, like test_node_version.py.
    if not GITHUB.exists():
        pytest.skip("repo root not visible")
    return sorted([*GITHUB.glob("workflows/*.yml"), *GITHUB.glob("actions/*/action.yml")])


def _uses_lines(path: Path) -> list[str]:
    # The raw line rather than the parsed value: the version comment is part of
    # the pin, and a YAML parser drops comments.
    return [
        m.group(1).strip()
        for m in re.finditer(r"^\s*(?:-\s*)?uses:\s*(.+)$", path.read_text(), re.MULTILINE)
    ]


def _steps(doc: dict) -> list[dict]:
    if "jobs" in doc:
        return [s for job in doc["jobs"].values() for s in job.get("steps", [])]
    return doc.get("runs", {}).get("steps", [])


def test_every_action_is_pinned_to_a_commit(files):
    loose = [
        f"{p.relative_to(REPO)}: {ref}"
        for p in files
        for ref in _uses_lines(p)
        if not ref.startswith("./") and not PINNED.match(ref)
    ]
    assert loose == []


def test_no_expression_is_pasted_into_a_script(files):
    pasted = [
        f"{p.relative_to(REPO)}: {step.get('name') or step['run'].splitlines()[0]}"
        for p in files
        for step in _steps(yaml.safe_load(p.read_text()))
        if "${{" in step.get("run", "")
    ]
    assert pasted == []


def test_every_release_job_runs_on_main_only():
    path = GITHUB / "workflows" / "release.yml"
    if not path.exists():
        pytest.skip("repo root not visible")
    jobs = yaml.safe_load(path.read_text())["jobs"]
    ungated = [name for name, job in jobs.items() if MAIN_ONLY not in str(job.get("if", ""))]
    assert ungated == []


def test_the_base_images_are_pinned_by_digest():
    path = REPO / "Dockerfile"
    if not path.exists():
        pytest.skip("repo root not visible")
    froms = re.findall(r"^FROM (?:--\S+ )*(\S+)", path.read_text(), re.MULTILINE)
    assert froms
    # tag@digest, so the tag stays readable (and test_node_version.py can read
    # the Node major off it) while the digest decides what is pulled.
    assert [f for f in froms if not re.fullmatch(r"[\w./-]+:[\w.-]+@sha256:[0-9a-f]{64}", f)] == []
