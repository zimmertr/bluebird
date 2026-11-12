# 0290. Every phone sheet rises to the top of the screen, on one ceiling

- Status: Accepted. Amends [0146](0146-sheet-grips-drag.md) (full height is no longer one inset under the chip row for a menu sheet and `controlsFullPx` for the Controls sheet) and [0207](0207-phone-controls-sheet-is-modal.md) (`controlsFullPx` is gone)
- Date: 2026-11-12
- Decider: the maintainer (TJ), 2026-11-12: on a phone the Controls sheet would not drag as high as the Layers sheet; every sheet (Layers, Legend, Controls, Messages and the rest) should drag the same way, reach full screen and draw over the Analyze button, the search box and the legend. The results sheet keeps its own drag and shares the rules; every sheet still opens at the height it opens at today
- Issues and PRs: none filed; the PR that carries this record
- Cited in code as: record 0290
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `BottomSheet.tsx`, `AppDrawer.tsx`; [`frontend/src/utils/results/CLAUDE.md`](../../frontend/src/utils/results/CLAUDE.md), `resultsSheet.ts`; [`docs/USAGE.md`](../USAGE.md), the Controls sheet and the phone menus; [`docs/STYLES.md`](../STYLES.md), the phone sheets

## Context

Every phone sheet already ran one component (`BottomSheet`), one drag (`useSheetDrag`) and one release rule (`sheetRelease`), but each kind was handed its own top. A menu sheet stopped one inset under the chip row, the `max-h` it opens at read back as its full height. The Controls sheet stopped at `controlsFullPx`, the map less the rows and the Analyze button's strip (`DRAGGED_MAP_PX`, 176px), which record 0146 kept so the button had a place over the sheet's edge. Record 0207 put the button under the dim, so nothing needed the strip any more, and the Controls sheet stood lower than the Layers sheet beside it for no reason a reader could see. The results sheet has run to the screen's top since record [0259](0259-phone-results-sheet-drags-to-full-screen.md).

## Decision

- **One ceiling for every sheet, measured in one place.** When a drag begins, `BottomSheet` reads the box the card stands in (the screen for a menu sheet, the app's frame for the Controls sheet) less the status bar's band, and that is full height. A caller hands only its own height: the Controls sheet its `controlsSheetPx`, a menu sheet its rows. `KeptSheet.fullPx` and `controlsFullPx` are gone.
- **The status bar's band is read off a probe**, `BOTTOM_SHEET.topBand`, an invisible box `env(safe-area-inset-top)` tall inside the card, because only CSS can read the inset. A sheet at full height keeps its grip clear of an iPhone's clock; where the browser reports 0 it reaches the screen's top.
- **A menu sheet's `max-h` is only the cap it opens at.** A held height sets `max-height: none` inline, so a drag runs past it.
- **The opening heights stay**, and so do the stops and the flick: a release within `SHEET_SNAP_PX` of the top, or a flick up, takes a sheet to full screen. Full screen is never where a sheet opens, record 0259's rule for the results sheet.
- **Every sheet already stands over the map's rows and its Analyze button** (`LAYER.drawer` and `LAYER.popover`, both over `LAYER.mapControls`), so a full one covers the search box, the chips, the legend and the button. Nothing new is layered.
- **The results sheet keeps its own drag** (record 0259), which runs on the compositor for a 120 Hz phone and docks with grips a modal sheet does not have. It already reads `SHEET_SNAP_PX` from `sheetDrag.ts`, so the two snap to the top the same way.

## Evidence

`sheetDrag.spec.ts` drags the Controls and the Layers sheets to the top at 390x844 in the browser suite: each card's top lands at 0 and its bottom at 844, and what stands at the search box's and the Analyze button's places is the card. `BottomSheet.test.tsx` holds a menu sheet past the cap it opened at to the screen's height, and the Controls sheet to the screen less a 47px band.

## Alternatives rejected

- **Moving the results sheet onto `useSheetDrag`:** its transform drag was measured for record 0259, and a height per move cost 68.1 ms a move there; the maintainer chose to share the rules and keep the engine.
- **Opening every sheet at full screen:** the maintainer kept today's opening heights.
- **Raising `controlsFullPx` to the map's top:** a second number for the same ceiling, which is how the two sheets came apart.

## Consequences

A sheet's full height is read at the start of each drag, so a rotation while a sheet stands full leaves it at the old height until the next drag. The Controls sheet's full height is the app's frame, which on a PR preview starts under the preview banner rather than at the screen's top.
