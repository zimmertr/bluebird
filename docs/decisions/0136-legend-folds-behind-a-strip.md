# 0136. The map legend folds behind a Legends strip, open on a desktop and folded on a phone

- Status: Accepted. Amends 0048 (the one box gains a folded state, and the stack opens with the strip that folds it).
- Date: 2026-10-13
- Decider: the maintainer (TJ): the fold at both breakpoints approved from the visual audit (#687, its M04 and M07), the word `Legends` settled on #696's round-two mockups, and the strip in the Layers button's role. The device default below was built as proposed and is the maintainer's to confirm on the pull request.
- Issues and PRs: #696, #687, #454, #459
- Cited in code as: #696
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/forecastGrid.ts` bullet, from "The map's legend is ONE box"; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the map chrome bullet; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useLegendFold.ts` bullet; [`docs/USAGE.md`](../USAGE.md), The map's legend

## Context

The legend box stood on the map whenever anything on it was coloured. On a phone that was as soon as a report landed: a box across the map's left column, 58px with one metric and growing with every layer, over the part of the map a reader draws a ring in. Nothing could put it away.

## Decision

- **A Legends strip heads the legend stack**, in the Layers button's exact role (`MAP_BUTTON`: `BUTTON_FLOATING` at `MAP_COL_W` by `MAP_ROW_H`, the same type size and weight), with the app's chevron in the icon slot: pointing right while the box is folded, down while it is open. A press folds or opens the box. The strip carries `aria-expanded`, and `aria-controls` only while the box is there to name.
- **The box is still one box** ([0048](0048-legend-one-box.md)), unchanged inside; it hangs one `MAP_COL_GAP` under the strip while open and is gone while folded.
- **The strip is there only when the box would be:** nothing on the map to key, no strip.
- **It is open on a desktop and folded on a phone until the reader presses it**, and the press is remembered in this browser beside the other view preferences (`legendOpen` in `viewPrefs.ts`, through `useLegendFold`), never in a link.
- **On a phone the strip stands in the row Controls gave up** under the search field's row ([0135](0135-phone-opens-on-the-map-with-search-and-analyze.md)), left-aligned at the legend's width. The resting and drag floors count it at its open height, so a drag can never scroll the one control that opens the box out of reach, and a fold never resizes the sheet.

## Evidence

- Measured 2026-10-13 at 390x844 on a coarse pointer against the built image: folded, the strip is 44px tall at y 108 to 152, where the box with one AQI key ran from 156 to 214 under the old three-row column; open, the box hangs from 156.
- The phone's resting reserve is unchanged: the column ends at 108, the strip and its gap take 48, and the box starts at 156, the number the three-row column made (`LEGEND_TOP_PX`).
- A desk's docked floor grows by the strip's 40px (`LEGEND_STRIP_FINE_PX`). At 1440x1000 in Both mode the two panels still open at their default 220px with the whole stack above the transport's band (`resultsSheet.test.ts`); a shorter window clamps them sooner.

## Alternatives rejected

- **A collapsed legend only on a phone:** the audit approved the fold at both widths, and one control that exists at one width and not the other is a control a reader has to relearn.
- **The strip as a capsule, as the round-two mockups drew it:** the brief made it the Layers button's role, and the column's other boxes are not capsules.
- **A fold stored in the link:** a fold is one browser's habit, like the column order, and a link is the session someone shares.

## Consequences

`MapLegend` takes `expanded` and `onToggle`, and `columnFull` in place of `sidebarOpen`, since a phone's column is the short one whatever the drawer does. `IconChevron` gains a right-pointing form. `resultsSheet.ts` gains `LEGEND_TOP_PHONE_PX`, `LEGEND_STRIP_PX` and `LEGEND_STRIP_FINE_PX`, and `LEGEND_TOP_PX` is derived from them. The privacy page's account of what this browser keeps says "how you laid out the results", which does not name the fold; its wording waits on the maintainer. `frontend/e2e/legendClickThrough.spec.ts` opens a phone's folded legend before it probes the band under the box, and reads the box as the stack's last child.
