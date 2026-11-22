# 0335. The hourly series carries the top of the deck's layer, from the same walk

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer merges it. Amends 0113 (the walk carries on past the deck).
- Date: 2026-11-17
- Decider: the maintainer, 2026-11-17 ("From fetched destinations"), for the cloud sea the map draws over the terrain
- Issues and PRs: #825
- Cited in code as: the cloud top
- Guide: [`CLAUDE.md`](../../CLAUDE.md), The Python and TypeScript mirrors, the paragraph under the table that opens "The cloud deck detects saturation"

## Context

The new shell draws a sea of cloud on the map at the hour the day strip shows: ground under the layer is hidden, a summit above it stands clear. The maintainer chose to draw it from the forecasts an analysis already fetched rather than from a second lattice of requests. A deck base says where the layer starts and nothing about where it ends, so a summit 2,000 ft above a 4,000 ft base could be in the cloud or above it. The humidity column that found the base already holds the answer, so the top costs no new variable and no new request.

## Decision

`_cloud_top_ft` (`cloudTopFt` in the browser) continues the deck's walk over the same column, the 2 m point inserted at the destination's elevation. Saturated points and levels that answered null are passed over. The first answered point under `CLOUD_SATURATION_RH` above the last saturated one ends the layer, its height interpolated in humidity the way the base is. A column saturated to 300 hPa reads `CLOUD_DECK_CEILING_FT`, and so does a dry column, where top and base agree. A layer with only nulls above its last saturated point reads that point's height. A column with no level answered is null, as the deck is. Only the lowest layer is seen: a second deck above a dry gap is not this layer's top. The top rides `HourlySeries` as `cloud_top_ft`, aligned to `times`, with no aggregate column, no sort key and no bound, because nothing ranks on it; the score reads it hour by hour.

## Evidence

- The column's nine variables are unchanged, so the cloud request's weight stays 1 per location (0113).
- `weather_vectors.json` carries four new `cloud` cases, pinning the interpolated top, the saturated column, the null gap and the second layer for both suites.

## Alternatives rejected

- A second lattice of cloud requests for the map (the forecast grid's approach): spends quota a run did not ask for, where the maintainer chose to spend none.
- The deck's base alone with a fixed layer depth: invents a number no model produced.
- Every layer's base and top: the score and the map ask one question, whether the summit is above the cloud under it, and the lowest layer answers it.
