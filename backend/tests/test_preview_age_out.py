"""A preview environment ages out when its pull request goes quiet.

Argo CD's pull-request generator deploys every open PR that carries the
`create pr container` label, and nothing else ever removed it, so a preview
lived for as long as its PR stayed open: #330's ran for 19 days on an image
that predated four fixes (#637). `preview-age-out.yml` removes the label from
PRs untouched for longer than one constant, and the generator prunes the
environment on its next poll.

The workflow only runs after merge, so this reads it as text: what it may do
(one permission), where the limit is written (once), and the two `gh` calls
that do the work.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).parents[2]
WORKFLOW = REPO / ".github" / "workflows" / "preview-age-out.yml"
LABEL = "create pr container"
LIMIT = "PREVIEW_MAX_AGE_DAYS"


@pytest.fixture(scope="module")
def doc() -> dict:
    # Skips where the repo root is not mounted, like test_workflow_pins.py.
    if not (REPO / ".github").exists():
        pytest.skip("repo root not visible")
    assert WORKFLOW.exists(), "no workflow ages out stale previews"
    return yaml.safe_load(WORKFLOW.read_text())


def _steps(doc: dict) -> list[dict]:
    return [s for job in doc["jobs"].values() for s in job.get("steps", [])]


def _script(doc: dict) -> str:
    return "\n".join(s.get("run", "") for s in _steps(doc))


def test_it_runs_daily_and_on_demand(doc):
    # PyYAML reads a bare `on:` key as the boolean True.
    triggers = doc.get("on", doc.get(True))
    assert set(triggers) == {"schedule", "workflow_dispatch"}
    assert len(triggers["schedule"]) == 1
    minute, hour, *rest = triggers["schedule"][0]["cron"].split()
    assert minute.isdigit() and hour.isdigit() and rest == ["*", "*", "*"]


def test_its_only_permission_is_pull_requests_write(doc):
    assert doc["permissions"] == {"pull-requests": "write"}
    assert [n for n, job in doc["jobs"].items() if "permissions" in job] == []


def test_the_age_limit_is_one_env_constant(doc):
    days = doc["env"][LIMIT]
    assert isinstance(days, int) and days > 0
    script = _script(doc)
    assert f"${LIMIT}" in script or f"${{{LIMIT}}}" in script
    # Spelled once: the number appears nowhere but its own declaration.
    text = WORKFLOW.read_text()
    assert text.count(f"{LIMIT}: {days}") == 1
    assert str(days) not in script


def test_it_lists_open_labelled_prs_and_removes_the_label_from_stale_ones(doc):
    steps = [s for s in _steps(doc) if "run" in s]
    assert steps
    # The label reaches the script through env:, like every other value.
    assert any(s.get("env", {}).get("LABEL") == LABEL for s in steps)
    script = _script(doc)
    assert 'gh pr list --label "$LABEL" --state open' in script
    assert "--json number,updatedAt" in script
    assert "updatedAt" in script.split("gh pr list", 1)[1]
    assert 'gh pr edit "$n" --remove-label "$LABEL"' in script


def test_any_checkout_keeps_no_credentials(doc):
    checkouts = [s for s in _steps(doc) if str(s.get("uses", "")).startswith("actions/checkout@")]
    assert [s for s in checkouts if s.get("with", {}).get("persist-credentials") is not False] == []
