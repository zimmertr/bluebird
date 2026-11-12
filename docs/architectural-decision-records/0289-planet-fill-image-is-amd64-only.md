# 0289. The planet fill image is built for amd64 alone

- Status: Accepted. Amends [0184](0184-planet-fill-cronjob-and-image.md) (every release built the fill for amd64 and arm64)
- Date: 2026-11-12
- Decider: the maintainer (TJ), on issue #918, 2026-11-12
- Issues and PRs: #918
- Cited in code as: #918
- Guide: [`fill/`](../../fill/CLAUDE.md) guide, the `fill/Dockerfile` bullet; [`docs/CICD.md`](../CICD.md), Build & Push, Scan Pushed Image and the release timings

## Context

Record 0184 had every release build and scan `ghcr.io/zimmertr/bluebird-fill` for `linux/amd64` and `linux/arm64`, beside the app's image. The release runs both platforms on one amd64 runner, so the arm64 half runs under QEMU, and the fill keeps no layer cache so that each release installs Debian's packages as they stand that day. The scans wait on both builds.

The maintainer asked on 2026-11-12 why a release took about 11 minutes from merge to production.

## Decision

**The fill image is built, pushed and scanned for `linux/amd64` alone.** Only the cluster runs it, as a weekly CronJob, and the cluster is amd64. `make test-fill` builds its own image from `fill/Dockerfile` and pulls nothing, so no Mac or Graviton host needs an arm64 copy. It still keeps no layer cache.

The app's image stays on both platforms. The maintainer chose this over building each platform on a native runner in yggdrasil's release module, which would speed every image but changes a shared workflow, and over skipping the fill build when nothing it copies changed, which gives up the daily package refresh.

## Evidence

Release run `43309167706` (v0.137.0, 2026-11-12): `Build & Push (zimmertr/bluebird-fill)` 3m 40s against `Build & Push (zimmertr/bluebird)` 1m 07s. The fill's `runtime 2/6` step (`apt-get update`, `upgrade` and `install`) took 170.6 s on arm64 and 14.8 s on amd64.

## Consequences

- A release waits on the app's build, not the fill's.
- The release scan runs three legs, not four.
- The weekly `image-scan.yml` names no platform for the fill and reads amd64, as before.
- An arm64 host that wants the fill builds it from `fill/Dockerfile`.
