# 0105. Production moves only onto a scanned digest

- Status: Accepted
- Date: 2026-10-06
- Decider: the maintainer (TJ), through the 2026-10-06 security fix pass that chose option A for #634: a scan job in `release.yml` between `Build & Push` and the two bump jobs, both platforms, through the existing `trivy-crit-high` action. On review of the PR the same day, the maintainer also put `Create GitHub Release` behind the scan.
- Issues and PRs: #634, #595
- Cited in code as: #634
- Guide: [`CLAUDE.md`](../../CLAUDE.md), the CI/CD pipeline paragraph

## Context

The PR gate scans an amd64 image it builds from the PR branch. The release then builds again from the squash commit, for `linux/amd64` and `linux/arm64`, and `Update Kubernetes Manifests` opened the production bump as soon as that push finished. Nothing scanned the pushed image, and no gate ever scanned its arm64 half. The two builds can differ: this repository's branch protection does not require a PR to be up to date (`strict: false`, read 2026-10-06), so two green PRs can merge into a combination no PR built, and `apk upgrade` and the Python lock's transitive set resolve at build time. The weekly `image-scan.yml` reads only the amd64 half of the latest release, up to a week later. The security review found it (#595, finding CI3, rated informational).

## Decision

- `release.yml` has a `scan` job (`Scan Pushed Image`) that needs `Build & Push` and runs Trivy against `zimmertr/bluebird@<digest>`, the index digest `Build & Push` reports, once for `linux/amd64` and once for `linux/arm64` (a matrix, `fail-fast: false`, with `TRIVY_PLATFORM` naming each leg's half of the index).
- It uses the same `trivy-action` pin, `ignore-unfixed`, `trivy.yaml` and `.github/actions/trivy-crit-high` as the PR gate and the weekly scan, and fails on any fixable Critical or High finding.
- `Create GitHub Release`, `Update Kubernetes Manifests` and `Bump Helm Chart appVersion` all need it.
- A failed scan holds production and the chart's default image on the previous release and makes no GitHub release, so Latest stays on the previous version. The image and the tag stay published. The fix is the next release, as for any bad release.
- `Build & Push` reports the digest the build produced, or on a re-run that skipped the build, the registry's digest for the image it checked was built from this commit.
- `pr-preview.yml` skips its build when its tag already exists, so a re-run or a reopen on the same head commit does not push a tag twice. Immutable tags on `zimmertr/bluebird-pr` are the maintainer's Docker Hub setting, not part of this change.

## Evidence

Checked 2026-10-06 against `main` at `ceb4204`: `update-manifests` needed only `determine-version` and `build-and-push`, `bump-chart-appversion` only those and `create-release`, and no job in any workflow scanned `linux/arm64`. On the same day, two local runs of the Trivy image against the `python:3.14-alpine` index by digest reported `linux/amd64` with `TRIVY_PLATFORM=linux/amd64` and `linux/arm64` with `TRIVY_PLATFORM=linux/arm64`, each with its own image id, so the variable selects the half of an index digest that a leg scans. `docker buildx imagetools inspect --format '{{ .Manifest.Digest }}'` printed the same index digest as the command's default output. The job's run time is not measured: `release.yml` runs only as a real release, and the issue says not to dispatch it to test it.

## Alternatives rejected

- No release scan, relying on the PR gate and the weekly scan (option B in #634). arm64 would stay unscanned, and an image that differs from the PR build would reach production with up to a week before any scan read it.
- Scanning by tag. A tag is resolved when the scan runs; the digest is what this run pushed.
- Scanning a local rebuild. It repeats the PR gate's gap: the bytes scanned would not be the bytes pushed.
- Holding only the two bump jobs, which was the first version of this change. The GitHub release was still created and marked Latest, and `bluebird-helm`'s release resolves the chart's `appVersion` from `releases/latest` at package time, so a chart release before the fix would have published the failed version as the chart's default image whatever the bump job did. Production would not have followed, because Kubernetes-Manifests pins the image tag itself.
- Logging in to Docker Hub in the scan job. The image is public, and a job with no credential holds nothing a scanner could read.

## Consequences

`backend/tests/test_release_scan.py` fails a `release.yml` with no job gating on the Trivy count after `build-and-push`, a scan that reads a tag rather than the pushed digest or skips either platform, a release or bump job that does not need the scan, and a `pr-preview.yml` build that runs without asking whether its tag exists. `test_workflow_pins.py` holds the new job to the pins, the `main` check and `env:` for every value. Every release takes the scan's time before production moves or the release is published, unmeasured until the first release after the merge. A version whose scan failed stays an image and a `v<version>` tag with no GitHub release; a re-run of the run tries the scan again, and the next merge releases the version after it.
