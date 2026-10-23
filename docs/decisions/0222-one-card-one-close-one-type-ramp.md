# 0222. Every surface draws one card, one close, one label weight, one metric order and one separator

- Status: Accepted. Amends 0123 (the popup's heads are 600, not bold), 0136 (a desk's Removed menu has no heading of its own) and 0162 (the scale's label is 11px).
- Date: 2026-10-22
- Decider: the maintainer (TJ), on PR #796, from a UI audit of every screen at 6f4d277. He took items 1 to 14 except 15 and 16, moved the chips to 12px (B), took C and D, and kept E to H as they were. He set the tagline's words, the chart's unit and the scale's width.
- Issues and PRs: #796
- Cited in code as: none; source comments cite the record by number
- Guide: [`docs/STYLES.md`](../STYLES.md); [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `popupChrome.ts`, `chartData.ts`, `tableColumns.ts` and `metrics.ts`; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), `controls.ts` and `mapPopups.ts`

## Context

The audit compared the computed styles of every panel, map, results, menu, dialog, tutorial and popup screen, at a desk and on a phone, in both themes. Each piece followed its own record, and the records had drifted apart: popups kept MapLibre's card, the app had five close buttons, the metrics came in three orders, and the same series was in inches on the chart and inches per hour in the table.

## Decision

- **One card.** A popup wears the app's floating card: 8px corners, the structural `edge` and `ELEVATION.overlay` (`POPUP_FACE`). Every floating card and chip takes `edge`, and none takes `frame`.
- **One close.** A × inside a card or a field is the bare glyph: the popup's, the tutorial's, the search's and a message's. A header's close is the round button. On a finger, the tutorial's × and the search's clear press 44px (`ICON_CLOSE_BUTTON`).
- **One label weight.** Every field label in the panel is `TEXT.control`, at 400. When was the one at 600.
- **Popups bold at 600**, the app's heading weight, where they were 700.
- **The welcome dialog's two buttons match.** Take the tutorial is Search now's 14px, 600 and 8px corners, in the secondary fill (`DIALOG_FOOT.secondary`).
- **One field height.** The model field is 22px, the column's height.
- **Numbers end on one edge.** The table right-aligns elevation, the wildfire distance and every metric, headers included (`TABLE.number`, `TABLE.headNumber`). Type is a word, so it is set in the sans.
- **Menus agree.** Layers rows stand 20px apart, the pitch of the Columns rows. At a desk the Removed menu drops its "Removed rows" heading, because its trigger already says Removed. The phone sheet keeps its heading.
- **One metric order**, the panel's alphabetical one, in the chart list, the table, the Columns menu and the CSV.
- **One unit for an hourly series.** The chart plots an hour at a time, so it says `in/hr` for precipitation and snowfall, as the table and the legend do under playback (`HOURLY_UNIT`). The chart's picker is 152px (`CHART_METRIC_W`) to hold it.
- **One separator**, the middle dot. The popups used a bar.
- **The scale bar's label is 11px**, the app's floor. The bar draws up to 110px (`SCALE_MAX_WIDTH_PX`) so its widest label still fits.
- **The chips are 12px** (`CONTROL_SIZE`), the size of the search pill above them. They were 13px.
- **Search result kinds are in sentence case** in the caption ink, where they were capitals. The table and the popups name the kinds the same way.
- **One tagline**: "The Weather Window Finder", in the panel and the welcome dialog.

## Evidence

Measured on the PR #796 preview, 2026-10-22, in the Playwright image's Chromium, unless noted:

- Popup before: 3px corners, no edge, `0 1px 2px` shadow. Every other floating card: 8px, a 1px edge, `ELEVATION.overlay`.
- `frame` on a floating card's fill: 1.93:1 dark and 2.51:1 light, under the 3:1 a boundary owes. `edge`: light `rgb(114,120,127)`, dark slate-500.
- A 1px border on the popup took 2px from the ranked card's 374px cap (`RESULT_POPUP_MAX_WIDTH_PX`), and its grid overflowed by 0.875px at a desk and 1.64px on a phone (`popupFit.spec.ts`). A ring outside the box takes no width, so the cap held.
- `Precipitation (in/hr)` is 109.03px in the maintainer's Chrome on macOS. At 144px the picker left it 0.97px.
- At 11px, `1000 km` on a 50px bar ran 1.2px past the end. The bar draws as narrow as half its maximum, so 110px gives it 55.
- Field heights: the model field 30px; the aggregate, chart metric, boxes and Max results 22px.

## Alternatives rejected

- **Keep `frame` on the quiet cards**: it is under 3:1 on their own fill.
- **A border on the popup**: it overflowed the grid at the cap the maintainer set.
- **Shut the Legend card while another chip menu is open** (item 15): not taken.
- **Blank or capitalised AQI boxes** (item 16): the maintainer keeps `aqi`.
- **Revisit the dark accent hover, the 10px legend ticks, the calls from #789 or the Chart drag floor** (E to H): kept as they are.

## Consequences

`styles.test.ts` holds the roles: `POPUP_FACE`, `ICON_CLOSE_BUTTON`, `DIALOG_FOOT`, `TABLE.number`, `CHART_METRIC_W` against the measured label, `MAP_CORNER.scale` and the chips' size. `tableColumns.test.ts` and `chartData.test.ts` hold the one order and the hourly unit. `popupFit.spec.ts`, `popup.spec.ts` and `scaleBar.spec.ts` check the built card, its weight and the scale's 11px. The scale is 10px wider, and on a phone the credit line wraps 10px earlier.
