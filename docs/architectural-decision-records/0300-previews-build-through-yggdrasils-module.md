# 0300. The preview image builds through yggdrasil's pr-preview module, on `pull_request`

- Status: Accepted. Amends [0279](0279-tools-hold-the-config-rules.md) (the inline silence on `pr-preview.yml`'s `pull_request_target` is gone with the trigger)
- Date: 2026-11-13
- Decider: the maintainer (TJ), 2026-11-13, on zimmertr/hevy-garmin-sync#62: one shared module in yggdrasil for Bluebird and hevy-garmin-sync, on `pull_request`
- Issues and PRs: #936, #944, zimmertr/hevy-garmin-sync#62, zimmertr/yggdrasil#111
- Cited in code as: `.github/workflows/pr-preview.yml`
- Guide: [`docs/CICD.md`](../CICD.md), PR preview environments

## Context

`pr-preview.yml` built each PR's preview image on `pull_request_target`, which gives every run the base repo's secrets and a write token, a fork's included. One `if:` line kept a fork's PR out. The trigger was chosen because Dependabot's `pull_request` runs got a read-only token and could not push to GHCR. Renovate has since replaced Dependabot (record [0284](0284-renovate-under-yggdrasils-preset.md)), and its branches live in this repo. yggdrasil forbids `pull_request_target` (its record 0010), and hevy-garmin-sync needed the same build.

## Decision

- `pr-preview.yml` calls `zimmertr/yggdrasil/.github/workflows/pr-preview.yml` on `pull_request`, for PRs into `main`, types opened, synchronize and reopened. It passes the image `ghcr.io/zimmertr/bluebird-pr`, the preview's address and the comment's heading, and grants `contents: read`, `packages: write` and `pull-requests: write`.
- The module holds what the job held: the same-repo gate, the head checkout with no token left behind, the `pr-<N>-<head sha>` tag, the skip when that tag is already pushed, the build args `APP_VERSION`, `APP_COMMIT` and `APP_BUILT_AT`, the per-PR cache scope, the `create pr container` label and the one comment on the owner's PRs.
- The calling job adds no same-repo `if:` of its own. The module's gate is the one check, as in hevy-garmin-sync (the maintainer, 2026-11-13).

## Evidence

- 2026-11-13: yggdrasil v2.0.0's module (zimmertr/yggdrasil#111, its record 0059) does every step the job did, read line by line against the old `pr-preview.yml`.
- A Renovate PR under `pull_request` is not yet seen pushing its image. The first one after this merge shows it.

## Alternatives rejected

- Keeping `pull_request_target`: two copies of the build, and one `if:` between a fork and the secrets.
- A second same-repo `if:` on the calling job: the same check twice, for a trigger that already gives a fork no write token.

## Consequences

- A fork's PR gets no write token and no secret, whatever the workflow says.
- The check is `PR Preview / Preview Image`. It is not a required check.
- A PR into a branch other than `main` gets no preview.
- The comment is matched by the module's `pr-preview` header, so a PR opened before this change got a second comment and its old one went stale.
- The preview's cache is written under the PR's own ref, not `main`, so `cache-cleanup.yml` now removes it when the PR closes.
- A change to the build reaches this repo as a Renovate PR that moves the pin.
