# 0126. The chart rings the most extreme hour among the ranked lines it draws

- Status: Accepted
- Date: 2026-10-08, the ring's colour 2026-10-13; recorded 2026-10-13
- Decider: the maintainer, on #699 (2026-10-08: Option A, no text, the charted family's highest off the ranked one, every tie ringed, nothing past five ties or at a zero that means none, only drawn lines and only the ranking model's; 2026-10-13: the cap stays five and the ring is red)
- Issues and PRs: #699, #705
- Cited in code as: #699
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `chartColors.ts` bullet, and the `chartData.ts` and `modelCompare.ts` bullets; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `TimeSeriesChart.tsx` bullet; [`docs/USAGE.md`](../USAGE.md), Viewing the results

## Context

The chart under the results marks where its data changes meaning (the `Now` seam, a compared model's end, the map's playhead) but nothing points at the hour a reader usually ranked the field to find. The maintainer's case (2026-10-08): 101 destinations from the Smoot list, ranked `Highest Avg Wind` over Oct 8 to Oct 23 on NOAA GFS, where the tallest spike is Mount Rainier at 75.4 mph and the only way to name it among 101 lines was to hover there. They circled it in red by hand and asked for that circle, done properly. Two facts shaped what the mark can mean: the chart plots hourly values while the table ranks on an aggregate (Min, Max, Avg or Total), and an average has no hour; and the chart opens on the ranked family but the reader can switch it to any other.

## Decision

- **The ring marks the single most extreme non-null hourly value among the drawn lines of the charted family** (`extremePoint` in `utils/chartData.ts`). On the ranked family the direction is the ranking's: `Highest` rings the largest value and `Lowest` the smallest. On any other family it rings the largest, because no direction was chosen there.
- **A tie rings every tied (line, hour) pair.** More than `MAX_EXTREME_MARKS` (5) tied pairs ring nothing, because there is then no single extreme to point at, and the walk stops collecting ties once past the cap.
- **An extreme of exactly 0 rings nothing on the families where 0 means none** (`ZERO_IS_NONE`: precipitation, snowfall, wind, AQI). Temperature, the freezing level and the cloud deck are not in the set: 0 °F is a real coldest hour, a freezing level of 0 is a reading (the whole column below freezing), and the cloud deck is a height whose low end is cloud on the ground. Nulls are never candidates on any family.
- **Only drawn lines count.** A row unticked in the table, a chip hidden in the chart-only legend and a model hidden in the `Models` picker are not on the chart, so they cannot hold the ring, and it moves to the most extreme point among the lines still shown.
- **While models are compared, only the ranking model's lines count**, because the compared lines are not what the field is ranked on. `ChartLine.ranked` carries this: the chart sets it on every plain row, and `compareSeries` on the ranking model's pairs alone.
- **No text and no hover entry.** The ring is a hollow `ReferenceDot` (r 8, 1.5 px stroke, no fill, no label), drawn after the lines so it sits on them, at full strength while the hover dims the other lines, and sized to stand around the hover dot rather than read as one. It adds no tooltip row.
- **It is red** (`CHART_EXTREME_COLOR`, red-500, in `utils/chartColors.ts`), the colour the maintainer drew it in, chosen because it denotes the extreme value. It is the one chrome colour in a verdict hue, deliberately, and it is not a verdict: on a family where high is the good end, it still marks the extreme.
- **It is chrome.** It does not touch `present.ts`, the ranking, the map markers or the CSV.

## Evidence

- Contrast, measured 2026-10-13: red-500 (`#ef4444`) on the slate-800 panel (`#1e293b`) is 3.89:1, over the 3:1 WCAG 1.4.11 asks of a graphical object. `chartColors.test.ts` pins the number, the first contrast assertion on a chart chrome colour. The provisional slate-100 measured 13.35:1 the same day.
- One hover re-render, measured 2026-10-13 in Vitest under jsdom: 101 destinations by 48 hours of wind with the real Recharts drawing into a fixed 800 by 300 box, 40 hover moves between two cursor heights, the median React Profiler `actualDuration` of the re-renders, five runs of each build interleaved. Before the ring, the median of the five medians was 25.98 ms (25.45 to 27.60); with it, 26.29 ms (24.84 to 32.59), inside the run-to-run spread. `extremePoint` ran once at mount and not again across the 40 hovers.
- `chartData.test.ts` holds both directions, nulls, ties up to and past the cap, the zero rule on precipitation, wind, snowfall and AQI against temperature and the freezing level, an empty line set, the stable empty answer and ranked-only filtering. `TimeSeriesChart.test.tsx` holds one ring, a ring per tied point, none when `extremePoint` answers nothing, the live direction switch, the unranked family, and that a hover does not run the walk again. `modelCompare.test.ts` holds the `ranked` flag.

## Alternatives rejected

- **The #1 row's own extreme hour**: the ring would always sit on the top-ranked line, but it can miss the tallest spike on screen, which is what the reader is looking at.
- **The hour that produced #1's ranked number**: exact for Min and Max, but Avg and Total have no such hour, so the ranking the maintainer used in both examples would draw nothing.
- **A label or a legend line beside the ring**: hovering already gives the value, and a label at the top edge collides with the `Now` and model-end labels; in the example the spike sits right beside `Now`. Both would also be new copy.
- **A tooltip or hover entry for the ring**: decided against, as for the model-end lines.
- **A neutral slate-100 ring**: implemented first as a placeholder; the maintainer chose red.

## Consequences

- Accepted trade-off: under an Avg or Total ranking the ring can sit on a row that is not #1. The ring answers "where is the extreme hour", not "why is #1 first".
- Accepted trade-off: off the ranked family the ring always marks the highest hour, including families where high is the good end (a high cloud deck, a high freezing level).
- If five proves wrong in use, it is one constant, `MAX_EXTREME_MARKS`.
- Open: with no text, what the ring means is learned from `docs/USAGE.md` or by hovering it. If it reads as unexplained in use, the options are a legend line or a label, and both are new copy for the maintainer to approve.
- `TimeSeriesChart` takes `sortBy` and `sortDesc` as primitives, threaded from `ResultsSheet` through `ResultsPanels`, and resolves the direction itself, so the memo compares values and the `results-panels-memo-props` check still sees `ResultsPanels` handing on only what it is given. The walk is memoized on `[lines, times, metric, highest]`.
