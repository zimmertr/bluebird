# 0325. A desk's column takes the prototype's proportion, and its hour strips its width

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Amends [0312](0312-a-desk-stands-its-results-in-a-column.md) (the column's width) and [0320](0320-the-desk-column-draws-a-compact-table.md) (the strip's width).
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-17, asking for the build to look like the prototype; built while the maintainer was away, 2026-11-21
- Issues and PRs: #825
- Cited in code as: record 0325
- Guide: `frontend/src/styles.ts` (`RESULTS_COLUMN.column`, `HOUR_STRIP.days`), `frontend/src/utils/results/resultsSheet.ts` (`COLUMN_MIN_PX`); `docs/STYLES.md`

## Context

Record 0312 stood the results in a column a third of the window wide, 26rem to 36rem. The prototype's column is 44% of its window, and its compact table draws two days of hours in about 128px, the hours flush. On the PR preview at 1389px the build's column was 471px and its strips 160px a day with a pixel between hours, so the Monday strip ran under the column's edge and Wind and Low were off it (2026-11-21).

## Decision

- **The column** is `clamp(420px, 44vw, 640px)`: the prototype's 44%, a floor where the compact table's name, score, two days of hours, wind and low fit, and a ceiling past which the map gives up room the rows do not use. A drag on its left edge stops at the same 420px (`COLUMN_MIN_PX`).
- **The strip** is 128px for the window's days, the hours flush inside each day and 4px between days, the header's day names on the same width.

## Consequences

- The map keeps 56% of a 1389px desk beside the column, where it kept 66%; the prototype measured 48% of its screen with its own header counted.
- A window of many days draws thin days in the same 128px; the full table behind the expand button keeps the per-row strips at their own width.
