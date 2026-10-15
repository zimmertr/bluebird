# 0149. On a phone the chart's metric picker is the plot's title, and the plot is inset under it

- Status: Accepted. Amends 0144 (a finger reads the band under the title).
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696, 2026-10-14: option A of the picker mockups (`picker.html`, seven options), with one requirement, that the title meet neither dashed line nor its label
- Issues and PRs: #696, #708, #348, #705, #336
- Cited in code as: #696
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `TimeSeriesChart.tsx`, `ResultsPanels.tsx`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `chartPointer.ts`; [`docs/STYLES.md`](../STYLES.md), Phone chrome; [`docs/USAGE.md`](../USAGE.md), the chart

## Context

The chart's metric select (#348) stood in a full-width row above the plot, 52px of a phone's chart that is often under 100px tall at rest. A fourth glyph in the results bar would have fit at 360 only until `Removed` made a fifth (PR #708, review item 12), so the maintainer had seven placements drawn.

## Decision

- **On a phone the metric's name is the plot's title**, at its top left (`CHART_TITLE`): the full label with its unit, as the select's options read it, and a trailing chevron, Material's text button with a trailing icon, in the chart's own ink (slate-400, `CHART_AXIS_COLOR`) at the control type. The native select is laid over it, transparent, so a tap opens the phone's own picker. Its accessible name stays `Chart metric`; there are no new words.
- **The title's room is reserved, not floated.** The plot's top margin grows by the title's line (`CHART_TITLE_PX`, 20px; `TITLED_PLOT_MARGIN`), so the plotted area, the dashed Now and model-end lines, the extreme line (#705) and every label they carry, and the y axis's top tick all begin under the title. A finger and a click invert the same inset band (`plotBand`, `fingerReading`).
- **The row above the plot goes on a phone**, and stands only while a comparison has a note to show, without the select.
- **A desk keeps the select in its row**, where #348 put it.
- **A 44px target on a coarse pointer**: the select reaches 16px past the title's line onto the plot's top, under the title's width alone.

## Evidence

Measured 2026-10-14 in the Playwright image's Chromium on a coarse pointer, with a ring analysis in Chart view at rest: the field row was 52px at 360 and 390 (the 44px select and 4px either side); with the title the plotting band grew from 15 to 47px at 360 and from 65 to 97px at 390, 32px at both. The title is 20px tall; the band starts 8px under it. In the 390 frame with Temperature charted, its largest value's line at the plot's top, the Now seam near the left edge and the forecast player's playhead at the first hour, the Now label's top stood at 655.8 and the extreme label's at 660.4, both under the title's bottom at 644.

## Alternatives rejected

- **A fourth glyph in the results bar** (review item 12): wraps the bar at 360 and 390 once `Removed` shows.
- **A chip row, an overflow menu, the metric's name in the bar, no picker, or the axis label as the picker** (options B, D, E, F, G of the mockups): a row's cost, a hidden picker and a new string, the same wrap, a lost comparison, or an 11px target.
- **A title floating over the plot without a reserved inset:** the dashed lines' labels and the top tick would run under its letters.

## Consequences

`ResultsSheet` hands `ResultsPanels` `chartTitled` off `isDesktop`, and the chart takes it as `titled`, a primitive so the memo still compares it. The title sits outside the plot's box, so a press on it is the select's and never a finger reading the plot.
