# 0276. The PR title check and Docker Build run on yggdrasil's modules

- Status: Accepted
- Date: 2026-11-06
- Decider: the maintainer (TJ), 2026-11-06, in zimmertr/yggdrasil#6: "Sounds good to me, lets begin"
- Issues and PRs: zimmertr/yggdrasil#6 (step 4.1), this PR
- Cited in code as: `.github/workflows/pr-title.yml`, `.github/workflows/pr.yml`
- Guide: [`docs/CICD.md`](../CICD.md), the `pr.yml` and `pr-title.yml` summaries

## Context

zimmertr/yggdrasil's modules were extracted from this repo's workflows and hevy-trainer-sync's (zimmertr/yggdrasil#4), and hevy-trainer-sync already runs on them (zimmertr/yggdrasil#5). Keeping Bluebird's copies meant every fix landed twice. This is the first of three PRs: the PR checks here, then the Dependabot auto-merge and the weekly scan, then the release.

## Decision

- `pr-title.yml` calls yggdrasil's `pr-title` module, and `pr.yml`'s `docker-build` job calls its `docker-build` module, each pinned to v0.8.1's commit SHA with the version in a comment.
- What is Bluebird's own stays here: the sentinel build arguments, the smoke test, the Actions layer cache, and the image upload the Lighthouse and Browser jobs load.
- `Planet Fill` stays a local job. Its scan gate uses `trivy-action`'s own `severity` and `exit-code` inputs, as the module does, in place of `.github/actions/trivy-crit-high`, which only the release and the weekly scan still use.
- `.github/scripts/check_pr_title.py` and `backend/tests/test_release_titles.py` are deleted. `GitVersion.yml` and `trivy.yaml` stay until the release moves.
- Dependabot checks the pinned actions daily, and proposes a release only once it is three days old, as yggdrasil's record 0023 asks of every repo that calls its modules.

## Evidence

- 2026-11-06: the `pr-title` module allows the same ten types `GitVersion.yml`'s patterns name, so the two still agree on which titles release.
- 2026-11-06: the module names the image `bluebird:pr-scan` and the artifact `bluebird-image`, holding `bluebird-image.tar`, the names the Lighthouse and Browser jobs already load.
- 2026-11-06: `test_workflow_pins.py`'s pin pattern already accepts a reusable workflow's path pinned by SHA, so it needed no change.

## Alternatives rejected

- Keeping this repo's copies: every fix lands twice, and the copies drift.
- One PR for the whole switch: a failure would be hard to pin down, and so would the rollback.
- Moving `Planet Fill` onto the module: the module builds one Dockerfile at its context's root and has no input for `fill/Dockerfile` or the fill's test database.

## Consequences

- Two required checks are renamed, because a called workflow's check is named `<this job> / <module job>`: `PR Title / PR Title` and `Docker Build / Docker Build`.
- The PR title check no longer names the bump on the PR or warns on a major. It checks the type only.
- The sticky scan comment is matched by the module's `image-scan` header. A PR opened before this one keeps its old comment, and gets a second one on its next push.
- A module change reaches this repo only as a Dependabot PR that moves the pin, three days after its release.
