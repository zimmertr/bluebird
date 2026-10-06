"""What the image installs is locked, and what installs it runs no package code.

Three halves of one rule (#633). ``requirements.in`` names the backend's direct
pins and ``requirements.txt`` is pip-compile's lock of them, every indirect
package included and every one hashed, which is the file the image installs
with ``--require-hashes`` and the one GitHub's dependency graph reads, so an
advisory against Starlette reaches an alert. ``requirements-dev.txt`` is the
same lock with the test tools on top, constrained to the runtime lock, so the
suite runs against the versions the image ships. Dependabot recompiles both
from their ``.in`` files.

Every ``npm ci`` passes ``--ignore-scripts``: the app's lockfile holds two
packages with an install script, ``fsevents`` (macOS only) and
``@scarf/scarf`` (install telemetry), and none that needs one on Linux.

Every npm and pip Dependabot entry carries a cooldown, because a patch bump
auto-merges and a merge to main deploys.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

BACKEND = Path(__file__).parents[1]
REPO = BACKEND.parent

# A lock entry is `name==version \` followed by its `--hash=` lines.
_LOCK_ENTRY = re.compile(r"^([A-Za-z0-9][A-Za-z0-9._-]*)==(\S+?)(?:\s*\\)?$((?:\n\s+--hash=\S+(?:\s*\\)?)*)", re.M)


def _canonical(name: str) -> str:
    # PEP 503: pip treats prometheus_client and prometheus-client as one name.
    return re.sub(r"[-_.]+", "-", name).lower()


def _direct_pins(path: Path) -> dict[str, str]:
    pins = {}
    for line in path.read_text().splitlines():
        line = line.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        name, _, version = line.partition("==")
        assert version, f"{path.name}: {line!r} is not an exact pin"
        pins[_canonical(name.split("[", 1)[0])] = version.strip()
    return pins


def _lock(path: Path) -> dict[str, tuple[str, int]]:
    """name -> (version, number of hashes) for every package the lock pins."""
    return {
        _canonical(name): (version, hashes.count("--hash="))
        for name, version, hashes in _LOCK_ENTRY.findall(path.read_text())
    }


@pytest.mark.parametrize(
    ("source", "lock"),
    [("requirements.in", "requirements.txt"), ("requirements-dev.in", "requirements-dev.txt")],
)
def test_every_direct_pin_is_locked_at_its_version(source, lock):
    locked = _lock(BACKEND / lock)
    pins = _direct_pins(BACKEND / source)
    assert pins, f"{source} pins nothing"
    wrong = {
        name: (version, locked[name][0] if name in locked else None)
        for name, version in pins.items()
        if name not in locked or locked[name][0] != version
    }
    assert wrong == {}, f"{source} pin vs {lock}: recompile the lock (docs/DEVELOPMENT.md)"


def test_the_dev_lock_installs_what_the_image_installs():
    runtime = {name: version for name, (version, _) in _lock(BACKEND / "requirements.txt").items()}
    dev = {name: version for name, (version, _) in _lock(BACKEND / "requirements-dev.txt").items()}
    assert {name: dev.get(name) for name in runtime} == runtime


@pytest.mark.parametrize("lock", ["requirements.txt", "requirements-dev.txt"])
def test_every_locked_package_carries_a_hash(lock):
    entries = _lock(BACKEND / lock)
    # Every requirement line in the file is an entry the pattern read, so a
    # line it skipped cannot be an unhashed package hiding from this check.
    lines = [line for line in (BACKEND / lock).read_text().splitlines() if re.match(r"[A-Za-z0-9]", line)]
    assert len(entries) == len(lines) > 0
    assert [name for name, (_, hashes) in entries.items() if hashes == 0] == []


def test_the_image_installs_the_lock_and_requires_its_hashes():
    if not (REPO / "Dockerfile").exists():
        pytest.skip("repo root not visible")
    dockerfile = (REPO / "Dockerfile").read_text()
    assert "COPY backend/requirements.txt ./" in dockerfile
    assert re.search(r"pip install --require-hashes -r requirements\.txt\b", dockerfile)
    # The only other pip install in the image is pip upgrading itself.
    installs = re.findall(r"pip install [^\n\\&]*", dockerfile)
    assert sorted(i.strip() for i in installs) == [
        "pip install --require-hashes -r requirements.txt",
        "pip install --upgrade pip",
    ]


def _npm_ci_sites() -> list[tuple[str, str]]:
    paths = [REPO / "Dockerfile", REPO / "Makefile", REPO / "frontend" / "package.json"]
    paths += sorted((REPO / ".github" / "workflows").glob("*.yml"))
    sites = []
    for path in paths:
        for line in path.read_text().splitlines():
            if line.lstrip().startswith("#"):
                continue
            for match in re.finditer(r"\bnpm (?:--prefix \S+ )?ci\b[^\n&\"]*", line):
                sites.append((path.name, match.group(0)))
    return sites


def test_no_npm_ci_runs_install_scripts():
    if not (REPO / "Dockerfile").exists():
        pytest.skip("repo root not visible")
    sites = _npm_ci_sites()
    # Dockerfile 1, Makefile 4, package.json 3, pr.yml 2 when this was written:
    # a pattern that stopped matching would otherwise pass on an empty list.
    assert len(sites) >= 10
    assert [site for site in sites if "--ignore-scripts" not in site[1]] == []


def test_every_npm_and_pip_update_waits_a_cooldown():
    config = REPO / ".github" / "dependabot.yml"
    if not config.exists():
        pytest.skip("repo root not visible")
    entries = [
        entry
        for entry in yaml.safe_load(config.read_text())["updates"]
        if entry["package-ecosystem"] in ("npm", "pip")
    ]
    assert len(entries) >= 2
    waiting = {entry["directory"]: entry.get("cooldown", {}).get("default-days", 0) for entry in entries}
    assert {directory: days for directory, days in waiting.items() if days <= 0} == {}
