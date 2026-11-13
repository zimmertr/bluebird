# 0291. Every phone sheet rises to the top of the screen, on one ceiling

- Status: Accepted. Amends [0146](0146-sheet-grips-drag.md) (full height is no longer one inset under the chip row for a menu sheet and `controlsFullPx` for the Controls sheet) and [0207](0207-phone-controls-sheet-is-modal.md) (`controlsFullPx` is gone)
- Date: 2026-11-12
- Decider: the maintainer (TJ), 2026-11-12: on a phone the Controls sheet would not drag as high as the Layers sheet; every sheet (Layers, Legend, Controls, Messages and the rest) should drag the same way, reach full screen and draw over the Analyze button, the search box and the legend. The results sheet keeps its own drag and shares the rules; every sheet still opens at the height it opens at today
- Issues and PRs: none filed; the PR that carries this record
- Cited in code as: record 0291
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `BottomSheet.tsx`, `AppDrawer.tsx`; [`frontend/src/utils/results/CLAUDE.md`](../../frontend/src/utils/results/CLAUDE.md), `resultsSheet.ts`; [`docs/USAGE.md`](../USAGE.md), the Controls sheet and the phone menus; [`docs/STYLES.md`](../STYLES.md), the phone sheets

## Context

Every phone sheet already ran one component (`BottomSheet`), one drag (`useSheetDrag`) and one release rule (`sheetRelease`), but each kind was handed its own top. A menu sheet stopped one inset under the chip row, the `max-h` it opens at read back as its full height. The Controls sheet stopped at `controlsFullPx`, the map less the rows and the Analyze button's strip (`DRAGGED_MAP_PX`, 176px), which record 0146 kept so the button had a place over the sheet's edge. Record 0207 put the button under the dim, so nothing needed the strip any more, and the Controls sheet stood lower than the Layers sheet beside it for no reason a reader could see. The results sheet has run to the screen's top since record [0259](0259-phone-results-sheet-drags-to-full-screen.md).

## Decision

- **One ceiling for every sheet, measured in one place.** When a drag begins, `BottomSheet` reads the box the card stands in (the screen for a menu sheet, the app's frame for the Controls sheet) less the status bar's band, and that is full height. A caller hands only its own height: the Controls sheet its `controlsSheetPx`, a menu sheet its rows. `KeptSheet.fullPx` and `controlsFullPx` are gone.
- **The status bar's band is read off a probe**, `BOTTOM_SHEET.topBand`, an invisible box `env(safe-area-inset-top)` tall inside the card, because only CSS can read the inset. A sheet at full height keeps its grip clear of an iPhone's clock; where the browser reports 0 it reaches the screen's top.
- **A menu sheet's `max-h` is only the cap it opens at** (`BOTTOM_SHEET.opening`). Once a drag holds it, `BOTTOM_SHEET.ceiling` takes its place, so a drag runs past it.
- **Full is a state, not a height** (`SheetHeight`'s `full`, the record 0259 rule for the results sheet). A sheet let go at the top is sized by `BOTTOM_SHEET.full`, a percentage of the box it stands in less the band, and every held height stands under `BOTTOM_SHEET.ceiling`, the same sum as a `max-h`. A phone turned on its side therefore keeps a full sheet full. Held as a number, a full sheet's grip stood above a turned phone's screen, where nothing could reach it (the maintainer, 2026-11-12, on this PR).
- **A height between is a share of the ceiling** (`SheetHeight`'s `share`, `heldShare` and `sharePx` in `sheetDrag.ts`), the room the screen gives a sheet. The card carries it as `--sheet-share` and `BOTTOM_SHEET.held` sizes it in CSS, so a sheet dragged to 70% of the room stands at 70% of the room on the screen it is turned to, and at 70% again when it is turned back. Two versions came before it on this PR, both found on the maintainer's phone on 2026-11-12. Held in px and clamped by the ceiling, every held sheet went full on a turned phone. Held as a share of the sheet's own height, a Controls sheet at about 72% of an upright screen stood at about 27% of a sideways one, because its own height is `controlsSheetPx`, the screen under a fixed strip of map, and that strip takes most of a sideways screen.
- **A drag on a sheet's handle is never the browser's.** The title row is a handle as much as the grip (record 0146) and now takes no touch gesture of its own (`touch-none` on `BOTTOM_SHEET.head`, as the grip had), and the page turns off overscroll (`overscroll-behavior-y: none` on `html` and `body` in `index.css`). Chrome and Firefox on Android read a drag down from the page's top as a pull to refresh, and a finger on the title row reloaded the app (the maintainer, 2026-11-12). Both are the platform's own switches for this, the ones a web map or a web chat turns off the same way.
- **The opening heights stay**, and so do the stops and the flick: a release within `SHEET_SNAP_PX` of the top, or a flick up, takes a sheet to full screen. Full screen is never where a sheet opens, record 0259's rule for the results sheet.
- **Every sheet already stands over the map's rows and its Analyze button** (`LAYER.drawer` and `LAYER.popover`, both over `LAYER.mapControls`), so a full one covers the search box, the chips, the legend and the button. Nothing new is layered.
- **The results sheet keeps its own drag** (record 0259), which runs on the compositor for a 120 Hz phone and docks with grips a modal sheet does not have. It already reads `SHEET_SNAP_PX` from `sheetDrag.ts`, so the two snap to the top the same way.

## Evidence

`sheetDrag.spec.ts` drags the Controls and the Layers sheets to the top at 390x844 in the browser suite: each card's top lands at 0 and its bottom at 844, and what stands at the search box's and the Analyze button's places is the card. Then the phone turns to 844x390: the sheet stays full at 390, its grip on the screen, and a drag down from it moves it 120px. A Controls sheet held 100px over its own height, 688 of 844, stands at the same share of 390 on the turned screen, within a pixel, and back at 688 when the phone turns back. `styles.test.ts` holds both handles at `touch-none` and the page's overscroll off. `BottomSheet.test.tsx` holds a menu sheet past the cap it opened at to the screen's height and full by its CSS once let go there, a held height under the ceiling, a held share of the ceiling that a turned screen keeps and a drag there starts from, and the Controls sheet to the screen less a 47px band, at its share of the ceiling whatever own height its caller hands it, and full when its caller holds it so. Whether Firefox for Android honours `overscroll-behavior` for its pull to refresh is not verified here: the browser suite runs Chromium.

## Alternatives rejected

- **Moving the results sheet onto `useSheetDrag`:** its transform drag was measured for record 0259, and a height per move cost 68.1 ms a move there; the maintainer chose to share the rules and keep the engine.
- **Opening every sheet at full screen:** the maintainer kept today's opening heights.
- **Raising `controlsFullPx` to the map's top:** a second number for the same ceiling, which is how the two sheets came apart.

## Consequences

The Controls sheet's full height is the app's frame, which on a PR preview starts under the preview banner rather than at the screen's top.
