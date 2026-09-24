# 0022. Wind is reported at the destination's elevation

- Status: Accepted
- Date: 2026-08-21 (git: the merge of #288)
- Decider: TJ (git: author and merger of #288); the guide records the legend call as TJ, 2026-08-21
- Issues and PRs: #257, #288
- Cited in code as: #257, #288
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the paragraph "Key constraints shared between frontend and backend", from "A sixth is the elevation-adjusted wind"

## Context

A destination's wind is not the 10 m wind of the model cell under it.

## Decision

Every wind number is the free-air wind interpolated between the two ISA-height pressure levels that bracket the destination's `elevation_ft`, floored at the 10 m value. Every gap (no elevation, below about 762 m, a null level) degrades to the 10 m wind. The forecast grid sends no destination elevations; `terrainElevation` makes each sample read Open-Meteo's own resolved terrain height, so the grid paints wind at the ground's elevation under markers that carry it at the destination's.

## Evidence

No dated measurement in the guide.

## Alternatives rejected

- A second legend line for the grid's datum: tried and rejected for its vertical cost (TJ, 2026-08-21). The method is in `docs/DATA.md` instead.

## Consequences

It is part of the vector-pinned aggregation (mirror row 4), and elevation joins the per-location forecast cache key on both sides. The floor is a physical statement: altitude can only add exposure. Temperature follows the same method with no floor: see [0045](0045-temp-at-elevation-no-floor.md).
