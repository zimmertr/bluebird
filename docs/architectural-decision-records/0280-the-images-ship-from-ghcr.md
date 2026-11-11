# 0280. The images ship from GHCR, and production pins the app image by digest

- Status: Accepted; supersedes 0278 in part
- Date: 2026-11-11
- Decider: the maintainer (TJ), 2026-11-11, while working zimmertr/yggdrasil#9: "Can we just move Bluebird/Bluebird Helm to GHCR right now to close out yggrasil #9, update bluebird #111 accordingly, and then work on the rest of #111 later?", then "Yes, lets just do it now. The organzation move will happen later."
- Issues and PRs: #111, zimmertr/yggdrasil#9, zimmertr/yggdrasil#75 (yggdrasil v1.0.0), this PR
- Cited in code as: decision record 0280, in `.github/workflows/release.yml`
- Guide: [`docs/CICD.md`](../CICD.md), Path 1, The release scan, PR preview environments

## Context

Every other repository of TJ's moved its images from Docker Hub to GHCR in zimmertr/yggdrasil#9. yggdrasil's release module pushes only to `ghcr.io/<image>` since v1.0.0, with the job's own `GITHUB_TOKEN` (yggdrasil's record 0052). #111 planned to move Bluebird once, straight into the `Bluebird-Forecast` organization, after #311 moves the repositories there. #311 has not started, and Bluebird was the last thing holding Docker Hub's credentials.

GHCR has no immutable tags. Record 0278 scanned each image by its version tag because Docker Hub's immutable tags fixed a tag to the bytes first pushed.

## Decision

- The app, fill and preview images move now, under the `zimmertr` account: `ghcr.io/zimmertr/bluebird`, `ghcr.io/zimmertr/bluebird-fill` and `ghcr.io/zimmertr/bluebird-pr`. The chart moves to `oci://ghcr.io/zimmertr/bluebird-helm` in bluebird-helm's own PR. They move again, to `ghcr.io/bluebird-forecast/...`, with #311.
- Every push uses the job's own `GITHUB_TOKEN` with `packages: write`. `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` leave the workflows and are deleted from the repository.
- The Kubernetes-Manifests bump names the image the chart renders, `ghcr.io/zimmertr/bluebird`, and sets its `digest` beside `newTag`, the digest the tag names after the release scan. Production runs the bytes the scan read, even if the tag is moved later. This replaces the immutable tag that 0278 relied on. Everything else 0278 decided stands.
- The fill runs at the chart's `appVersion` tag, not pinned by digest. Pinning it in the chart, as hevy-garmin-sync does, stays in #111.
- `pr-preview.yml` keeps its check for a tag already pushed. Without immutable tags it no longer stops a failure; it stops a rebuild under the same tag.
- Docker Hub keeps every tag pushed before 2026-11-11, because older chart versions name them.

## Evidence

- 2026-11-10, zimmertr/yggdrasil#73: on GHCR, a second push of the same tag replaced the first; `GITHUB_TOKEN` with `packages: write` pushed both an image and a chart; each new package started public and linked to the repository that pushed it.
- 2026-11-11: Personal-Website, Mountaineers-Activity-Scraper and hevy-garmin-sync ran from GHCR pinned by digest after the same cutover: the release, then one Kubernetes-Manifests PR.

## Alternatives rejected

- Waiting for #311 so the images move once: Docker Hub's credentials and pull limits stay until then, with no date set.
- Pushing to both registries for a while: the release module pushes only to GHCR, so this would mean a second push job of this repository's own.

## Consequences

- The first release after this PR fails its Kubernetes-Manifests bump once: `public/bluebird/kustomization.yml` still names `zimmertr/bluebird` until the Kubernetes-Manifests cutover PR renames it.
- The packages move a second time with #311, and that move repeats this cutover.
- The canary's version check in Kubernetes-Manifests reads the image with a digest after the tag, so it matches the version before the `@`.
