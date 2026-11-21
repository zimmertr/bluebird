# 0311. A desk stands its results in a column down the map's right edge

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it.
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-21, choosing "Pane under the map" for the chart
- Issues and PRs: #825
- Cited in code as: the from-scratch shell, record 0311
- Guide: `frontend/src/components/CLAUDE.md` (`ResultsSheet.tsx`, `ResultsPanels.tsx`, `ResultsBar.tsx`), `frontend/src/hooks/CLAUDE.md` (`useResultsLayout.ts`)

## Context

The prototype ranked the field in a column down the map's right edge, the full height of the window, with the headline, the lenses and the rows one above the other. This PR first kept the results docked under the map, as main does, and the maintainer saw the difference on 2026-11-21: "the prototype had a whole right-side panel? We still have the bottom results area?" The chart is the one part of the results a column is too narrow for, so where it goes was the maintainer's choice.

## Decision

At a desk the results stand in a column down the map's right edge, as wide as `RESULTS_COLUMN.column` says (26rem to 36rem, a third of the window between) until its left edge is dragged: the results bar on top, its lenses under it, and the table filling the rest. The chart stands under the map instead, in the map's column and at the map's width, with its own height grip. Table shows the column's table alone, Both the table and the chart under the map, and Chart the chart under the map with its series chips in the column, in the table's place and filling it, since the column's bar holds the switch that brings the table back. The collapse chevron in the bar points right and takes the column and the chart away; a round button on the map's right edge, the same chevron pointing left and named `Expand results` as the bar's is, brings them back. A drag on the column's left edge sets its width, no narrower than the class's 26rem floor and never leaving the map under 480px (`columnWidthPx` in `utils/results/resultsSheet.ts`), and a double press there gives the class's width back. The width is not kept past the page.

The panels split rather than move: one `ResultsPanels` draws the column's part and another the chart's part, both handed one set of props (`panelsProps` in `ResultsSheet.tsx`), so the two halves of a report cannot be handed two reports. A phone keeps its sheet over the map, every pane in it, until the phone's shell.

The column shares no height with the chart, so the stacked desk's machinery for sharing it no longer runs there: a press keeps no room (record 0271), the bar and the lone chart's chips are not measured for the map's floor, and the chart under the map takes the floor of a map with one grip and no bar.

## Evidence

- `ResultsSheet.test.tsx` pins the split, that the column goes with the chevron, that a phone draws every pane in its sheet, and the expand button, and the width grip's drag, bounds and reset. `resultsSheet.test.ts` pins `columnWidthPx`. `styles.test.ts` pins the column's width bounds, edge and ground.
- Checked in the PR preview on 2026-11-21 at 1389x868 against stubbed forecasts: Table, Both and Chart, the column 472px wide beside a 916px map.

## Open

- The column slides in and out at once; the panel's motion (record 0202) is not yet on it.
- A narrow desk truncates the sentence bar's chips, because the map beside the column is narrower.
- Supersedes nothing yet: records 0202, 0216, 0218, 0220 and 0271 describe the stacked desk and change status when the maintainer accepts this one.
