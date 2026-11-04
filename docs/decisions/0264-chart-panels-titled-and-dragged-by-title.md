# 0264. Every desk chart panel names its metric, and its name drags it to another slot

- Status: Accepted; amends 0255
- Date: 2026-11-03
- Decider: the maintainer (TJ), who chose the title's look in the mockup lab (https://claude.ai/artifact/1JPe2g42HpHUTLJj4v9RYg) on 2026-11-03 and added the drag the same day, with its two rules: move rather than swap, and the first panel stays
- Issues and PRs: #846
- Cited in code as: #846
- Guide: `components/` guide: `TimeSeriesChart.tsx`; `hooks/` guide: `usePanelDrag.ts`; `utils/chart/` guide: `panelTitle.ts`; `STYLES.md`; `USAGE.md`

## Context

At a desk the chart's pickers stand in one row above the panels, and the panels below stand in a grid or in rows (record [0255](0255-chart-metrics-as-panels.md)). No panel said which metric it drew. A reader matched picker to panel by position, which meant knowing that the row's order is the panels' reading order; in the default 1 over 3 layout no picker stands over its panel. The maintainer raised it from a screenshot on 2026-10-31. A phone does not have the problem: each picker already stands over its own panel.

## Decision

- **A title on every drawn panel at a desk, when two or more are drawn.** One panel shows none, since its picker stands right over it, and a phone shows none, since its picker is the panel's heading. A panel held under its floor is not drawn and wears no title.
- **The words are the picker's option label**, unit included (`Wind (mph)`). No new string.
- **A quiet chip** (`CHART_PANEL_TITLE.chip`): the popup's `band` fill, the label ink `ink-soft` that the axes wear, the micro step's 11px, `RADIUS.control`, 15px tall. It stands 4px in from the plot band's top left, absolutely placed, so the plot keeps its size and `PLOT_MARGIN`, which a hover, a pin and a finger invert through, does not move. It sits in the panel's box beside the plot and outside the stage, so a split drag's translate carries it and its scale never stretches it. Hidden from assistive technology: the pickers already name each panel and the grip is the keyboard route. No tooltip.
- **A chrome label moves; the title never does.** In a titled panel the Now and model-end labels move 16px down, under the chip and 2px of air, and the extreme line's label hangs below its line, as far down as clears the chip, wherever it would reach the chip's rows (`extremeLabelPlacement`). An untitled panel keeps its labels to the pixel.
- **Every title but the first drags its panel** (`usePanelDrag`). Past `DRAG_THRESHOLD_PX` a ghost of the panel lifts under the pointer: the box cloned with its canvases copied in, on the hover card's surface, at half size, the pressed point kept under the pointer. On release over another slot the panel moves there through the chart's `onMove`, which is `moveMetric`: the panels between shift one place and the picker row follows. A click that never travels that far does nothing.
- **A handle lights under the pointer.** Every title but the first takes the accent ink on hover (`ACCENT.hoverText`, record [0251](0251-controls-light-their-label-on-hover.md)), as every control's label does, so the grab cursor is not the only cue that a title moves its panel. The first title, a label only, keeps the label ink. The maintainer asked for it on 2026-11-03, reviewing #847.
- **Move, not swap**, as the grip moves a panel. Move with reflow is what iOS, Trello, Grafana and dnd-kit's default do; a swap is the convention for fixed equal cells, and was declined.
- **The first panel stays.** Its title is a label only and no drop lands on it, because the first slot is the ranking's (record 0255).
- **The target is the panel under the pointer**, from the boxes measured once when the drag lifts, each grown by half the 8px gutter so a pointer in a gutter counts for its neighbour. The first slot, a held panel, the start slot and no panel at all are no target, and a release there changes nothing; so does a cancel or Escape, which lets the drag go without closing a pinned card.
- **One accent bar marks the landing**, the picker row's 2px bar: on the target's trailing edge when the panel moves later, "after this one", and its leading edge when it moves earlier. That edge is the box's side when a panel stands beside it in its row, and otherwise its top or its foot, at the gutter's middle, or just inside the box at the area's own edge, where nothing can clip it.
- **No move renders.** Each `pointermove` (and `pointerrawupdate` where it is sent) writes the ghost's transform once a frame from a ref and hit-tests the frozen boxes; the bar is written only when the target changes.
- **The desk panels are keyed by metric**, so a move reorders the panels that moved rather than handing every slot a new metric to draw from nothing.

## Evidence

Contrast of the title, `ink-soft` on `band`, measured in `styles.test.ts` on 2026-11-03: 4.71:1 dark, 7.89:1 light, over the 4.5:1 text owes. The handle's hover ink, `accent-ink` on the same `band`, measured there the same day: 5.69:1 dark, 5.43:1 light.

Placement, from `panelTitle.ts` on 2026-11-03. The plot band's corner is `PLOT_MARGIN.left` plus the 44px y axis in, and `PLOT_MARGIN.top` down: the chip stands at (56, 12) in its box and spans 12 to 27px down. At the narrowest panel `panelWidthFloorPx` draws, a 156px band, the longest title and the extreme label at the band's right end share columns, so the extreme label is moved on height alone. At the shortest, a 40px band (`panelFloorPx`), a label moved under the chip ends 32px under the band's top, inside it.

The drag, measured on 2026-11-03 by `frontend/e2e/perf/panelDrag.spec.ts` in the pinned Playwright image's Chromium (1.64.1) against the built image, Open-Meteo answered from the suite's fixtures: a 1440 by 900 window, the dark theme, Chart alone, its area 1,080 by 220px, four panels in 1 over 3 (precipitation, temperature, wind, freezing level), 200 lines over 15 days (360 hourly stamps). Each run drags the last slot's title to over the second in 30 moves, one a frame, and releases; three runs. Before is the same build with the panels keyed by slot.

| | Keyed by metric | Keyed by slot |
|---|---|---|
| Main thread per move | 2.5 / 2.8 / 3.2 ms | 2.8 / 3.2 / 3.3 ms |
| The `pointermove` handler, median | 0.1 ms | 0.1 to 0.2 ms |
| Box measures during the moves | 0 | 0 |
| Layout passes during the moves | 2 | 2 |
| React commits during the moves | 0 / 1 / 2 | 1 / 1 / 2 |
| Release to the new order on screen | 65 / 72 / 73 ms | 101 / 104 / 144 ms |
| Main thread over the release | 55 / 67 / 73 ms | 101 / 104 / 144 ms |
| Longest task in the release | 9.9 to 13.5 ms, none over 16 | 11.2 to 15.0 ms, none over 16 |

The commits are not the drag's: its handlers set no state, and the page commits at the same rate with nothing moving (0 or 1 over 30 idle frames, with no DOM change in a 3 s idle window). The two layout passes are the landing bar's two writes, over the third slot and then the second; no move reads layout. A move's main-thread time is mostly the compositor's layerizing for the moved ghost. The release time runs to the first frame painted after the titles stand in their new order; keying by metric cut it by about a third (a median of 72 ms against 104), since the three panels that moved keep their data, domains and drawings.

## Alternatives rejected

- **The name above the plot, in the panel's top margin.** It covers no data, but every panel grows a title band of about 18px, and it moves `PLOT_MARGIN.top`, which `plotBand`, `fingerReading` and `panelFloorPx` read.
- **Each picker on its own panel, as on a phone.** The row is how a reader orders the panels and holds the + and the Panel layout button, and record 0255 put the pickers in a row on 2026-10-30.
- **Numbering the pickers and the panels.** Still a lookup, by number instead of position.
- **The title in the panel's own fill.** Declined in the lab for the `band` fill, which sets the chip off the plot.
- **No unit in the title.** Declined in the lab: the title is the picker's option label as it stands.
- **A swap on drop.** See above.
- **Handing the redrawn panels back one a frame after the release**, as the split drag does. The release measured no task over 16 ms, so there was nothing to spread.
- **The picker grip's drag, which renders its ghost on every move.** A whole-panel ghost moved by state would render the chart on every move; this one moves by a transform written from a ref.

## Consequences

- The chip covers the top left corner of each plot, where the first hours of the highest lines can run.
- `panelTitle.test.ts` holds the geometry, `styles.test.ts` the chip's ink and fill, and `TimeSeriesChart.test.tsx` the titles, the label moves and the drag.
- Three routes now call `onMove` with the same arguments: the grip, the pinned card's column head and the title.
