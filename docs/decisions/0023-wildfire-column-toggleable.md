# 0023. The wildfire column is on by default and can be hidden

- Status: Accepted
- Date: 2026-08-21 (the guide: "TJ 2026-08-21"; git: the text arrived in #288)
- Decider: TJ, as the guide records
- Issues and PRs: #256, #275, #288
- Cited in code as: #256, #275, #288
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/fireProximity.ts` bullet, from "The screen column is shown by default"

## Context

The Wildfire (mi) column was always on.

## Decision

The column is shown by default and can be hidden in the Columns picker like any other column. Its visibility persists under `bluebird_forecast_view.columns3`, one key for each generation of the column set. While shown, its cells tick a loading frame during the check, and the warned cell is the row's only flag. The CSV carries the column only when the check is `ready` and the column is shown.

## Evidence

No measurement. TJ reversed the always-on rule on 2026-08-21.

## Alternatives rejected

- Always on: the earlier rule, reversed.
- One storage key for every generation of the column set: a stored set could not be told from a deliberate choice to hide the newest column.

## Consequences

`columns` migrates as wildfire and freeze visible, and `columns2` as freeze visible. A failed check reads `N/A` on screen, and the hover text separates it from an uncovered destination.
