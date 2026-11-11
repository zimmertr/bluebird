# 0284. Renovate keeps dependencies current, under yggdrasil's shared preset

- Status: Accepted; supersedes 0273, and 0277 in part
- Date: 2026-11-11
- Decider: the maintainer (TJ), 2026-11-11, in zimmertr/yggdrasil#40: "I am tempted to switch everything and just define it in yggdrasil and import it into the child repos", then "I agree, lets do it." On the wait: "Lets make sure everything has at least a 1-week cooldown then." On merging: "I need auto-merging as much as possible."
- Issues and PRs: zimmertr/yggdrasil#40, zimmertr/yggdrasil#90, this PR
- Cited in code as: `.github/renovate.json`, `.github/workflows/pr.yml`
- Guide: [`docs/CICD.md`](../CICD.md), Dependency updates

## Context

Dependabot opened the update PRs from a 118-line `.github/dependabot.yml`, and `dependabot-auto-merge.yml` armed a merge on its patches and minors (records 0273 and 0277). The maintainer then moved every repo to Renovate, with the rules they share written once in zimmertr/yggdrasil's `defaults/renovate.json` (its record 0056).

## Decision

- `.github/renovate.json` extends `github>zimmertr/yggdrasil//defaults/renovate`. The preset holds the seven-day wait, the rule that everything below a major merges itself, and the rule that yggdrasil's own modules don't wait.
- Renovate's `pip-compile` manager reads `backend/requirements.txt` and `backend/requirements-dev.txt` and recompiles them. `pip_requirements` is off, so nothing bumps a lock's pin without its hashes.
- `constraints.pipTools` and the `Makefile`'s `PIP_TOOLS_VERSION` are both 7.6.2, and both locks are recompiled with it, because `Python Lint` recompiles the locks and fails on any difference.
- TypeScript majors stay off in `frontend/tools/api-types` and `frontend/tools/eslint`, as they were (record 0030).
- `ignorePaths` drops Renovate's default test folders, so `backend/tests/db/Dockerfile` keeps its updates.
- `.github/dependabot.yml` and `dependabot-auto-merge.yml` are gone. Dependabot's alerts and security updates stay on.

## Evidence

- 2026-11-11: Renovate 44.221.6, run against this repo in its own image with `--platform=local`, refused both locks: `Option --no-index not supported (yet)`. pip-tools 7.5.3 wrote `--no-index` into each header. `make lock-backend` on 7.6.2 changed that one line in each lock and nothing else.
- 2026-11-11: in Renovate's image, with the Python 3.15.0 and pip-tools 7.6.2 it installs, `pip-compile` wrote both locks byte for byte as `make lock-backend` does in `python:3.15-alpine`.
- 2026-11-11, the same local run: it put `vitest` and `@vitest/coverage-v8` on one branch (`renovate/vitest-monorepo`) with no rule of this repo's, dropped the two TypeScript majors, and skipped `backend/tests/db/Dockerfile` until `ignorePaths` was set. It planned 14 branches, 8 of them not waiting. That run looks updates up and opens nothing, so a lock recompiled by Renovate itself is still unseen.
- 2026-11-11: in Personal-Website, a merge Renovate armed started the release (zimmertr/Personal-Website#21, v1.3.9), with no token of that repo's.

## Alternatives rejected

- Keeping Dependabot for pip alone: two bots, two sets of rules, and the auto-merge module and `AUTO_MERGE_PAT` kept for one ecosystem.
- A `vitest` group of this repo's own: Renovate's monorepo grouping already moves the pair together.
- A weekly schedule, as Dependabot's npm and pip entries had: not asked for. It is one `schedule` line if the releases come too often.

## Consequences

- Base-image digests and GitHub Actions bumps now merge themselves. Under Dependabot both waited for the maintainer: a digest carried no update type, and `AUTO_MERGE_PAT` could not merge a workflow edit.
- Titles change from `build(deps): ...` to `chore(deps): ...` or `fix(deps): ...`. All are patches.
- Updates no longer arrive on Mondays only. Renovate opens each one seven days after its release, two an hour at most, and every merge is a release.
- A new pip-tools version moves in two places together: `constraints.pipTools` and `PIP_TOOLS_VERSION`.
- The `AUTO_MERGE_PAT` secret is unused.
