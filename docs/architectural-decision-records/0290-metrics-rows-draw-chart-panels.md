# 0290. The Metrics table keeps a row per metric, and each row draws its metric on the results chart

- Status: Accepted
- Date: 2026-11-12
- Decider: the maintainer (TJ), 2026-11-12, after trying #831 on its preview and a lab of seven versions
- Issues and PRs: #498 (closed, not planned), #831 (closed unmerged), #924
- Cited in code as: record 0290
- Guide: [`components/`](../../frontend/src/components/CLAUDE.md) guide, `MetricsTable.tsx`; [`hooks/`](../../frontend/src/hooks/CLAUDE.md) guide, `useChartMetrics.ts`; [`utils/chart/`](../../frontend/src/utils/chart/CLAUDE.md) guide, `chartData.ts`; [`STYLES.md`](../STYLES.md), `SELECT_W_AGGREGATE` and `METRIC_CHART`; [`USAGE.md`](../USAGE.md), Metrics and the chart

## Context

#498 asked for a shorter Metrics section: one row per metric made it the panel's tallest, 387px at 1440x900 on 2026-10-28. The maintainer chose option A on 2026-10-28, a Metric menu, an Aggregate menu and bound rows that stand only while set, and #831 built it. On its preview the menus read worse than the table they replaced: Metric and Bound listed the same metrics twice, the Bound adder looked like a field and held no value, a bound stood apart from its metric, and every change took a menu pick.

A lab drew today's table, #831 and five other shapes in the app's tokens. The maintainer preferred today's table, and saw promise in a list of chosen metrics only as a way to pick the results chart's panels, which #499 made one to four.

## Decision

**The Metrics table keeps a row per metric and its height.** #498 closes as not planned.

**Each row gets a chart toggle after the metric's name**, which draws that metric as a panel of the results chart or takes it away. It edits the chart's own list (`useChartMetrics`), so the chart's pickers move and remove the same panels. The first panel's toggle is lit and takes no press, because the chart keeps that slot for the ranking. At four panels the undrawn toggles grey, a row the window cannot answer greys its toggle with the rest of it, and a Shift press sets every row between it and the last press (record 0209). Its name for a screen reader is `Show {metric} on the chart`, approved by the maintainer.

Bounds stay apart from the chart. The lab's other way to join them, rows you add that are the chart's panels, made bounding a metric chart it, and capped the bounds at four.

## Evidence

The label budget at a desk with several hours selected is 317px less the radio, its gap, three grid gaps, the aggregate menu and two 56px boxes. At 72px for the menu that left `Freezing level` (78.03px) 12px, and the toggle needs 18. `Total`, the menu's widest word, measures 27.54px in production (Chrome on macOS, 2026-11-12); with the field's 8px padding, 24px chevron reserve and 2px border its floor is 61.54px. At 64px `Total` keeps 2.46px and the label 3px. A phone's sheet keeps 328px and no bar, so the toggle's 28px touch box fits there with 3px to spare.

The toggle's glyph on the panel: 3.07:1 dark and 4.32:1 light at rest, 6.71:1 and 5.74:1 lit, computed from the tokens on 2026-11-12.

## Consequences

- The section stays about 387px at a desk, and each new metric still adds a row.
- The aggregate menu is 8px narrower, and its floor now counts the field's border.
- The chart can be built from the panel without opening the results.
