# 0174. A desk's map carries the phone's rows: the search pill with locate, and chips with their menus under them

- Status: Accepted. Supersedes 0148. Amends 0019 (at a desk Layers is a chip in the row under the search pill too, and its menu wears the legend card's surface, which retires `LIFTED_EDGE`), 0048 (at a desk the legend is a card under the Legend chip, as tall as its sections), 0134 (a desk chip's menu stands 4px under its chip, unjoined), 0135 (the rows stand on the map at both widths, and the chip row reads Legend before Layers) and 0147 (no zoom pair at either width, and a desk's compass stands beside the locate button).
- Date: 2026-10-17
- Decider: the maintainer (TJ), on issue #714, 2026-10-17: direction A2 of three mockups (A, B and C, with Analyze placed three ways in each), the zoom pair dropped; and on 2026-10-18, after the first build, the compass beside the locate button, Legend before Layers, and of three more mockups the chip kept a whole pill with its menu set apart; then, of nineteen more, the menu 4px under its chip and a chevron on a desk's chips only; and one surface for the two cards
- Issues and PRs: #714, #696, #708, #733
- Cited in code as: #714
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `MapRows.tsx`, `MapLegend.tsx`, `LayersPopover.tsx`, `SearchBox.tsx` and `MapStage.tsx` bullets; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), `controls.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `resultsSheet.ts` bullet; [`docs/STYLES.md`](../STYLES.md), Map chrome and Opening a panel; [`docs/USAGE.md`](../USAGE.md), At a desk and The map's legend
- Related: 0028 (the one notice block under Analyze), 0136 (a phone's menus are sheets)

## Context

PR #708 and PR #733 gave the phone a map of its own: a search pill with the locate button at its right, and a row of chips under it. A desk kept the older column at the map's top left: a boxed search field, then Controls, Layers and Legend as 184px buttons, with the zoom pair and the compass in the library's top-right stack. One app looked like two.

## Decision

- **The desk's map wears the phone's two rows.** The pill, the locate button and the compass stand on the first, and Legend and Layers on the chip row under it. The rows stop 416px from the map's left edge, the pill's 320 plus two 40px buttons with 8px before each, so the rest of the map's top stays the map's.
- **The compass stands beside the locate button at a desk**, not under it as on a phone, because a desk's first row has the room (TJ, 2026-10-18).
- **Legend comes before Layers, at both widths.** The legend card is the one open by default, and first in the row it hangs over the map's left edge and covers less of the map (TJ, 2026-10-18).
- **The summary chip stands at the chip row's front only while the panel is shut**, since the docked panel has its own Close. It takes the keyboard when the panel closes under it.
- **Analyze stays in the panel**, with every notice under it as record 0028 says. A desk has no floating button, so closing the panel puts Analyze away. The maintainer accepted that.
- **Each chip's menu is a whole card 4px under its chip**, from the chip's left edge, 184px wide (`MAP_MENU_W`, `MAP_CHIP_MENU`). 4px is closer than the 8px between the pill and the chip row, so the card reads as its chip's menu. The chip stays a whole pill and is lit while its card is out, as a phone's is. The Layers menu stands over the legend card.
- **A desk's chips carry a chevron; a phone's do not.** `IconChevron` follows the Legend and Layers labels at a desk (`MAP_CHIP_CHEVRON`), down while the card is shut and up while it is open, because the card drops from the chip. A phone's chip opens a sheet that rises from below, so the arrow would point the wrong way there (TJ, 2026-10-18).
- **The two cards wear one surface** (`SURFACE_CHIP_CARD`): the chips' fill and the structural slate-500 edge rather than the quiet frame. They are twins, identical chips each opening a card of one width, so two looks asked the reader to find a difference that is not there (TJ, 2026-10-18). Only the shadow differs: the legend rests on the map with the chips (`raised`), and the Layers menu opens over it (`overlay`), where its outline and deeper shadow part the two.
- **The legend card is as tall as its sections**, open until the reader folds it as record 0148 had it, and scrolls inside the map's height under the rows (`legendMaxCss`, read off the map wrapper as `100cqh`).
- **No zoom buttons at either width.** Scroll, pinch and a double click zoom.

## Evidence

Mockups of all three directions and of Analyze placed three ways in each were published to TJ as a private artifact on 2026-10-17, and the choices above are TJ's answers to them.

Measured 2026-10-18 in the Playwright image's Chromium at 1440x900, panel shut: the pill 320 by 40 at the 12px inset, the locate button 40 round 8px right of it, the summary chip 160 by 32 at 60 down, Legend 87.4 wide and Layers 83 with their chevrons (69.4 and 65 without). The legend card and the Layers menu are 184 wide and start at 96, 4px under the chips' bottom edge, where the chip row starts 8px under the pill. The rows end 428px from the map's left edge, the compass's slot included. Two perf pairs at 946 destinations moved no interaction past the spread between passes, and the entry chunk shrank by 2,105 B raw and 402 B gzipped against main at f971335.

The cards' outline, measured 2026-10-18 on the v4 oklch steps where the Layers menu opens across the legend card: slate-500 on the slate-800 card reads 3.07:1, and the light theme's edge on its floating fill 4.24:1. The frame the cards wore before read 1.93:1 and 2.51:1, under the 3:1 a boundary owes. The segment and the coverage well inside the menu keep the recessed edge they wear on the panel: 3.07:1 out and 3.74:1 in, and 4.24:1 and 4.46:1 in light.

## Alternatives rejected

- **B, restyling the column in place:** two layouts for one app would remain.
- **C, a Material rail and app bar:** a rebuild of the panel for a map tool whose panel already works.
- **A1, a floating Analyze on the desk's map, and A3, an Analyze chip:** both pull Analyze away from the notices that explain it.
- **Menus joined to their chip**, record 0134's rule for every other menu: built first, it squared the pill's bottom corners into a dome (TJ, 2026-10-18). Of three mockups, a joined card under a dark chip and square-cornered chips that read as tabs lost to the whole lit pill with its card set apart.
- **An 8px gap under the chip**, the same as the one between the pill and the chip row: built, and the card read as a row of its own rather than as its chip's menu (TJ, 2026-10-18).
- **A chevron on a phone's chips too**: its sheet rises from below, and the two chevrons would cost the phone's chip row about 34px it does not have.
- **Seventeen other treatments** in the nineteen mockups of 2026-10-18: gaps of 0, 2 and 6px; a tonal chip, an unlit chip and an accent underline for the open state; a pointer notch, an accent edge on the card and a squared corner under the pill; the chip sitting on the card's top edge or inside its corner; and square-cornered chips, detached or joined as tabs. The accent says a thing acts, so an accent card edge spends it on decoration; a notch and a joined tab read as older patterns; and a chip on or inside its card reads as a frame from an animation.
- **Two surfaces for the two cards**, kept from the layout before: the legend on `SURFACE_FLOATING` and the Layers menu a step lighter on `SURFACE_POPOVER`, a key the reader reads and a menu the reader acts in. That held when the legend was a box in a column and Layers a popover off a button; beside each other under twin chips, the difference read as a mistake.
- **An accent outline on the cards**, option M of the nineteen: the legend card is open most of a session, so it would wear the colour that says a thing acts on a key the reader only reads.
- **A card's lone button at its right**, Material's place for a card's action: built in this PR and reverted the next day (TJ, 2026-10-18), because the centred button reads cleaner.

## Consequences

`MapButtonColumn.tsx` is gone and `PhoneMapRows.tsx` became `MapRows.tsx`, rendered at both widths. `MapLegend` is the Legend chip at both widths, opening a card at a desk and a sheet on a phone. `SearchBox` has one look, the pill. `MAP_COL_W`, `MAP_ROW_H`, `MAP_COL_GAP` and `LEGEND_TOP` are gone from `styles.ts`, and so are `LIFTED_EDGE` and `SEGMENT_FLUID_LIFTED`, which existed for the Layers menu's lighter fill; `SURFACE_POPOVER` keeps the search results list, the coverage well takes `SLIDER.well`, and `RECESSED_FILL` is private to `styles.ts` like `RECESSED_EDGE`, and `IconLayers` and `IconLegend` from `icons.tsx`. The lint checks that pinned the column became `style-map-chrome`, `style-map-rows`, `style-map-layers-chip` and `style-map-legend-chip`.
