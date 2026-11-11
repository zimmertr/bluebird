# 0045. Temperature is reported at the destination's elevation, with no floor

- Status: Accepted
- Date: 2026-09-17 (git: the merge of #451)
- Decider: TJ (git: author and merger of #451)
- Issues and PRs: #443, #451
- Cited in code as: #443
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the paragraph "Key constraints shared between frontend and backend", from "The elevation-adjusted TEMPERATURE is the same pair one metric over"

## Context

A summit's temperature is not the `temperature_2m` of the model cell under it.

## Decision

Temperature uses the same five pressure levels at the same ISA heights as the wind, interpolated the same way. Every gap (no elevation, below about 762 m, a null level, an archive window) degrades to `temperature_2m`. It has no floor. The forecast grid applies the same adjustment at the terrain's height, because `terrainElevation` hands one `elevationFt` to both readers.

## Evidence

Measured 2026-09-16 at the lattice point under Dome Peak: the grid paints 38.7 °F where its `temperature_2m` minimum is 23.9 °F.

## Alternatives rejected

- A floor at the 2 m value, like the wind's: a summit is colder than the free air on a calm clear night and warmer than it under an inversion, so a clamp either way would report a number no model produced.
- Keeping `temperature_2m` on the grid: the wrong instinct, since the grid reads the same adjusted readers.

## Consequences

It is part of the vector-pinned aggregation (mirror row 5) and rides the same elevation cache key. The five level temperatures raised the weight factor to 1.5 in the browser and 1.4 on the pod: see [0002](0002-weighted-calls-not-requests.md). No column header names the method: see [0051](0051-no-method-in-headers.md).
