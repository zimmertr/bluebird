# 0244. The chart's series lines are drawn on a canvas

- Status: Accepted
- Date: 2026-10-30
- Decider: the maintainer (TJ), who folded the renderer into PR #828 on 2026-10-30 after the resize profile
- Issues and PRs: #499, #828
- Cited in code as: record 0244
- Guide: `components/` guide: `ChartLines.tsx`, `TimeSeriesChart.tsx`; `utils/chart/` guide: `chartCanvas.ts`

## Context

A panel drew one Recharts `<Line>` per destination. At 200 lines over 15 days, one redraw of one panel profiled at about 141 ms of script on 2026-10-29. About half of that was Recharts' own `Line` building a label entry and a point for every hour of every line, labels or not. A drag across four panels paid that four times, and the stretch-and-settle drag (record 0239) could only hide it, not remove it.

## Decision

- **One canvas per panel holds every series line.** `ChartLines` renders inside the panel's `LineChart`, reads the plot area from Recharts, and lays a `foreignObject` over it. A plain child sits at Recharts' z 0, so the canvas stands over the grid (-100) and under the reference lines (400): Now, a model's end, the playhead and the extreme line all stay on top.
- **Recharts keeps everything else.** The axes, the grid, the reference lines, the tooltip and the synced cursor are still SVG. The tooltip reads the hour from the axis and every value from the lines. One unpainted `<Line>` on the first series stays as its anchor: a tooltip opened by `defaultIndex` (a finger, the tour) stood hidden with no graphical item to place it on. One line of points costs a fraction of a millisecond.
- **The canvas draws what the lines drew.** `lineStrokes` keeps the `<Line>` props' spelling: `LINE_DRAW` widths, thinner past `CROWDED_PAST`, the focused line wider and last, the rest at half. A missing hour breaks the path, as `connectNulls={false}` did. A point sample draws dots. The scales are linear over the plot area, from the first hour to the last and over the panel's y domain, as Recharts' time and number axes are.
- **Colour is the theme's half of each pair.** A line carries both themes as `light-dark()`, which a canvas cannot parse; `canvasColor` takes the half the root's `data-theme` names, and a theme switch redraws the canvas.
- **Hover dots are a second canvas.** A hover redraws a dot per line at one hour, ringed in the panel colour, and leaves the lines alone. The nearest line was already read through the panel's domain (`nearestKey`), so hover needs no Recharts line.
- **There are no dashed series.** Nothing drew one before this change, so the canvas draws none.

## Evidence

One panel, 200 lines over 15 days, 8 forced redraws, CDP sampling profiler at 100 µs on an unminified build in the pinned Playwright image, 2026-10-30.

| | SVG lines | Canvas |
|---|---|---|
| Script per redraw | about 141 ms | about 21 ms |
| Of which drawing the lines | about 80 ms in Recharts' `Line` | about 5 ms in `drawLines` and `stroke` |

## Alternatives rejected

- **Patching Recharts' `Line`.** Its label entries are its own design; a patch would be ours to carry through every upgrade.
- **Fewer points per line.** Thinning hours changes what the chart says.
