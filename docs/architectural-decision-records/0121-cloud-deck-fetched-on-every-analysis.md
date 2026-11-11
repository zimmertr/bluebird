# 0121. The cloud deck is fetched for every candidate of every analysis

- Status: Accepted. Supersedes 0057.
- Date: 2026-10-08
- Decider: the maintainer, on #683 (2026-10-08: "it should always be fetched. It shouldn't be an exception like this.")
- Issues and PRs: #683, #117, #483, #670
- Cited in code as: #683
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the bullet "The cloud column is fetched with the weather"; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/routes/analyze/` and `app/services/ranking.py` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `analysisSnapshot.ts` and `constraints.ts` bullets

## Context

[0057](0057-cloud-fetched-on-request.md) fetched the cloud column only when the ranking or a bound named it, because it is a second Open-Meteo request per location. Every other hourly metric rides the weather request and is on every row. So a report ranked on anything else had no cloud columns in the table, no cloud line in the marker popup, and no cloud cells in the forecast grid. Picking the cloud deck afterwards raised the only cue a presentation knob could raise, `A new cloud metric requires a new analysis.`, and the Columns picker needed `keepUnlistedChoices` to remember a choice about columns it could not list. The maintainer asked on 2026-10-08 why the deck was missing from a temperature analysis and decided it should not be an exception.

## Decision

Every analysis fetches the cloud column for every candidate, on both paths, the way it fetches the weather.

- Browser: `runClientAnalysis` always starts `fetchCloud` beside the weather, over the candidates it has no forecast for. A held row keeps the cloud column it carries, like its weather, so a re-analysis buys the delta only. `cloudFetched`, `requestsCloud`, `namesOnRequestMetric`, `ON_REQUEST_FAMILIES`, `cloudNeeded`, the `cloud-needed` cue and its sentence, the `cloudHeld` column filter and `keepUnlistedChoices` are gone. The forecast grid fetches the column for every lattice chunk.
- Pod: `_fetch_forecasts` always runs `fetch_cloud_batch` beside the weather. `_cloud_eager`, `Eager.cloud` and `_attach_cloud` are gone, and `_check_pacing` prices the cloud batches into every plan. `include_clouds` stays on `AnalyzeRequest`, accepted and ignored, because removing a request field waits for a major release ([0076](0076-api-semver-strict-reader.md)).
- A cloud failure fails the analysis on both paths, as it already did when the column was asked for, because the column is now part of what every analysis promises.

The cloud request stays a request of its own: the variables, the aggregation, the vectors and the mirrored constants (`CLOUD_VARIABLES`, `N_CLOUD_VARIABLES`) do not change.

## Evidence

Measured 2026-10-08 on `main` at 8cd6613, reading `callWeight` and the variable lists. For a window of up to 14 days the weather request weighs 1.6 per location in the browser (16 variables) and 1.5 on the pod (15); the cloud request weighs 1 (9 variables, floored to 1). The browser budget is `CLIENT_WEIGHT_PER_MINUTE` = 550.

| Analysis | Before, weighted calls | After | Pacing floor before | After |
| --- | --- | --- | --- | --- |
| 200 destinations | 320 | 520 | under 1 minute | under 1 minute |
| 1,500 destinations | 2,400 | 3,900 | about 4.4 minutes | about 7.1 minutes |

A window of 15 or 16 days multiplies every figure by its days over 14.

## Alternatives rejected

- Fold the nine cloud variables into the weather request: one request rather than two and 0.1 less per location, but it changes mirror rows 8 and 27, the weather cache's shape and the vector-pinned inputs, for a tenth of a call.
- Fetch the column after the ranking for the displayed rows only, as `include_clouds` did on the pod: cheaper for a default analysis, but the deck stays an exception, the cue stays, and a limit change past the fetched rows needs a top-up fetch. The maintainer rejected it on 2026-10-08.

## Consequences

Every report costs the visitor about two thirds more of their own Open-Meteo quota, and the largest analysis waits about 2.7 minutes longer on the pacer. On the pod an unkeyed archive window is refused at a smaller candidate count than before, since every plan now prices the cloud batches. No presentation knob can stop being live: [0003](0003-analyze-is-spend-boundary.md)'s spend boundary is now the data knobs alone. Mirror row 29 has no question left to mirror and is retired.
