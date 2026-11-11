# 0278. The release runs on yggdrasil's release module, scanning by immutable tag

- Status: Accepted; supersedes 0105 in part; superseded in part by 0280
- Date: 2026-11-06
- Decider: the maintainer (TJ), 2026-11-06, in zimmertr/yggdrasil#6: "Sounds good to me, lets begin", then "Yes! Delete Delete Delete!" on step 4.2, and turning on immutable tags for `zimmertr/bluebird-fill` the same day
- Issues and PRs: zimmertr/yggdrasil#6 (step 4.3), this PR
- Cited in code as: `.github/workflows/release.yml`
- Guide: [`docs/CICD.md`](../CICD.md), Path 1, Finishing a failed release, The release scan

## Context

The last of three PRs moving this repo onto zimmertr/yggdrasil's modules, after records 0276 and 0277. `release.yml` was the largest copy of the pipeline: two images, two platforms, a scan by digest (record 0105), a guard on every job that let any re-run finish a release, and two bump jobs written in shell. yggdrasil's `release` module does the same work from inputs, and hevy-trainer-sync has released through it since zimmertr/yggdrasil#5.

## Decision

- `release.yml` calls the `release` module, pinned to v0.8.1's commit SHA, on a push to `main` only, one release at a time. `workflow_dispatch` goes.
- Both images build for `linux/amd64` and `linux/arm64`; the app keeps the Actions layer cache, and the fill builds from `fill/Dockerfile` with none.
- The release scans each image by its version tag, not by digest. Docker Hub's immutable tags fix a tag to the bytes first pushed (yggdrasil's record 0024), and both `zimmertr/bluebird` and `zimmertr/bluebird-fill` have them on. Everything else 0105 decided stands: both platforms, and the tag, the release and both bumps wait on the scan.
- The tag is a lightweight one, made with the GitHub release by one `gh release create --target`.
- Both bumps run after the release and use `GH_PAT`: the image's `newTag` in Kubernetes-Manifests on `chore/bluebird-image`, and `appVersion` in bluebird-helm on `chore/bump-appversion`, titled `chore(release): bump chart appVersion to <version>`.
- A failed release is finished with "Re-run failed jobs". An old release is never re-run after a newer one shipped.
- `GitVersion.yml`, `trivy.yaml`, `.github/actions/trivy-crit-high` and `backend/tests/test_release_scan.py` are deleted. The modules read yggdrasil's defaults.
- `backend/tests/test_workflow_pins.py` keeps only the checks no maintained tool makes here yet: no `${{ }}` pasted into a `run:` script, and the base images pinned by digest. Its SHA pin check goes, because the repository's "require actions to be pinned to a full-length commit SHA" setting is on; so does its main-only check of `release.yml`'s trigger (TJ, 2026-11-06).

## Evidence

- 2026-11-06: GitVersion 6.8.2 gave the same version with this repo's `GitVersion.yml` and with yggdrasil's default, on a `ci:` commit (0.132.22) and a `feat(api):` commit (0.133.0) on top of v0.132.21.
- 2026-11-06: this repo's `trivy.yaml` and yggdrasil's default hold the same one rule, which skips pip's vendored SBOM. `Planet Fill` no longer passes a scan config: the fill image installs no pip.
- 2026-11-06: the module's `yq` edit, run in Docker on copies of both files, changed only `appVersion` in `Chart.yaml`, keeping its quotes. In the kustomization it set `newTag` and also re-indented the file, once, out of the layout kustomize wrote: Kubernetes-Manifests lints no layout, and bluebird-helm's `sed` on the same file matches any indentation.
- 2026-11-06: Docker Hub reports immutable tags on for `zimmertr/bluebird-fill`, rule `.*`.
- 2026-11-06: zizmor 1.16.0's pedantic audits flag even `${{ github.sha }}` in a `run:` block, so yggdrasil's lint module (zimmertr/yggdrasil#7) can replace the expression check. Trivy 0.69.1 and Checkov 3, run on a Dockerfile whose base had a tag and no digest, flagged only its missing `HEALTHCHECK`, and hadolint's rules stop at "tag the version".
- 2026-11-06: `zimmertr/bluebird-pr` has immutable tags on, so a preview build that pushed a tag twice would fail loudly. The test that held `pr-preview.yml` to asking first was dropped for that reason (TJ, 2026-11-06).

## Alternatives rejected

- Keeping the scan by digest: the module has no digest output, and with immutable tags the tag names the same bytes.
- Keeping the guards that let any re-run finish a release: "Re-run failed jobs" already finishes one, and the guards were most of the workflow's shell.
- Keeping `workflow_dispatch`: no release has needed it, and every job had to guard against a dispatch from another branch.

## Consequences

- The image bump waits on the GitHub release again, about 13 s that #368 had taken out of every deploy.
- "Re-run all jobs" on a release whose images were pushed fails, because the push is refused.
- The first image bump re-indents `public/bluebird/kustomization.yml`. Later bumps change one line.
- A module change reaches this repo only as a Dependabot PR that moves the pin, three days after its release.
