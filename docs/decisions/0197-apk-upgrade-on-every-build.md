# 0197. The runtime stage's `apk upgrade` runs on every build

- Status: Accepted. Issued as 0126, a number `0126-chart-marks-the-extreme-hour.md` already held, and moved to 0197 on 2026-10-20 (#772)
- Date: 2026-10-14
- Decider: the maintainer (TJ), who asked for a PR against code scanning alert 39; the placement is the author's (git is the source)
- Issues and PRs: #717, code scanning alert 39
- Cited in code as: alert 39, CVE-2026-85091
- Guide: [`CLAUDE.md`](../../CLAUDE.md), the CI/CD pipeline paragraph; [`docs/CICD.md`](../CICD.md), Scheduled image scan

## Context

Alpine fixes a package days to weeks before the `python:3.14-alpine` image rebuilds carrying it, so the pinned base can be the newest published while the packages under it are not, and Dependabot has nothing to open. The Dockerfile has answered that since the 2026-09 util-linux findings with `RUN apk upgrade --no-cache` in the runtime stage. That layer sat above the pip install, so BuildKit keyed it on the base digest and the command alone, and between base moves every build served the cached copy. The documented remedy was `gh cache delete --all` followed by a release. On 2026-10-12 the scheduled scan of the latest release found zlib 1.3.2-r0 (CVE-2026-85091, fixed in 1.3.2-r1); on 2026-10-14 the pinned base was still the newest digest Docker Hub had, `apk upgrade` against it offered 1.3.2-r1, and v0.105.0, released that day, still carried r0.

## Decision

- The `RUN apk upgrade --no-cache` layer moves to after the `ARG APP_VERSION`/`APP_COMMIT`/`APP_BUILT_AT` declarations and their `ENV`, immediately before `USER`. BuildKit includes every build argument in scope in a `RUN`'s cache key whether or not the command reads it, and `APP_COMMIT` and `APP_BUILT_AT` change on every PR, preview and release build, so the layer is rebuilt against Alpine's current index every time.
- Nothing that builds sits under it: the instructions after it are `USER`, `EXPOSE`, `HEALTHCHECK` and `CMD`, so the rebuild repeats none of pip's or the frontend's work.
- The remedy for a fixable finding with no base-image PR to merge is the next merge to `main`. No cache is cleared.

## Evidence

- 2026-10-14: `docker run python:3.14-alpine@sha256:f6a589d4…` reported Alpine 3.24.2 with zlib-1.3.2-r0 installed and zlib-1.3.2-r1 upgradable from `v3.24/main`; `docker buildx imagetools inspect python:3.14-alpine` resolved to that same digest; `zimmertr/bluebird:0.105.0` carried zlib-1.3.2-r0.
- 2026-10-14: a three-line Dockerfile (`ARG APP_COMMIT`, `ENV`, `RUN date > /stamp`) built with `--build-arg APP_COMMIT=aaa` then `bbb` wrote two different stamps, and a second `bbb` build served the first `bbb` stamp, so a changed argument misses the layer cache and an unchanged one hits it.
- The cost is one apk index fetch and the upgrade of whatever moved, per build and per platform; the release's arm64 half runs it under QEMU. Unmeasured until the first release after the merge.

## Alternatives rejected

- Keeping the snapshot and clearing the cache by hand, the decision this one reverses. It made a published Alpine fix wait on a person noticing a scan, and the scan runs weekly on the amd64 half alone, so the gap between a fix and a release that carried it was at least a week and depended on someone reading the failure email.
- `no-cache: true` on the release build. It throws away the npm and pip layers too, and under QEMU the frontend build alone measured 35.6 s (release run 34916818009, 2026-09-15); the apk layer is the only one that needs to move.
- A dedicated `ARG CACHE_BUST` passed from the workflows. The two arguments that already change every build do the same job with no new workflow plumbing to keep in step across `pr.yml`, `pr-preview.yml` and `release.yml`.
- Pinning `zlib=1.3.2-r1` with `apk add`. A pin sits outside Dependabot's view and goes stale, the reason the pip upgrade in the same stage is unpinned.

## Consequences

`backend/tests/test_apk_upgrade_layer.py` fails a Dockerfile whose `apk upgrade` is not the one `RUN` between the `APP_*` arguments and `USER`, or that puts anything but `USER`, `EXPOSE`, `HEALTHCHECK` or `CMD` after it. Every build pays the apk index fetch. `image-scan.yml`'s failure message and `docs/CICD.md` name the next merge as the remedy.
