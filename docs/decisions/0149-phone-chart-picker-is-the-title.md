# 0149. On a phone the chart's metric picker is the plot's title, and the plot is inset under it

- Status: Superseded by [0243](0243-chart-metrics-as-panels.md) (a phone wears the desk's picker row, and its card stays inside the chart). Amends 0144 (a finger reads the band under the title). Amended by 0201 (at a desk the chart's metric is the one menu rather than a native select).
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696, 2026-10-14: option A of the picker mockups (`picker.html`, seven options), with one requirement, that the title meet neither dashed line nor its label; then look 4 of six drawn for the title itself (`picker2.html`), the app's own select at the label's width, the same night
- Issues and PRs: #696, #708, #348, #705, #336
- Cited in code as: #696
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `TimeSeriesChart.tsx`, `ResultsPanels.tsx`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `chartPointer.ts`; [`docs/STYLES.md`](../STYLES.md), Phone chrome; [`docs/USAGE.md`](../USAGE.md), the chart

## Context

The chart's metric select (#348) stood in a full-width row above the plot, 52px of a phone's chart that is often under 100px tall at rest. A fourth glyph in the results bar would have fit at 360 only until `Removed` made a fifth (PR #708, review item 12), so the maintainer had seven placements drawn.

## Decision

- **On a phone the metric's name is the plot's title**, at its top left (`CHART_TITLE`): the full label with its unit, as the select's options read it, in the app's own select, the desktop picker's look shrunk to its words: the recessed fill, the slate edge and the control radius every select here wears (`FIELD_LOOK`, which `FIELD` composes too), `SELECT`'s `pr-6` holding the chevron where every select's stands, at the control type, 28px tall. The native select is laid over it, transparent, so a tap opens the phone's own picker, and its focus edge is `FIELD`'s, on the box. Its accessible name stays `Chart metric`; there are no new words. The first cut was a plain title in the chart's slate-400 with a trailing chevron, Material's text button; on the maintainer's phone it read as a label rather than a control, and of six looks drawn for it (an outlined chip, a tonal chip, accent text, this select, a dashed underline, an accent chip) he took the one every other picker in the app already teaches.
- **The title's room is reserved, not floated.** The plot's top margin grows by the title's box (`CHART_TITLE_PX`, 28px; `TITLED_PLOT_MARGIN`), so the plotted area, the dashed Now and model-end lines, the extreme line (#705) and every label they carry, and the y axis's top tick all begin under the title. A finger and a click invert the same inset band (`plotBand`, `fingerReading`).
- **The row above the plot goes on a phone**, and stands only while a comparison has a note to show, without the select.
- **A desk keeps the select in its row**, where #348 put it.
- **A 44px target on a coarse pointer**: the select reaches 16px past the title's box onto the plot's top, under the title's width alone.

## Evidence

Measured 2026-10-14 in the Playwright image's Chromium on a coarse pointer, with a ring analysis in Chart view at rest: the field row was 52px at 360 and 390 (the 44px select and 4px either side); with the title the plotting band grew from 15 to 47px at 360 and from 65 to 97px at 390, 32px at both. That was the first cut's 20px title. With the select's look at 28px, measured the same way, the band grew 24px at both widths, 52 less 28 (from 15 to 39px at 360 and from 65 to 89px at 390; MEASURED in `styles.test.ts`), and starts 8px under the box. In the same 390 frame, the box's bottom at 652, the Now label's top stood at 663.8 and the extreme label's at 668.0. In the 390 frame with Temperature charted, its largest value's line at the plot's top, the Now seam near the left edge and the forecast player's playhead at the first hour, the Now label's top stood at 655.8 and the extreme label's at 660.4, both under the title's bottom at 644.

2026-10-14, later: the maintainer reviewed the plain field row against this look again on the Pixel and kept the small picker, and asked for even room around it, since the box sat on the grip's rule and 8px from the sheet's edge. It stands 12px (`CHART_TITLE_INSET_PX`) from the rule above it, over the y axis's top label below it, and from the sheet's edge, the results bar's own inset (`px-3`), so its left edge lines up with "Lowest" and the view buttons. The plot's top margin is the two insets, the box and the 5px the top label rises above the band (`TOP_LABEL_RISE_PX`, 5.1 measured); the plain chart's `PLOT_MARGIN.top` is that plus 3px of air, which the titled plot spends on the inset rather than adding a third number. Measured in the Playwright image's Chromium at 360, 390 and 430: 12px from the grip's rule to the box, 11.9px from the box to the top label, 12px from the sheet's edge, where the results bar's words and the view buttons start (12 and 13px). The y labels' height is the face's, so a Mac's may move the second gap by a fraction. Its 44px target is centred on the box, 8px into the room either side.

## Alternatives rejected

- **A fourth glyph in the results bar** (review item 12): wraps the bar at 360 and 390 once `Removed` shows.
- **A chip row, an overflow menu, the metric's name in the bar, no picker, or the axis label as the picker** (options B, D, E, F, G of the mockups): a row's cost, a hidden picker and a new string, the same wrap, a lost comparison, or an 11px target.
- **A title floating over the plot without a reserved inset:** the dashed lines' labels and the top tick would run under its letters.

## Consequences

`ResultsSheet` hands `ResultsPanels` `chartTitled` off `isDesktop`, and the chart takes it as `titled`, a primitive so the memo still compares it. The title sits outside the plot's box, so a press on it is the select's and never a finger reading the plot.
