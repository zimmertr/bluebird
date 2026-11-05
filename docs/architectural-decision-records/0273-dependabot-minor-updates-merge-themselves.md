# 0273. Dependabot's minor updates merge themselves, as its patch updates do

- Status: Accepted
- Date: 2026-11-05
- Decider: the maintainer (TJ), 2026-11-05: "Lets proceed with auto-merging patch and minor for future repos. And raise a PR to bluebird auto-merging minor verison updates too."
- Issues and PRs: this PR, zimmertr/ai-config#1
- Cited in code as: none
- Guide: [`docs/CICD.md`](../CICD.md), Dependabot auto-merge

## Context

`dependabot-auto-merge.yml` armed auto-merge on patch updates only, and every minor waited for the maintainer. The maintainer set patch and minor auto-merge as the standard for new projects (zimmertr/ai-config's `initialize-project` skill) and asked for Bluebird to match.

## Decision

The job arms squash auto-merge when Dependabot's metadata reports `version-update:semver-patch` or `version-update:semver-minor`, and comments on the PR to say so. Majors, and digest-only base image updates (no update type), still wait. Nothing else changes: the merge uses `AUTO_MERGE_PAT`, GitHub completes it on `main`'s required checks, and the release's canary gates the rollout.

## Evidence

No dated measurement. What the change reaches, read from `.github/dependabot.yml` and `docs/CICD.md` on 2026-11-05:

- `pip` and `npm` minors now merge themselves, after the seven-day cooldown.
- `github-actions` minors arm auto-merge but still wait: `AUTO_MERGE_PAT` has no Workflows permission, so it cannot merge a workflow edit.
- `docker` base images float at the minor (`python:3.15-alpine`), so the next Python minor tag should arrive as `semver-minor` and merge itself. Not yet observed on a base image.

## Alternatives rejected

- Keeping patch only: the maintainer chose patch and minor.
- Excluding the `docker` ecosystem's minors: not asked for. It's one `if:` clause if a runtime minor should wait.

## Consequences

A minor of any npm or pip dependency, or a new Python minor in the image, can reach production without review; the cooldown, the PR checks, the release scan and the prod canary are the guards. A breaking minor is fixed forward like any other release (record 0083).
