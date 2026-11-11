# 0277. The Dependabot auto-merge and the weekly image scan run on yggdrasil's modules

- Status: Accepted
- Date: 2026-11-06
- Decider: the maintainer (TJ), 2026-11-06, in zimmertr/yggdrasil#6: "Sounds good to me, lets begin"
- Issues and PRs: zimmertr/yggdrasil#6 (step 4.2), this PR
- Cited in code as: `.github/workflows/dependabot-auto-merge.yml`, `.github/workflows/image-scan.yml`
- Guide: [`docs/CICD.md`](../CICD.md), Dependabot auto-merge and Scheduled image scan

## Context

The second of three PRs moving this repo onto zimmertr/yggdrasil's modules, after record 0276 moved the PR checks. Both workflows here were the source of yggdrasil's `auto-merge` and `image-scan` modules.

## Decision

- `dependabot-auto-merge.yml` calls the `auto-merge` module, passing `AUTO_MERGE_PAT` as its `merge-token`. Patch and minor updates still merge themselves (record 0273), and majors and digest-only updates still wait.
- `image-scan.yml` calls the `image-scan` module with both images. Each keeps its Security tab category (`trivy-released-image`, `trivy-released-fill-image`) and its remedy text, and the schedule is unchanged.
- Both are pinned to yggdrasil v0.8.1's commit SHA with the version in a comment.
- `.github/actions/trivy-crit-high` stays until the release moves, since `release.yml` still uses it.

## Evidence

- 2026-11-06: the modules do what this repo's workflows did, with the same token, categories, matrix and `fail-fast: false`. The weekly scan now gates with Trivy's own `severity` and `exit-code` inputs, as the PR gate does since record 0276.

## Alternatives rejected

- Keeping this repo's copies: every fix lands twice, and the copies drift.

## Consequences

- The auto-merge job decides by the PR's author, not by whoever last triggered the run, so a person re-running a Dependabot PR's checks no longer skips it.
- The armed comment is matched by the module's `auto-merge` header. A Dependabot PR that already has the old comment gets a second one if it is rebased.
- The weekly scan's jobs are named by the full image, `Scan released image (zimmertr/bluebird)`. Neither is a required check.
