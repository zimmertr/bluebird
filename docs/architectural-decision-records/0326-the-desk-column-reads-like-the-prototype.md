# 0326. The desk's column reads like the prototype: its headline, its rows, its strip and its toolbar

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it. Amends [0319](0319-results-header-carries-lenses-and-limits.md) (the headline's size), [0320](0320-the-desk-column-draws-a-compact-table.md) (the compact headers, name and score) and [0323](0323-the-day-strip-plays-the-window-after-a-forecast.md) (the window's days).
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-17, asking for the build to look like the prototype; built while the maintainer was away, 2026-11-21, from a side-by-side pass at 1389px in both themes
- Issues and PRs: #825
- Cited in code as: record 0326
- Guide: `frontend/src/styles.ts` (`RESULTS_HEAD.headline`, `TABLE.nameStrong`, `TABLE.scoreCompact`), `frontend/src/utils/tableColumns.ts` (`COMPACT_LABELS`), `frontend/src/components/ResultsBar.tsx`, `ResultsTableRow.tsx`, `DayStrip.tsx`

## Context

Side by side with the prototype at 1389px, the build's column still read as a spreadsheet beside the prototype's answer. Its headline was the bar's 12px subheading where the prototype sets 17px bold. Its names were regular weight and its scores 12px on a cell tinted in the score's colour, where the prototype sets the name a weight up and the score at 15px on the row's ground, the strip beside it carrying the colour. Its wind and low headers were the full table's `Wind · Max (mph)` and `Temperature · Min (°F)`, which ran the table past the column's edge. Once the day strip played the window its days were a solid accent block, where the prototype tints them so the sky inside reads. And the widened column's toolbar stood on the title's row, which at 1066px ran Download CSV under the chevron.

## Decision

- **The headline** at a desk, while a lens ranks, is `TEXT.appTitle` (18px bold), the size of the panel's own title. A phone's sheet keeps the subheading its rest heights are worked out from.
- **The compact rows**: the name `font-semibold`, the score `text-base font-semibold` in the strong ink with no fill, and the headers `Wind (mph)` and `Low (°F)` (new strings, in the PR's strings table). The full table keeps every long name and the tinted score with its little strip.
- **The window's days** wear the range's tint end to end while the strip plays them.
- **The toolbar** joins the title's row only when the bar is 72rem or wider (`@6xl`), so the widened column, at most 1100px, keeps it on a row of its own.

## Consequences

- The compact table's wind and low headers differ from the full table's for the same column; a reader who widens the table sees the long names.
