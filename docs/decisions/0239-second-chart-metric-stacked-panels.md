# 0239. A second chart metric is a second panel under the first, on one time axis

- Status: Accepted
- Date: 2026-10-28
- Decider: the maintainer (TJ), who chose the stacked panels, the swap, the link parameter and the strings on 2026-10-28
- Issues and PRs: #499
- Cited in code as: #499
- Guide: `components/` guide: `TimeSeriesChart.tsx`; `hooks/` guide: `useChartPair.ts`; `utils/chart/` guide: `chartData.ts`, `chartPointer.ts`; `USAGE.md`

## Context

The results chart drew one metric at a time. A reader weighing rain against temperature had to flip the dropdown and hold the first picture in their head.

## Decision

- **Two stacked panels.** The second metric is its own `LineChart` under the first, synced by `syncId`, each with its own y axis, domain and extreme line. Only the bottom panel prints the time axis; the top one's is hidden and zero tall, so both plot bands span the same pixels. The Now line and the playhead stand in both; the Now and model-end labels in the top one only. With the slot empty the chart is one panel, as before.
- **A grip between them.** `ResizeGrip` moves height from one to the other, and a double press evens them. The split is session state. Each panel keeps a floor of its margins, its axis strip and a 40px band (`MIN_PANEL_BAND_PX`), the room two 11px tick labels need.
- **Pickers.** At a desk the second `MenuSelect` stands beside the first at `CHART_METRIC_W`, named `Second metric`, its first option `None`. On a phone each panel wears its own `CHART_TITLE` box, and with the slot empty a `None` box stands 8px right of the first title (`CHART_TITLE.row`).
- **One card.** A hover shows one card, on the hovered panel, each row reading both values joined by ` · `, a missing half left out. The nearest line is read through the hovered panel's domain and dims in both.
- **The slots swap.** The primary follows the ranking. A metric the other slot holds swaps the two, whether the ranking or either picker asks (`pickPrimary`, `pickSecond`).
- **The link.** `chart=precip,temp`, primary first, written only when the chart differs from a fresh one. Decoding drops what it does not know.
- **Two slots, no third.**
- **The hover budget counts both panels.** `tracksCursor` is handed every path a hover redraws, lines times panels.
- **A comparison stays off air quality in either slot**, for the reason it was off before: CAMS answers the same AQI whatever model ranked the field.

## Evidence

Measured 2026-10-28, 200 charted rows over 15 days (360 hourly stamps), in the pinned Playwright image's Chromium against the built image, Open-Meteo answered from the suite's fixtures:

| | main | this change, one panel | this change, two panels |
|---|---|---|---|
| Chart chunk, raw / gzip | 362,373 / 104,142 bytes | 365,461 / 105,211 bytes | same chunk |
| One hover move, to the next frame (median of 3 runs of 20 moves) | 17 ms | 19 ms | 25 ms |
| A Layers overlay toggle, to two task yields (median of 7) | 22 ms | 16 ms | 21 ms |

The window is 15 days (360 stamps), the most GFS reaches from the suite's clock; 16 days left Analyze greyed. At 200 lines and 360 stamps the hover emphasis is already off in one panel (72,000 points against `tracksCursor`'s 25,000), so the hover rows time Recharts' own tooltip and the second panel's sync cursor. A hover is timed to the next animation frame, so a number under about 17 ms reads as one frame. The toggle rows move by a few milliseconds between samples, so their differences are noise: the chart is memoized and an overlay toggle does not render it.

## Alternatives rejected

- **Two y axes on one plot.** Two scales over one set of lines reads as one scale, and a hover could not say which axis the cursor stands against.
- **A third slot.** Each panel would be too short to read at a phone sheet's rest height.
