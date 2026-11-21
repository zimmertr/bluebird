# 0321. The column widens over the map for every column, the toolbar and the chart

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it.
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-21, putting the results toolbar behind the expand button; built while the maintainer was away, 2026-11-21
- Issues and PRs: #825
- Supersedes: 0312, in part (the chart's pane under the map)
- Cited in code as: record 0321
- Guide: `frontend/src/components/CLAUDE.md` (`ResultsSheet.tsx`, `ResultsBar.tsx`, `ResultsPanels.tsx`), `frontend/src/styles.ts` (`RESULTS_COLUMN.wide`)

## Context

With the compact table in the desk's column (record 0320), the toolbar (Table, Chart and Both, Columns, Models, Removed and Download CSV), the chart's checkboxes and the chart itself had no table to serve. The maintainer put them behind the expand button: the column shows the compact table with no checkboxes, and expanded it shows every column, the toolbar, the series checkboxes and the chart modes. The prototype's expand button widens its column over the map, from the right edge across most of the window.

Record 0312 stood the chart in a pane under the map, left of the column, which the maintainer chose the same day. A column widened over the map covers that pane, so the two cannot both hold.

## Decision

- **Compact by default.** The column draws the compact table, and the results bar keeps its title, the subtitle, the lenses and the limits, with the expand button (`Every column`) at the title row's end before the chevron. It hides the toolbar.
- **Widened over the map.** The expand button widens the column to `RESULTS_COLUMN.wide`: from the right edge across `min(1100px, 96%)` of the window, over the map on the overlay layer. Widened, it holds every pane as a phone's sheet does (`ResultsPanels`, `part="wide"`, whose table fills what the chart leaves, since a desk's layout gives the table no height of its own): the toolbar, the full table with its checkboxes and the chart in its modes. The same button (`Narrow the table`, pressed) brings the compact column back. The width grip stands only on the compact column.
- **No chart under the map.** `ResultsChartPane` is gone, so the map keeps its whole height at a desk after a run, which is the prototype's map share.
- **The Limits card narrows the column.** The card hangs under the sentence bar, which the widened column covers, so **+ Limit** narrows it first.
- **The tour widens it.** The tour's chart cards hold the column wide while they point at the chart in it (`tour.sheetView`).

## Evidence

- `ResultsBar.test.tsx` pins the toolbar hidden in the compact column and shown widened, the button's two names and its pressed state, and no button on a phone. `ResultsSheet.test.tsx` pins the compact column's `column` part and the widened column's `all`. The browser suite widens the column before each press on the toolbar (`everyColumn` in `e2e/fixtures.ts`), and `centring.spec.ts` now centres a row while the column comes back from the map's edge, the one desk move left that narrows the map.

## Open

- This reverses the maintainer's "Pane under the map" for the chart (record 0312). The alternative keeps the chart under the map and stops the widened column above it, which leaves the toolbar's chart modes drawing outside the column they are pressed in.
- `Every column` and `Narrow the table` are the prototype's names for the button, awaiting the maintainer's approval.
