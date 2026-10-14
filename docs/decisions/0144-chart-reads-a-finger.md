# 0144. The chart reads the hour under a finger as it reads a resting mouse

- Status: Accepted
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #336 (folded into #708), 2026-10-14
- Issues and PRs: #336, #696, #708, #517
- Cited in code as: #336
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `TimeSeriesChart.tsx`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `chartPointer.ts`

## Context

`TimeSeriesChart.tsx` read only `onMouseMove` and `onMouseLeave`. A tap moved the map's playhead (#517), but a finger could not read one hour's values off the chart: a touch sends no hover, and a sideways drag was the browser's.

## Decision

- **A finger or a pen on the plot reads the hour under it** (`onPointerDown`, `onPointerMove`): the same tooltip the mouse gets and, where the chart may follow a cursor, the nearest line drawn over the rest. No new words.
- **The plot keeps only the vertical pan for the browser** (`CHART_PLOT_TOUCH`, `touch-pan-y`), so a sideways drag reads the chart and an up or down one still scrolls the sheet. The browser's own pan cancels the pointer, which drops the reading.
- **The reading stays when the finger lifts**, so it can be read without a finger over it; a mouse takes it back, and the tutorial's forced hour wins over it.
- **The geometry is `utils/chartPointer.ts`**: the plot band and the hour and value under a pixel, which the click that moves the playhead now inverts through too. Its suite is `chartPointer.test.ts` (`a finger at a pixel reads the hour a hover there names`).

## Evidence

2026-10-14 at 360x740 in Chromium with touch events sent through the protocol: the tooltip showed the hour under the finger through a sideways drag and stayed after the lift. `chartTap.spec.ts` holds it in the browser suite.
