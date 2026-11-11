# 0085. The Helm chart stays GPL-3.0-only as a separate work, and says the image it installs is noncommercial

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on bluebird-helm issue #269 (option A)
- Issues and PRs: bluebird-helm#269, bluebird-helm#32
- Cited in code as: none
- Guide: [`CLAUDE.md`](../../CLAUDE.md), the Kubernetes deployment paragraph

## Context

The app moved to the PolyForm Noncommercial License 1.0.0 on 2026-07-28. The chart in `zimmertr/bluebird-helm` kept GPL-3.0-only, and bluebird-helm#32 asked the same day whether that was deliberate; it was closed on 2026-08-06 with no comment and no change. The readiness review (bluebird-helm#269) found the two licenses stated side by side with nothing to say the difference was meant, and found the chart's statement is the only one an installer sees: the app's `.dockerignore` excludes `LICENSE`, so the image carries only the OCI label, and Artifact Hub lists the chart as `GPL-3.0-only`.

## Decision

The chart stays GPL-3.0-only. Its templates are a separate work from the application, and the chart README's License section says so, naming the PolyForm Noncommercial License 1.0.0 as the license of the `zimmertr/bluebird` image the chart installs and linking to the app's `LICENSE`. `Chart.yaml` (`artifacthub.io/license: GPL-3.0-only`), the chart repository's `LICENSE` (GNU GPL v3) and the chart README agree. The decision is recorded as a comment on bluebird-helm#32.

## Evidence

Read on 2026-10-01: `charts/bluebird/Chart.yaml` carries `artifacthub.io/license: GPL-3.0-only` and no other license field; the chart repository's `LICENSE` is the GNU GPL version 3; the Artifact Hub API reports `GPL-3.0-only` for `bluebird-helm` 0.15.19; this repository's `LICENSE` is the PolyForm Noncommercial License 1.0.0, and the `Dockerfile` labels the image `org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"`.

## Alternatives rejected

- Moving the chart to PolyForm Noncommercial 1.0.0 (bluebird-helm#269 option B). One license across the product, but the templates are deployment plumbing with no product logic in them, and a reuser of them would lose commercial use for nothing the app's license protects.

## Consequences

Artifact Hub still shows a license that permits commercial use first; the README sentence is what answers the commercial question for the image. Nothing checks that the sentence and the app's `LICENSE` agree, so a future relicense of the app must change the chart README in the same pass. The packaged chart carries no `LICENSE` file, because the file sits at the repository root outside `charts/bluebird/`.
