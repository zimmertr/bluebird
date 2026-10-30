# 0243. The chart draws up to four metrics, each a panel on one time axis

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
- **The gutters size the grid.** The vertical gutter drags the column split, the horizontal one the row split, and a 16px square where they cross drags both; with three panels the vertical gutter stops at the top row and the crossing stands at the T. Each gutter is a 1px line in the `edge` token, which clears the 3:1 a UI boundary owes on the panel (3.07:1 dark, 3.97:1 light) where `rule` did not, that turns accent on hover and while dragged. Every move sets the splits, each held to [0, 1] with no floor, so dragged into a corner one panel takes the area. A panel narrower or shorter than its floor (`panelWidthFloorPx`, `panelFloorPx`) is not drawn; its gutter and its picker stay. The width floor holds two of the widest x axis ticks on one line each (`MIN_PANEL_BAND_WIDTH_PX`, 2 × 74px + 8px), because at the height's 40px a squeezed panel printed one tick wrapped onto two lines. A double press on a gutter evens its axis, and on the crossing both. A drag runs on the compositor (TJ 2026-10-30, replacing the stretch and settle of 2026-10-29): the area, the boxes and the handles are measured once when it begins, and each frame moves the boxes and handles with `translate` and stretches every panel's last drawing with `scale`, from arithmetic over that measure, writing no layout and reading none. Every moved element wears `will-change: transform` for the drag only. A 150 ms rest commits the split and the panels redraw at their real size; a release commits it and hands the panels back one a frame, the one under the pointer first, so no one task redraws them all (`useStretchDrag`). The drag reads `pointerrawupdate` where the browser sends it. The splits are session state. The + and the × are squares as tall as the picker beside them (22px at a desk, 32px on touch, 28px beside a phone's title).
- **A phone draws two.** It stacks the first two slots and greys its +. The slots past them stay in state and in the link, so a link with four opens on a desk with four.
- **The + and the ×.** At a desk each slot is a `MenuSelect` at `CHART_METRIC_W`, named `Chart metric` for the first and `Metric 2` to `Metric 4` after it, each but the first with an × after it and the last with a +, which adds the first metric of `CHART_METRICS` not drawn and greys at four. On a phone each panel's `CHART_TITLE` box carries the × after it, and the first the +. The × is a segment of its picker: one field outline holds the picker on the left and a 22px × (28px on a phone) behind an `edge` divider on the right (`CHART_PICKER`, TJ 2026-10-29, option A). A bare × beside the picker shipped first and was replaced on review on 2026-10-29. There is no empty slot. The row has one 8px gap between every control, the + included (TJ, 2026-10-30): the + had stood 4px after the last picker while the pickers stood 16px apart.
- **One card.** A hover shows one card, on the hovered panel, built like the marker popup (TJ 2026-10-29, mockup 1 of four): a header band in the popup's own `band` token carries the hour as its title, a body holds the rows, and a footer ruled off below holds `+N more` when rows are cut. The phone's readout wears the same chrome. With more than one panel the body opens on heads naming each column with its unit, one `frame` rule across every column under them, and bare numbers below; a missing value is an empty cell. Its width and its rows are budgeted on the whole chart area rather than the hovered panel, it is as wide as its content rather than shrunk to the hovered panel's box (Recharts positions it inside that panel, where a shrink-to-fit width squeezed the name column to `Moun…` in a 2×2 grid), it may cross into a neighbouring panel, and it stays inside the area: flipped to the cursor's left at the right edge and pulled up at the bottom (`cardPlacement`). One panel's card has no header, because its picker names the unit. The nearest line is read through the hovered panel's domain and dims in every panel.
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

A split drag, 30 moves each timed to the next frame, three runs, on 2026-10-29. Before is the gutters commit, then the stretch with a redraw every 100 ms, then the stretch with redraws only at a 150 ms rest and on release, with `will-change: transform` on each stage for the drag.

| | two panels | four panels |
|---|---|---|
| Before: a move to the next frame, median / p90 | 611 / 814 ms | 686 / 1,493 ms |
| Redraw every 100 ms | 22 / 369 ms | 48 / 694 ms |
| Redraw at rest, no `will-change` | 17 / 23 ms | 38 / 71 ms |
| Redraw at rest, `will-change` | 16 / 23 ms | 22 / 31 ms |
| Script over the 30 moves, last row | 0.61 to 0.64 s | 0.69 to 0.80 s |
| Release to settled, last row | 622 to 689 ms | 698 to 827 ms |

`will-change` halves a four-panel frame, so it stays. The release pays the one redraw a drag still makes. A redraw of one panel at 200 lines over 15 days profiled at about 160 ms, about half of it Recharts' own `Line` building a label entry and a point for every hour of every line, labels or not; the axis's tick formatter built a new `Intl.DateTimeFormat` per candidate tick (17 ms a redraw) and now keeps one. Path building is about 6 ms, the grid 7 ms, and the commit 5 ms; no dots mount at this count and the tooltip does no work on a resize.

On the canvas renderer (record 0244), the same probe with a long-task observer, three runs, 2026-10-30. The Playwright image composites in software at 60 Hz, so a frame cannot read under 16 ms there; the main-thread time per move is the figure that carries to a Mac. It is the page's task time over the run divided by the 30 moves, so it also carries the release.

| | two panels, stretch | two panels, compositor | four panels, stretch | four panels, compositor |
|---|---|---|---|---|
| A move to the next frame, median / p90 | 21 / 54 ms | 16 / 17 ms | 27 / 46 ms | 16 / 20 ms |
| Main thread per move | 24 to 29 ms | 4.7 to 9.6 ms | 32 to 35 ms | 4.8 to 12.4 ms |
| Long tasks during the drag | 1 to 2, the longest 54 to 120 ms | none | 1 to 2, the longest 82 to 132 ms | none |
| Longest task after release | 55 to 125 ms | none over 50 ms | 84 to 128 ms | none over 50 ms |

## Alternatives rejected

- **Two y axes on one plot.** Two scales over one set of lines reads as one scale, and a hover could not say which axis the cursor stands against.
- **An empty second slot reading None.** It was the first build (2026-10-28) and stood as a control with nothing in it; a + says what it does.
- **One knob where the gutters cross.** Shipped first, and replaced on review on 2026-10-29: a 14px knob was hard to find and could not move one split alone.
- **The heads on the band.** Variants with the column heads on the header band under the hour, and with the more line kept in the body, were shown and declined on 2026-10-29.
- **More than four.** Each panel at a laptop's chart height would be shorter than its own axis labels can stand in.
