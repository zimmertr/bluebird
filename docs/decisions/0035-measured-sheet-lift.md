# 0035. The sheet lift is measured, not derived

- Status: Accepted
- Date: 2026-09-14 (git: the merge of #335)
- Decider: TJ (git: author and merger of #335)
- Issues and PRs: #249, #335
- Cited in code as: #249
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `src/utils/forecastGrid.ts` bullet, from "That lift is MEASURED, not derived"

## Context

Every piece of the map's bottom chrome measures from one lift: the sheet's top edge.

## Decision

The lift is measured: `resolveSheetLift`, fed by a `ResizeObserver` on the sheet in `hooks/useResultsLayout.ts`. The derived `sheetHeightPx` stays for the two jobs an estimate is right for, the resting reserve and the camera padding, which must answer the same before and after a drag.

## Evidence

The estimate was 20px long on the header and 16px short on each grip, so the four results states sat 44.5, 44.5, 28.5 and 60.5px clear of the player instead of one number (#249 review).

## Alternatives rejected

- A lift summed from the header, its grips and the panel heights.

## Consequences

The offsets on that edge are styles derived in one place, not classes.
