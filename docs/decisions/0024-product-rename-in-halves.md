# 0024. The product is Bluebird Forecast, renamed in halves

- Status: Accepted
- Date: 2026-09-11 (git: the merges of #318, #319 and #321)
- Decider: TJ (git: author and merger of #319)
- Issues and PRs: #111, #311, #312, #313, #314, #315, #318, #319, #321
- Cited in code as: #111, #311, #312, #313, #315
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "The product is Bluebird Forecast, and every new identifier says so"

## Context

The product became Bluebird Forecast. Some names live only in this repository. Others are repositories, images, a chart and cluster objects that other systems read.

## Decision

Today every user-facing string says "Bluebird Forecast" (the one idiom kept is "Bluebird day"), and every identifier says it too: `bluebird_forecast_*` metrics, loggers and localStorage keys, the `bluebird-forecast` package, the `BluebirdForecast/1.0` User-Agent, and the `bluebirdforecast` container user. The repositories, the images, the chart, its helpers, the namespace and the Argo apps keep their old names until their issues close: #311, #111, #315 and #314.

## Evidence

Shipped as v0.61.0 and v0.62.0 (#312, #313).

## Alternatives rejected

- Renaming everything at once: the external names wait on their own issues.

## Consequences

`backend/tests/test_branding.py` and `frontend/src/branding.test.ts` fail the old spellings (#321). Check those issues before a new manifest, workflow or doc link. A metric rename has a silent consumer: the canary error-rate gate in `Kubernetes-Manifests` passes on an empty result.
