# 0239. The chart draws up to four metrics, each a panel on one time axis

- Status: Accepted
- Date: 2026-10-29
- Decider: the maintainer (TJ), who chose two stacked panels, the swap, and the link parameter on 2026-10-28, and on reviewing PR #828 on 2026-10-29 the card's headers, the + and the ×, four panels in a grid with one knob, and the names `Chart metric`, `Metric 2` to `Metric 4`, `Add a panel`, `Remove {metric label}` and `Resize the panels`
- Issues and PRs: #499, #828
- Cited in code as: #499
- Guide: `components/` guide: `TimeSeriesChart.tsx`; `hooks/` guide: `useChartMetrics.ts`; `utils/chart/` guide: `chartData.ts`, `chartPointer.ts`; `STYLES.md`; `USAGE.md`

## Context

The results chart drew one metric at a time. A reader weighing rain against temperature had to flip the dropdown and hold the first picture in their head.

## Decision

- **One panel per metric, up to four.** Each metric is its own `LineChart`, all in one `syncId` group, each with its own y axis, domain and extreme line. The Now and model-end lines stand in every panel; their labels in the first only. One metric is one panel, as before.
- **Two stack.** Only the bottom one prints the time axis; the top one's is hidden and zero tall, so both plot bands span the same pixels. `ResizeGrip` moves height between them, each held to a floor of its margins, its axis strip and a 40px band (`MIN_PANEL_BAND_PX`), the room two 11px tick labels need. A double press evens them.
- **Three and four stand in a grid.** Three are a row of two over one full-width panel; four are two rows of two. Every grid panel draws its own x and y axes, since a column cannot share another's.
- **The gutters size the grid.** The vertical gutter drags the column split, the horizontal one the row split, and a 16px square where they cross drags both; with three panels the vertical gutter stops at the top row and the crossing stands at the T. Each gutter is a 1px line in the `rule` token that turns accent on hover and while dragged. Every move sets the splits, each held to [0, 1] with no floor, so dragged into a corner one panel takes the area. A panel narrower or shorter than its floor (`panelWidthFloorPx`, `panelFloorPx`) is not drawn; its gutter and its picker stay. The width floor holds two of the widest x axis ticks on one line each (`MIN_PANEL_BAND_WIDTH_PX`, 2 × 74px + 8px), because at the height's 40px a squeezed panel printed one tick wrapped onto two lines. A double press on a gutter evens its axis, and on the crossing both. A drag stretches and settles (TJ 2026-10-29): each frame writes the live layout to the page and stretches every panel's last drawing to its box with a CSS transform, the panels redraw at their real size every 100 ms, and the split reaches state once, on release (`useStretchDrag`). The splits are session state. The + and the × are squares as tall as the picker beside them (22px at a desk, 32px on touch, 28px beside a phone's title).
- **A phone draws two.** It stacks the first two slots and greys its +. The slots past them stay in state and in the link, so a link with four opens on a desk with four.
- **The + and the ×.** At a desk each slot is a `MenuSelect` at `CHART_METRIC_W`, named `Chart metric` for the first and `Metric 2` to `Metric 4` after it, each but the first with an × after it and the last with a +, which adds the first metric of `CHART_METRICS` not drawn and greys at four. On a phone each panel's `CHART_TITLE` box carries the × after it, and the first the +. There is no empty slot.
- **One card.** A hover shows one card, on the hovered panel. With more than one panel it has a header naming each column with its unit and bare numbers under it; a missing value is an empty cell. Its width and its rows are budgeted on the whole chart area rather than the hovered panel, it is as wide as its content rather than shrunk to the hovered panel's box (Recharts positions it inside that panel, where a shrink-to-fit width squeezed the name column to `Moun…` in a 2×2 grid), it may cross into a neighbouring panel, and it stays inside the area: flipped to the cursor's left at the right edge and pulled up at the bottom (`cardPlacement`). One panel's card has no header, because its picker names the unit. The nearest line is read through the hovered panel's domain and dims in every panel.
- **Slots swap.** The first slot follows the ranking. A metric another slot holds swaps the two, whether the ranking or a picker asks (`pickMetric`).
- **The link.** `chart=precip,temp,wind,aqi`, first panel first, written only when there is more than one slot or the first is off the ranking's family. Decoding drops what it does not know, repeats and a fifth name.
- **The hover budget counts every drawn panel.** `tracksCursor` is handed lines times drawn panels.
- **A comparison stays off while any drawn panel is air quality**, for the reason it was off before: CAMS answers the same AQI whatever model ranked the field.

## Evidence

Measured in the pinned Playwright image's Chromium against the built image, Open-Meteo answered from the suite's fixtures, 200 charted rows over 15 days (360 hourly stamps). Main on 2026-10-28; this change on 2026-10-29, the four-panel row with the probe waiting until every panel had drawn its 200 lines (the AQI panel's land about a minute after the rows on a precipitation ranking):

| | main | one panel | two panels | four panels |
|---|---|---|---|---|
| Chart chunk, raw / gzip | 362,373 / 104,142 bytes | 367,675 / 106,007 bytes | same chunk | same chunk |
| One hover move, to the next frame (median of 3 runs of 20 moves) | 17 ms | 17 ms | 28 ms | 42 ms |
| A Layers overlay toggle, to two task yields (median of 7) | 22 ms | 14 ms | 22 ms | 20 ms |

The window is 15 days, the most GFS reaches from the suite's clock; 16 days left Analyze greyed. At 200 lines and 360 stamps the hover emphasis is already off in one panel (72,000 points against `tracksCursor`'s 25,000), so the hover rows time Recharts' own tooltip and the sync cursor in the other panels. A hover is timed to the next animation frame, so a number under about 17 ms reads as one frame. The toggle rows move by a few milliseconds between samples, so their differences are noise: the chart is memoized and an overlay toggle does not render it.

A split drag, 30 moves each timed to the next frame, three runs, on 2026-10-29: before is the commit with the gutters, after adds the stretch.

| | two panels, before | two panels, after | four panels, before | four panels, after |
|---|---|---|---|---|
| A move to the next frame, median / p90 | 611 / 814 ms | 30 / 442 ms | 686 / 1,493 ms | 66 / 788 ms |
| Script over the 30 moves | 11.8 to 14.8 s | 5.4 to 5.6 s | 22.3 to 26.4 s | 8.9 to 12.0 s |
| Release to settled | 48 ms | 395 to 445 ms | 370 to 684 ms | 807 to 1,208 ms |

The p90 is the redraw, one Recharts layout of every line in every panel at 200 lines; the frames between are the stretch. The release pays one redraw the old drag had already paid on its last move.

## Alternatives rejected

- **Two y axes on one plot.** Two scales over one set of lines reads as one scale, and a hover could not say which axis the cursor stands against.
- **An empty second slot reading None.** It was the first build (2026-10-28) and stood as a control with nothing in it; a + says what it does.
- **One knob where the gutters cross.** Shipped first, and replaced on review on 2026-10-29: a 14px knob was hard to find and could not move one split alone.
- **More than four.** Each panel at a laptop's chart height would be shorter than its own axis labels can stand in.
