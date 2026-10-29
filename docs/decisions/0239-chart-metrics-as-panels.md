# 0239. The chart draws up to four metrics, each a panel on one time axis

- Status: Accepted
- Date: 2026-10-29
- Decider: the maintainer (TJ), who chose two stacked panels, the swap, the link parameter and the picker names on 2026-10-28, and on reviewing PR #828 on 2026-10-29 the card's headers, the + and the ×, four panels in a grid with one knob, and the names `Add a panel`, `Remove {metric label}` and `Resize the panels`
- Issues and PRs: #499, #828
- Cited in code as: #499
- Guide: `components/` guide: `TimeSeriesChart.tsx`; `hooks/` guide: `useChartMetrics.ts`; `utils/chart/` guide: `chartData.ts`, `chartPointer.ts`; `STYLES.md`; `USAGE.md`

## Context

The results chart drew one metric at a time. A reader weighing rain against temperature had to flip the dropdown and hold the first picture in their head.

## Decision

- **One panel per metric, up to four.** Each metric is its own `LineChart`, all in one `syncId` group, each with its own y axis, domain and extreme line. The Now and model-end lines stand in every panel; their labels in the first only. One metric is one panel, as before.
- **Two stack.** Only the bottom one prints the time axis; the top one's is hidden and zero tall, so both plot bands span the same pixels. `ResizeGrip` moves height between them, each held to a floor of its margins, its axis strip and a 40px band (`MIN_PANEL_BAND_PX`), the room two 11px tick labels need. A double press evens them.
- **Three and four stand in a grid.** Three are a row of two over one full-width panel; four are two rows of two. Every grid panel draws its own x and y axes, since a column cannot share another's.
- **One knob sizes the grid.** It stands where the gutters cross and moves both splits on every pointer move, each held to [0, 1] with no floor, so dragged into a corner one panel takes the area. A panel narrower or shorter than its floor (`panelWidthFloorPx`, `panelFloorPx`) is not drawn; its gutter and its picker stay. A double press evens the grid. The gutters themselves do not drag. The splits are session state.
- **A phone draws two.** It stacks the first two slots and greys its +. The slots past them stay in state and in the link, so a link with four opens on a desk with four.
- **The + and the ×.** At a desk each slot is a `MenuSelect` at `CHART_METRIC_W`, each but the first with an × after it and the last with a +, which adds the first metric of `CHART_METRICS` not drawn and greys at four. On a phone each panel's `CHART_TITLE` box carries the × after it, and the first the +. There is no empty slot.
- **One card.** A hover shows one card, on the hovered panel. With more than one panel it has a header naming each column with its unit and bare numbers under it; a missing value is an empty cell. One panel's card has no header, because its picker names the unit. The nearest line is read through the hovered panel's domain and dims in every panel.
- **Slots swap.** The first slot follows the ranking. A metric another slot holds swaps the two, whether the ranking or a picker asks (`pickMetric`).
- **The link.** `chart=precip,temp,wind,aqi`, first panel first, written only when there is more than one slot or the first is off the ranking's family. Decoding drops what it does not know, repeats and a fifth name.
- **The hover budget counts every drawn panel.** `tracksCursor` is handed lines times drawn panels.
- **A comparison stays off while any drawn panel is air quality**, for the reason it was off before: CAMS answers the same AQI whatever model ranked the field.

## Evidence

Measured in the pinned Playwright image's Chromium against the built image, Open-Meteo answered from the suite's fixtures, 200 charted rows over 15 days (360 hourly stamps). Main on 2026-10-28; this change on 2026-10-29:

| | main | one panel | two panels | four panels |
|---|---|---|---|---|
| Chart chunk, raw / gzip | 362,373 / 104,142 bytes | 367,675 / 106,007 bytes | same chunk | same chunk |
| One hover move, to the next frame (median of 3 runs of 20 moves) | 17 ms | 17 ms | 28 ms | 33 ms |
| A Layers overlay toggle, to two task yields (median of 7) | 22 ms | 14 ms | 22 ms | 21 ms |

The window is 15 days, the most GFS reaches from the suite's clock; 16 days left Analyze greyed. At 200 lines and 360 stamps the hover emphasis is already off in one panel (72,000 points against `tracksCursor`'s 25,000), so the hover rows time Recharts' own tooltip and the sync cursor in the other panels. A hover is timed to the next animation frame, so a number under about 17 ms reads as one frame. The toggle rows move by a few milliseconds between samples, so their differences are noise: the chart is memoized and an overlay toggle does not render it.

## Alternatives rejected

- **Two y axes on one plot.** Two scales over one set of lines reads as one scale, and a hover could not say which axis the cursor stands against.
- **An empty second slot reading None.** It was the first build (2026-10-28) and stood as a control with nothing in it; a + says what it does.
- **Dragging each gutter.** Two or three handles for one picture; one knob moves both splits.
- **More than four.** Each panel at a laptop's chart height would be shorter than its own axis labels can stand in.
