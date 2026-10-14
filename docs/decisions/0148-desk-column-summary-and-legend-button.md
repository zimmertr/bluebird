# 0148. A desk's map column says what the panel holds and folds its legend under a Legend button

- Status: Accepted. Amends 0048 at a desk (the legend box is a card under a `Legend` button in the column, folded or open as the reader last left it).
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696, 2026-10-14: the desk half of the #687 audit's M04, brought into PR #708 rather than left to #714
- Issues and PRs: #696, #708, #687, #714
- Cited in code as: #696
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `MapButtonColumn.tsx`, `MapLegend.tsx`, `MapStage.tsx`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `viewPrefs.ts`, `controlsSummary.ts`

## Context

A phone's map says what the panel holds in its summary chip (`☰ Current · NOAA GFS`) and keys the map under a Legend chip (record [0135](0135-phone-opens-on-the-map.md)). A desk's column said `Controls` and stood the legend box under the Layers button with no way to fold it.

## Decision

- **The column's Controls button shows the summary** a phone's chip shows (`controlsSummary`, `MAP_CHIP_SUMMARY_TEXT`), in place of the word. Its accessible name stays the one it had, `Open controls`, and the summary rides as its description, the chip's way.
- **The legend box becomes a `Legend` button in the column and the card it unfurls**, joined the way Layers is to its menu (record [0134](0134-menus-unfurl-from-their-control.md): `UNFURL_ANCHOR` on the button, `UNFURLED.below` on the card), the card holding what the box held. It is open until the reader folds it, and folded or open again on the next visit (`viewPrefs.legendOpen`).
- **The button greys while no section has anything to key**, the way a phone's Legend chip does, so the column keeps one shape from arrival to results rather than gaining a member when a report lands.
- Nothing else on a desk changes; the button stands where the box's top stood (`LEGEND_TOP`), so every anchor under it holds.

## Evidence

Shot 2026-10-14 at 1440x900 with a ring analysis landed and the panel shut: the Controls button 184 by 36 at the column's second row reading `Dates · NOAA GFS`, its description the same words, and the Legend button 184 by 36 at 132, open, its card under it; folded, the card goes and the button stays.

## Alternatives rejected

- **No button until there is something to key**, the box's old rule: the column would grow a member when the first report lands.
- **The word `Controls` kept beside the summary:** the phone's chip drops it, and the column is the chip's width.

## Consequences

`MapStage` renders `MapLegend` at a desk only and hands it `legendInitiallyOpen` from `App.tsx`'s stored view. The `style-map-legend-column` check counts `MAP_COL_W` twice and requires the unfurl join. The privacy page's sentence on what the browser remembers of a layout does not yet name the legend's fold.
