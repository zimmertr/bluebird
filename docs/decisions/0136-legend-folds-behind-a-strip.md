# 0136. The map legend is one card that folds to its Legends header, open on a desktop and folded on a phone

- Status: Accepted. Amends 0048 (the one box becomes a card with a Legends header, and gains a folded state).
- Date: 2026-10-13
- Decider: the maintainer (TJ): the fold at both breakpoints approved from the visual audit (#687, its M04 and M07), the word `Legends` settled on #696's round-two mockups, and, on the pull request's first look (2026-10-13), one card rather than a strip over a box, with a header that looks exactly like the Layers button in every state but focus. The device default below was built as proposed and is the maintainer's to confirm on the pull request.
- Issues and PRs: #696, #687, #454, #459
- Cited in code as: #696
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/forecastGrid.ts` bullet, from "The map's legend is ONE box"; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the map chrome bullet; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useLegendFold.ts` bullet; [`docs/USAGE.md`](../USAGE.md), The map's legend

## Context

The legend box stood on the map whenever anything on it was coloured. On a phone that was as soon as a report landed: a box across the map's left column, 58px with one metric and growing with every layer, over the part of the map a reader draws a ring in. Nothing could put it away.

## Decision

- **The legend is one card** (`MAP_CARD`): a **Legends** header row, and while it is open every section under the header on the same surface, with one edge and one radius, the way a popover's body sits under its own header. Folded, the card is the header row alone. The same at every width.
- **The header looks exactly like the Layers button** (`MAP_CARD_HEADER`): the same floating surface at `MAP_COL_W`, the same type size, weight, colour, height, icon slot and padding. The row spans the card's border, so a folded card is the button's height to the pixel. It has **no hover or pressed colour**: the chevron in the icon slot is the only thing that says open or folded (right while folded, down while open), and the focus ring is the only state it shows. The header carries `aria-expanded`, and `aria-controls` only while the sections are there to name.
- **The box is still one box** ([0048](0048-legend-one-box.md)), unchanged inside; its sections now sit in the card under the header.
- **The card is there only when there is something to key.**
- **It is open on a desktop and folded on a phone until the reader presses the header**, and the press is remembered in this browser beside the other view preferences (`legendOpen` in `viewPrefs.ts`, through `useLegendFold`), never in a link.
- **On a phone the card stands in the row Controls gave up** under the search field's row ([0135](0135-phone-opens-on-the-map-with-search-and-analyze.md)), left-aligned at the legend's width. The resting and drag floors count the header at its open height, so a drag can never scroll the one control that opens the card out of reach, and a fold never resizes the sheet.

## Evidence

- Measured 2026-10-13 against the built image, at rest (nothing hovered or focused): at 1440x900 the folded card is 36px tall at y 92 to 128 and 184px wide, the Layers button above it 36px at y 52 to 88 and 184px wide, both white 12px semibold on the same surface, edge and 8px radius. At 390x844 on a coarse pointer the folded card is 44px at y 108 to 152; open with one AQI key it runs 108 to 200, where the separate box under the old three-row column ran 156 to 214.
- The shot that first showed the header in the accent was taken with the pointer still resting on it after the click that folded it: that was `BUTTON_FLOATING`'s hover, which the header no longer wears.
- The phone's resting reserve is unchanged: the column ends at 108, and `LEGEND_TOP_PX` is still 156, the header's 44 and 4px of slack that was the gap between the strip and the box before they became one card.
- A desk's docked floor grows by the header's 40px with the same slack (`LEGEND_STRIP_FINE_PX`). At 1440x1000 in Both mode the two panels still open at their default 220px with the whole stack above the transport's band (`resultsSheet.test.ts`); a shorter window clamps them sooner.

## Alternatives rejected

- **A collapsed legend only on a phone:** the audit approved the fold at both widths, and one control that exists at one width and not the other is a control a reader has to relearn.
- **A strip over a separate box**, the first build: two surfaces read as two objects, and the maintainer asked for one card with the strip as its header.
- **The header in `MAP_BUTTON` with its hover colours:** the accent label and edge on hover read as a state the legend was in, where the chevron already says it.
- **The header as a capsule, as the round-two mockups drew it:** the column's other boxes are not capsules.
- **A fold stored in the link:** a fold is one browser's habit, like the column order, and a link is the session someone shares.

## Consequences

`MapLegend` is one card (`MAP_CARD`, `MAP_CARD_HEADER`, `MAP_CARD_BODY`) and takes `expanded` and `onToggle`, and `columnFull` in place of `sidebarOpen`, since a phone's column is the short one whatever the drawer does. `IconChevron` gains a right-pointing form. `resultsSheet.ts` gains `LEGEND_TOP_PHONE_PX`, `LEGEND_STRIP_PX` and `LEGEND_STRIP_FINE_PX`, and `LEGEND_TOP_PX` is derived from them. The privacy page's account of what this browser keeps says "how you laid out the results", which does not name the fold; its wording waits on the maintainer. `frontend/e2e/legendClickThrough.spec.ts` opens a phone's folded legend before it probes the band under the card, and reads the card as the stack's one child.
