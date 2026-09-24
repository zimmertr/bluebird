# 0026. The freezing level is reduced on its own, read in its declared unit, and colored like every metric

- Status: Accepted
- Date: 2026-09-13 (git: the merge of #332)
- Decider: TJ (git: author and merger of #332)
- Issues and PRs: #295, #332, #391, #416, #449
- Cited in code as: #295, #391, #449
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the paragraph "Key constraints shared between frontend and backend", from "An eighth is the freezing level"

## Context

Open-Meteo serves the freezing level on three of the eight models and answers the other five with a column of nulls.

## Decision

The freezing level is reduced outside the precipitation, temperature and wind zip. Its three aggregates are independently nullable, it is reported in whole feet above sea level, and 0 is a reading. Both ports read the unit each response declares and convert only from meters; an unknown or absent unit over a column of numbers fails the batch like any unusable body, with "Open-Meteo request failed. Try again later." (`OpenMeteoBadBody` in the browser, #391). Since 2026-09-14 it ranks, colours markers, paints grid cells and prints a band legend: six blues from cold to warm, encoding the height of the air column rather than a verdict.

## Evidence

Measured 2026-09-12: the variable is served on `gfs_seamless`, `gfs_hrrr` and `icon_seamless`. Measured 2026-09-13 at Rainier: with `precipitation_unit=inch`, which every request here carries, the API answers in feet and says `"ft"`; without it, meters and `"m"` (2560 m is the same hour as 8398.95 ft).

## Alternatives rejected

- Dropping an hour that has no freezing level: it would empty every other number on five models' rows.
- Guessing a factor of 3.28 for an unknown unit.
- Leaving it out of the ranking and the colour scales: #295's first call, reversed on 2026-09-14.

## Consequences

It is part of the vector-pinned aggregation (mirror row 6), and both branches of the unit rule are in the vectors. A bound on it passes nulls, or the table would empty under five models. Snow depth wears the same six shades in the opposite order (#449).
