# 0136. The map legend is one card that folds to its Legends header, open by default wherever the map has room for it

- Status: Accepted. Amends 0048 (the one box becomes a card with a Legends header, and gains a folded state).
- Date: 2026-10-13
- Decider: the maintainer (TJ): the fold at both breakpoints approved from the visual audit (#687, its M04 and M07), the word `Legends` settled on #696's round-two mockups, and, on the pull request's first look (2026-10-13), one card rather than a strip over a box, with a header that looks exactly like the Layers button in every state. The default, on the same pull request (2026-10-13): unfurled by default on every device, unless there is not enough vertical room, in which case folded by default.
- Issues and PRs: #696, #687, #454, #459
- Cited in code as: #696
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/forecastGrid.ts` bullet, from "The map's legend is ONE box"; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the map chrome bullet; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useLegendFold.ts` bullet; [`docs/USAGE.md`](../USAGE.md), The map's legend

## Context

The legend box stood on the map whenever anything on it was coloured. On a phone that was as soon as a report landed: a box across the map's left column, 58px with one metric and growing with every layer, over the part of the map a reader draws a ring in. Nothing could put it away.

## Decision

- **The legend is one card** (`MAP_CARD`): a **Legends** header row, and while it is open every section under the header on the same surface, with one edge and one radius, the way a popover's body sits under its own header. Folded, the card is the header row alone. The same at every width.
- **The header looks exactly like the Layers button** (`MAP_CARD_HEADER`): the same floating surface at `MAP_COL_W`, the same type size, weight, colour, height, icon slot and padding. The row spans the card's border, so a folded card is the button's height to the pixel. It wears **the button's states too**: the accent label on hover, with the card's edge lit while its header is hovered (the edge is the card's), the pressed fill and the focus ring. The chevron in the icon slot is the only thing that says open or folded (right while folded, down while open). The header carries `aria-expanded`, and `aria-controls` only while the sections are there to name.
- **The box is still one box** ([0048](0048-legend-one-box.md)), unchanged inside; its sections now sit in the card under the header.
- **The card is there only when there is something to key.**
- **It is open by default on every device, unless the viewport is too short for it** (`legendDefaultOpen` in `resultsSheet.ts`). Enough room means that when the results first open after an analysis (the table alone on a phone, Both at a desk, each at the default panel heights and the layout's resting floors), the band of map between the open card and the forecast player's band above the results still holds **one marker and its one-line name, 45px** (`MARKER_BAND_PX`: the dot's radius and stroke, 12, and under its centre the label's 1.6em offset at 11px, one 11px line and its halo, 17.6 + 13.2 + 1.5). One marker because that is the least that lets a result under the card still be seen as a result rather than a dot cut by the card's edge or a name with no dot. The player's band is counted whether or not the player is on, as the sheet's own resting reserve counts it, so switching an overlay never changes the default. The card counted is the header and the metric key every analysis draws (`LEGEND_KEY_BODY_PX`, 48), not the tallest legend: a taller one scrolls in its column above the results rather than covering them.
- **A reader's press wins**, and is remembered in this browser beside the other view preferences (`legendOpen` in `viewPrefs.ts`, through `useLegendFold`), never in a link. The default is recomputed from the live viewport height while nothing is recorded, so a rotation or a resized window can open or fold it; a recorded press never moves.
- **On a phone the card stands in the row Controls gave up** under the search field's row ([0135](0135-phone-opens-on-the-map-with-search-and-analyze.md)), left-aligned at the legend's width. The resting and drag floors count the header at its open height, so a drag can never scroll the one control that opens the card out of reach, and a fold never resizes the sheet.

## Evidence

- The default, measured 2026-10-13 in the Playwright image's Chromium after analysing Mount Rainier with nothing pressed, phones on a coarse pointer. Map above the results as they open, then the band under the open card above the player's band, with the metric key alone (a 92px card on a phone, 84 at a desk) and with the tallest legend the app draws (every overlay, the forecast grid and the player on: a 256px card on a phone, 248 at a desk):

  | Viewport | Map above the results | Band, metric key | Band, tallest legend | Default |
  |---|---|---|---|---|
  | 390x844 | 496 | 172 | 8 | open |
  | 360x800 | 462 | 138 | -26 | open |
  | 430x932 | 584 | 260 | 96 | open |
  | 1440x900 | 439 | 139 | -25 | open |

  `resultsSheet.test.ts` holds the arithmetic at the same four (168, 134, 256 and 134: the code counts the 4px of slack under the header, and the desk's map measures 1px taller than its sum). The default folds below 621px tall on a phone, where the table sits at its floor, and below 641px at a desk: a phone turned on its side, or a short window.
- A tallest legend leaves less than one marker at two of the four, and less than nothing at two: that legend scrolls in its column, whose floor is the player's band above the results, so it never covers them. It is also where `LEGEND_STACK_PX` (182, measured 2026-09-17) now falls short of the stack, by the closure sections that joined after it; that number is the sheet's resting reserve and is not this change's.
- Measured 2026-10-13 against the built image, at rest (nothing hovered or focused): at 1440x900 the folded card is 36px tall at y 92 to 128 and 184px wide, the Layers button above it 36px at y 52 to 88 and 184px wide, both white 12px semibold on the same surface, edge and 8px radius. At 390x844 on a coarse pointer the folded card is 44px at y 108 to 152; open with one AQI key it runs 108 to 200, where the separate box under the old three-row column ran 156 to 214.
- The shot that first showed the header in the accent was taken with the pointer still resting on it after the click that folded it: that was `BUTTON_FLOATING`'s hover, which Layers shows too, so the frames are shot with the pointer away. A hover-less header was built and reversed the same day: the ask was that Legends look like Layers in every state.
- The phone's resting reserve is unchanged: the column ends at 108, and `LEGEND_TOP_PX` is still 156, the header's 44 and 4px of slack that was the gap between the strip and the box before they became one card.
- A desk's docked floor grows by the header's 40px with the same slack (`LEGEND_STRIP_FINE_PX`). At 1440x1000 in Both mode the two panels still open at their default 220px with the whole stack above the transport's band (`resultsSheet.test.ts`); a shorter window clamps them sooner.

## Alternatives rejected

- **A collapsed legend only on a phone:** the audit approved the fold at both widths, and one control that exists at one width and not the other is a control a reader has to relearn.
- **A strip over a separate box**, the first build: two surfaces read as two objects, and the maintainer asked for one card with the strip as its header.
- **A header with no hover colour:** built first on the pull request, and reversed the same day (the maintainer): a header that answers the pointer differently from Layers is a control a few pixels off the one above it.
- **The header as a capsule, as the round-two mockups drew it:** the column's other boxes are not capsules.
- **A fold stored in the link:** a fold is one browser's habit, like the column order, and a link is the session someone shares.

## Consequences

`MapLegend` is one card (`MAP_CARD`, `MAP_CARD_HEADER`, `MAP_CARD_BODY`) and takes `expanded` and `onToggle`, and `columnFull` in place of `sidebarOpen`, since a phone's column is the short one whatever the drawer does. `IconChevron` gains a right-pointing form. `resultsSheet.ts` gains `LEGEND_TOP_PHONE_PX`, `LEGEND_STRIP_PX` and `LEGEND_STRIP_FINE_PX`, and `LEGEND_TOP_PX` is derived from them. The privacy page's account of what this browser keeps says "how you laid out the results", which does not name the fold; its wording waits on the maintainer. `resultsSheet.ts` gains `LEGEND_KEY_BODY_PX`, `MARKER_BAND_PX`, `openingMapPx`, `bandUnderLegendPx` and `legendDefaultOpen`, and `useResultsLayout` exports `DEFAULT_PANEL_HEIGHT` and `useViewportHeight` for `useLegendFold`. `frontend/e2e/legendClickThrough.spec.ts` finds the legend open at both its sizes, reads the card as the stack's one child, and opens the folded legend in its 300px-tall window before it scrolls it.
