# 0146. A phone sheet's grip drags it, to full, to closed or to anywhere between

- Status: Accepted. Amends 0136 and 0141 (a swipe down the grip no longer only closes the sheet; the grip drags it).
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696, on a Pixel 2026-10-14: the grips on the Layers, Legend, Columns, Models, Removed and Controls sheets did not drag; the drag, its stops and the double tap asked for the same evening
- Issues and PRs: #696, #708, #336
- Cited in code as: #696
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `BottomSheet.tsx`, `ResizeGrip.tsx`, `AppDrawer.tsx`; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useGripDrag.ts`, `useSheetDrag.ts`, `useHeldSheetPx.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `sheetDrag.ts`, `resultsSheet.ts`; [`docs/USAGE.md`](../USAGE.md), On a phone

## Context

Every phone sheet wore a grip (records [0136](0136-phone-menus-are-bottom-sheets.md) and [0141](0141-phone-controls-sheet.md)), and the grip only closed the sheet on a 48px swipe down. A grip that does not drag is a handle that lies, and the results sheet beside them dragged.

## Decision

- **The grip and the title row drag the sheet; Done does not.** The same pointer mechanics as the results sheet's grips: the gesture is `useGripDrag`, cut out of `ResizeGrip` so both kinds of grip run one handler, and `useSheetDrag` puts a menu sheet's rules on it.
- **Three stops, and anywhere between.** Up reaches full height: one inset under the chip row for a menu sheet, and for the Controls sheet the map less the button's strip (`controlsFullPx`), so the Analyze button keeps its place over the sheet's edge. Down closes. A release within `SHEET_SNAP_PX` (48px, the old swipe's distance) of closed, the sheet's own height or full takes that stop; anywhere else the sheet holds where the finger left it.
- **A flick still closes**: a release moving down at `SHEET_FLICK_PX_PER_MS` (0.6 px per ms, read over the last `FLICK_WINDOW_MS`, 100ms) closes the sheet from any height, and the same speed up raises it whole.
- **A double tap on the grip returns the sheet to its own height** (`DOUBLE_PRESS_MS`, 350ms), the results sheet's gesture, through the same handler.
- **A held height lasts while the sheet is open.** Each sheet opens at its own height again: a menu sheet at its rows, the Controls sheet at its share of the map (`useHeldSheetPx` resets on close).

## Evidence

Measured 2026-10-14 in the Playwright image's Chromium with CDP touch events:

| Viewport | Controls at rest | Controls dragged full | Analyze then | Controls held mid-drag | Layers before, after a 160px drag |
|---|---|---|---|---|---|
| 360x740 | 484 | 560 | 108 to 164 | 260 | 440, 636 (within 48px of full, so full) |
| 390x844 | 588 | 664 | 108 to 164 | 364 | 440, 600 |
| 430x932 | 676 | 752 | 108 to 164 | 452 | 440, 600 |

`sheetDrag.spec.ts` drags the Layers sheet up by its grip, holds it, and shuts it dragged down from its title.

## Alternatives rejected

- **A second pointer handler for the menu sheets:** the brief asked for the results sheet's, and two would drift.
- **Snapping every release to a stop:** the maintainer asked for intermediate positions to hold.

## Consequences

`BottomSheet` holds its own height while open and measures its rest and full heights off the card. The Controls sheet's height lives in `App.tsx`, because `MapStage` places the Analyze button and the band from it (`phoneFootLiftPx` takes it). `SheetTop` takes the pointer handler, and `SWIPE_CLOSE_PX` is gone.
