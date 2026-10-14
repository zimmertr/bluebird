# 0126. The chart marks the most extreme value among the ranked lines with a dashed line labelled with that value

- Status: Accepted
- Date: 2026-10-08 for what the mark means, 2026-10-13 for how it is drawn; recorded 2026-10-13
- Decider: the maintainer, on #699 (2026-10-08: Option A, the ranking's direction on the ranked family and the highest on any other, nothing at a zero that means none, only drawn lines and only the ranking model's) and on PR #705 (2026-10-13, after seeing the first cut on a 101-line chart: the red ring is dropped for a horizontal dashed line in the `Now` line's style, labelled with the value)
- Issues and PRs: #699, #705
- Cited in code as: #699
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `TimeSeriesChart.tsx` bullet; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `chartColors.ts` bullet, and the `chartData.ts` and `modelCompare.ts` bullets; [`docs/USAGE.md`](../USAGE.md), Viewing the results

## Context

The chart under the results marks where its data changes meaning (the `Now` seam, a compared model's end, the map's playhead), but nothing pointed at the value a reader usually ranked the field to find. The maintainer's case (2026-10-08): 101 destinations from the Smoot list, ranked `Highest Avg Wind` over Oct 8 to Oct 23 on NOAA GFS, where the tallest spike is Mount Rainier at 75.4 mph and the only way to read it among 101 lines was to hover there. They circled it in red by hand and asked for that circle, done properly. Two facts shaped what the mark can mean: the chart plots hourly values while the table ranks on an aggregate (Min, Max, Avg or Total), and an average has no hour; and the chart opens on the ranked family, but the reader can switch it to any other.

The first cut on PR #705 drew that circle, a hollow red ring on each extreme point. The maintainer dropped it on 2026-10-13 after seeing it on a 101-line chart: it clipped the x axis when the extreme sat at the bottom, it was not pretty, and it carried no information.

## Decision

- **One horizontal dashed line across the whole plot at the most extreme non-null hourly value among the drawn, ranked lines of the charted family** (`extremeValue` in `utils/chartData.ts`). On the ranked family the direction is the ranking's: `Highest` marks the largest value and `Lowest` the smallest. On any other family it marks the largest, because no direction was chosen there.
- **It is drawn as the `Now` line is**: the same `CHART_AXIS_COLOR`, dash, stroke width and label type, through one `CHROME_LINE` and one `chromeLabel` in `TimeSeriesChart.tsx` that the `Now` and model-end lines wear too, so the three cannot drift apart. No new colour.
- **Its label is the value and nothing else**: the number as the hover box prints it, then the unit the metric select names, as in `75.4 mph`, `0.0 °F` or `57` for AQI, which has no unit (`extremeLabel`). It stands at the line's right end, above the line, and below it when the line runs through the top headroom where a label above would leave the plot (`extremeLabelPosition`, decided at the line's pixel height once Recharts has placed it).
- **A tie needs no rule**: one line passes through every hour that ties it.
- **An extreme of exactly 0 draws nothing on the families where 0 means none** (`ZERO_IS_NONE`: precipitation, snowfall, wind, AQI). Temperature, the freezing level and the cloud deck are not in the set: 0 °F is a real coldest hour, a freezing level of 0 is a reading (the whole column below freezing), and the cloud deck is a height whose low end is cloud on the ground. Nulls are never candidates on any family.
- **Only drawn lines count.** A row unticked in the table, a chip hidden in the chart-only legend and a model hidden in the `Models` picker are not on the chart, so they cannot set the line, and it moves to the most extreme value among the lines still shown.
- **While models are compared, only the ranking model's lines count**, because the compared lines are not what the field is ranked on. `ChartLine.ranked` carries this: the chart sets it on every plain row, and `compareSeries` on the ranking model's pairs alone.
- **No hover entry and no tooltip row.** It is drawn after the lines, so the hover's dimming never reaches it. A point-sample window gets the same line through its extreme dot.
- **It is chrome.** It does not touch `present.ts`, the ranking, the map markers or the CSV.

## Evidence

- Placement, measured 2026-10-13 from the SVG the real Recharts draws under jsdom into an 800 by 300 box (plot top at 8 px, x axis at 276 px): ranked `Highest`, the line sat at 20.8 px, 12.8 px under the plot's top, so its label hung below it; ranked `Lowest Min Temperature`, the line sat on the x axis at 276 px and its label stood above it, inside the plot; mid-plot, at 239.9 px, the label stood above. Every label ended at 779 px, 5 px inside the plot's right edge.
- One hover re-render, measured 2026-10-13 in Vitest under jsdom: 101 destinations by 48 hours of wind with the real Recharts drawing into a fixed 800 by 300 box, 40 hover moves between two cursor heights, the median React Profiler `actualDuration` of the re-renders, five runs of each build interleaved. Before the line (`main`), the median of the five medians was 31.98 ms (27.51 to 33.55); with it, 28.99 ms (28.42 to 30.98), inside the run-to-run spread. `extremeValue` ran once at mount and not again across the 40 hovers.
- `chartData.test.ts` holds both directions, nulls, a tie, the zero rule on precipitation, wind, snowfall and AQI against temperature and the freezing level, an empty line set, ranked-only filtering, a point sample, the label's format and the label's placement either side of the headroom. `TimeSeriesChart.test.tsx` holds one line with its formatted label, the `Now` style, none for a null and for the zero rule, the live switch to `Lowest`, the unranked family, the label's flip and that a hover does not run the walk again. `modelCompare.test.ts` holds the `ranked` flag.

## Alternatives rejected

- **A hollow red ring on each extreme point** (the first cut on PR #705, with ties ringed up to `MAX_EXTREME_MARKS` = 5 and nothing past five, in red-500 at 3.89:1 on slate-800): dropped by the maintainer on 2026-10-13. It clipped the x axis when the extreme sat at the bottom, it was not pretty, and a mark with no value carried no information.
- **The #1 row's own extreme hour**: the mark would always sit on the top-ranked line, but it can miss the tallest spike on screen, which is what the reader is looking at.
- **The hour that produced #1's ranked number**: exact for Min and Max, but Avg and Total have no such hour, so the ranking the maintainer used in both examples would draw nothing.
- **A tooltip or hover entry for the mark**: decided against, as for the model-end lines.

## Consequences

- Accepted trade-off: under an Avg or Total ranking the line can be set by a row that is not #1. It answers "how extreme does it get", not "why is #1 first".
- Accepted trade-off: off the ranked family the line always marks the highest value, including families where high is the good end (a high cloud deck, a high freezing level).
- The label can share the top-right corner with a `Now` or model-end label when both run there; nothing moves either one out of the other's way.
- `TimeSeriesChart` takes `sortBy` and `sortDesc` as primitives, threaded from `ResultsSheet` through `ResultsPanels`, and resolves the direction itself, so the memo compares values and the `results-panels-memo-props` check still sees `ResultsPanels` handing on only what it is given. The walk is memoized on `[lines, metric, highest]`.
