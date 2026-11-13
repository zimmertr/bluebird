# 0293. A desk's results grow to fit the chart's panels when a panel is added or the layout changes

- Status: Accepted; amends 0255
- Date: 2026-11-12
- Decider: the maintainer (TJ), 2026-11-12, after ASCII mockups of growing the sheet and of falling back to a stack
- Issues and PRs: #925
- Cited in code as: #925
- Guide: [`components/`](../../frontend/src/components/CLAUDE.md) guide, `TimeSeriesChart.tsx` and `ResultsPanels.tsx`; [`hooks/`](../../frontend/src/hooks/CLAUDE.md) guide, `useResultsLayout.ts`; [`utils/chart/`](../../frontend/src/utils/chart/CLAUDE.md) guide, `chartPointer.ts`; [`USAGE.md`](../USAGE.md), the chart

## Context

Record 0255 leaves a grid or rows panel undrawn when its box is under its floor: `panelFloorPx`, 72px at a desk (8 + 2 of margin, the 22px x axis and the 40px band). A stack holds each panel at its floor instead. The regression test of PR #924 found the gap: in a 1300x717 Chrome window, Chart after Analyze gave a chart of about 120px under the dropdown row. Four panels open as one over three, two rows of about 56px each, so all four boxes drew empty. Dragging the results about 340px up drew them, and nothing on screen said so. The **+** reached the same state before #924; the Metrics table's chart icons only made four panels quicker to reach.

## Decision

**When a panel is added or the layout changes at a desk, the results rise until every row clears its floor, as far as the window allows.** The chart measures its panels' area after the change and hands the shortfall to `useResultsLayout.raiseChart`. That raises the chart as a drag up the map│chart grip would, held to the same ceiling, and the height is the reader's from then on.

- It never lowers the results, and a chart already tall enough does not move.
- It does nothing on a view switch, on the first draw, on a phone, in Table, or while the tutorial's panels stand in. Neither their arrival nor their leaving counts as the reader's change.
- `tooSmall` and `tooSmallRect` stay. A reader who drags the results or a gutter below the floor still hides the panel, as 0255 says.

The floor a layout needs is `areaFloorPx` in `utils/chart/chartPointer.ts`: each row's `panelFloorPx` and the 8px bars between rows. Only a stack's bottom panel prints the time axis.

## Evidence

Two rows need 2 x 72 + 8 = 152px of panel area, computed from the constants on 2026-11-12. One, two, one needs 232px. Four stacked need 3 x 50 + 72 + 24 = 246px. The 120px chart and 56px rows come from one screenshot of one window and are estimates.

## Considered

- Falling back to a stack while the layout does not fit. Nothing outside the chart moves, but the layout on screen stops matching the layout button, and four stacked floors (246px) overflow a 120px chart anyway.
- Changing nothing. `docs/USAGE.md` already said a squeezed plot is hidden, but a reader who never dragged anything got a blank chart and had to know the fix.

## Consequences

- The map can shrink without a drag, by the floors' shortfall and only when a panel is added or the layout changes.
- A window too short for the floors still shows blank panels.
- A panel added from the Metrics table while the chart is not on screen raises nothing, since a view switch never does.
