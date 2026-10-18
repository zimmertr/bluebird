# 0174. A desk's map carries the phone's rows: the search pill with locate, and chips whose menus unfurl

- Status: Accepted. Supersedes 0148. Amends 0019 (at a desk Layers is a chip in the row under the search pill too), 0048 (at a desk the legend is a card under the Legend chip, as tall as its sections), 0134 (a chip's menu is wider than its chip and squares the corner under it), 0135 (the rows stand on the map at both widths), 0147 (no zoom pair at either width, and the compass ends the chip row at a desk too) and 0161 (the popup's lone action stands at the card's right).
- Date: 2026-10-17
- Decider: the maintainer (TJ), on issue #714, 2026-10-17: direction A2 of three mockups (A, B and C, with Analyze placed three ways in each), menus joined to their chips, the zoom pair dropped, the compass at the chip row's right end, and a card's lone button content-sized at its right
- Issues and PRs: #714, #696, #708, #733
- Cited in code as: #714
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `MapRows.tsx`, `MapLegend.tsx`, `LayersPopover.tsx`, `SearchBox.tsx` and `MapStage.tsx` bullets; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), `controls.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `resultsSheet.ts` and `popupChrome.ts` bullets; [`docs/STYLES.md`](../STYLES.md), Map chrome and Opening a panel; [`docs/USAGE.md`](../USAGE.md), At a desk and The map's legend
- Related: 0028 (the one notice block under Analyze), 0136 (a phone's menus are sheets)

## Context

PR #708 and PR #733 gave the phone a map of its own: a search pill with the locate button at its right, and a row of chips under it. A desk kept the older column at the map's top left: a boxed search field, then Controls, Layers and Legend as 184px buttons, with the zoom pair and the compass in the library's top-right stack. One app looked like two.

## Decision

- **The desk's map wears the phone's two rows.** The pill and the locate button stand on the first, and Layers and Legend on the chip row under it. The rows stop 368px from the map's left edge, the pill's 320 plus the gap and the button, so the rest of the map's top stays the map's.
- **The summary chip stands at the chip row's front only while the panel is shut**, since the docked panel has its own Close. It takes the keyboard when the panel closes under it.
- **Analyze stays in the panel**, with every notice under it as record 0028 says. A desk has no floating button, so closing the panel puts Analyze away. The maintainer accepted that.
- **Each chip's menu unfurls as one card with it**, the way record 0134 joins every menu. The card is 184px (`MAP_MENU_W`), wider than its chip, so it starts at the chip's left edge, keeps its border along the shared edge and squares the one corner under the chip (`MAP_CHIP_MENU`, `UNFURLED.belowWideLeft`). The Layers menu stands over the legend card.
- **The legend card is as tall as its sections**, open until the reader folds it as record 0148 had it, and scrolls inside the map's height under the rows (`legendMaxCss`, read off the map wrapper as `100cqh`).
- **No zoom buttons at either width.** Scroll, pinch and a double click zoom. The compass ends the chip row, under the locate button, as on a phone.
- **A card's lone button is content-sized at its right**, Material's place for a card's action. That moves the popup's Add to analysis and Remove from analysis button, centred since PR #713.

## Evidence

Mockups of all three directions and of Analyze placed three ways in each were published to TJ as a private artifact on 2026-10-17, and the choices above are TJ's answers to them.

## Alternatives rejected

- **B, restyling the column in place:** two layouts for one app would remain.
- **C, a Material rail and app bar:** a rebuild of the panel for a map tool whose panel already works.
- **A1, a floating Analyze on the desk's map, and A3, an Analyze chip:** both pull Analyze away from the notices that explain it.
- **Menus standing under their chip with a gap:** every other menu in the app is joined to its control.

## Consequences

`MapButtonColumn.tsx` is gone and `PhoneMapRows.tsx` became `MapRows.tsx`, rendered at both widths. `MapLegend` is the Legend chip at both widths, opening a card at a desk and a sheet on a phone. `SearchBox` has one look, the pill. `MAP_COL_W`, `MAP_ROW_H`, `MAP_COL_GAP` and `LEGEND_TOP` are gone from `styles.ts`, and `IconLayers` and `IconLegend` from `icons.tsx`. The lint checks that pinned the column became `style-map-chrome`, `style-map-rows`, `style-map-layers-chip` and `style-map-legend-chip`.
