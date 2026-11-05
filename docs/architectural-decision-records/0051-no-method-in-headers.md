# 0051. Metric column headers do not name the elevation method

- Status: Accepted
- Date: 2026-09-22 (the guide; git: the merge of #462)
- Decider: TJ, who opened #457 (git: author and merger of #462)
- Issues and PRs: #361, #443, #457, #462
- Cited in code as: #361, #443, #457
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the paragraph "Key constraints shared between frontend and backend", from "No column header names the method"

## Context

#361 and #443 put `at elevation` on the wind and temperature column headers.

## Decision

No metric column header names the elevation method. `metricLabel` takes no qualifier and `ColDef` carries none. The method is described in `docs/DATA.md`. The free-air interpolation stays the method the table uses.

## Evidence

Measured for #457 (git: #462, 2026-09-22): Open-Meteo lapses `temperature_2m` to the coordinate's 90 m DEM height by default on both endpoints, within 12 to 155 m of four Cascade summits, where the grid-cell means sat 700 to 900 m under. `precipitation_925hPa` and `pm2_5_925hPa` both answer 400: precipitation and air quality are the cell's surface values at the destination, and the freezing level is a height of its own. So every metric column stands at the destination's elevation.

## Alternatives rejected

- `at elevation` beside two headers: it read as a difference in place, where the difference is the method. Reverses the headers #361 and #443 added.

## Consequences

`tableColumns.test.ts` fails a label that matches `at (elevation|N meters)`. The measurement did not overturn #443's physics: the lapsed value carries the surface layer of the cell's ground up with it, so a summit can read below freezing under a freezing level thousands of feet higher.
