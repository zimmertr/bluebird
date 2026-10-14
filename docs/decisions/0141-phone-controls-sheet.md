# 0141. On a phone the controls are a bottom sheet the summary chip raises, with the map's Analyze on its edge

- Status: Accepted. Amends 0135 (the panel a phone opens from the summary chip is a sheet, not a side drawer). Amended by 0146 (its grip drags).
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696: frame C of the band comparison, chosen 2026-10-14; the fixed foot dropped on a Pixel the same evening
- Issues and PRs: #696, #708, #576, #536
- Cited in code as: #696
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `AppDrawer.tsx`, `ControlPanel.tsx`, `PanelFooter.tsx`, `BottomSheet.tsx`, `PhoneMapRows.tsx`, `MapStage.tsx`; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useDrawer.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `resultsSheet.ts`

## Context

A phone opened its controls as a side drawer 360px wide over the map, with its own Analyze at the foot, beside the map's floating Analyze (record [0135](0135-phone-opens-on-the-map.md)). Two Analyze buttons on one phone, a drawer that hid the map it was about, and a second shape for a panel when every other phone menu is a bottom sheet (record [0136](0136-phone-menus-are-bottom-sheets.md)).

## Decision

- **The summary chip raises the panel as a sheet titled `Controls`, with Done**, from the map's foot: Destinations, Forecast and Metrics exactly as the panel renders them, scrolling inside it. The chip is lit while the sheet is up and lowers it on a second press; Done and Escape close it too, and its grip drags (record [0146](0146-sheet-grips-drag.md)).
- **No Analyze inside it.** The map's floating button is the one Analyze on a phone and rides the sheet's top edge while it is up (`phoneFootLiftPx`), so it stays in reach while a control changes.
- **Not modal.** No dim, the map and the chips stay live, and nothing hides the floating button, because a reader changing a control is about to press it. A labelled region rather than a dialog.
- **No notice block and no fixed foot.** Every notice line rides the map's band (record [0140](0140-phone-notices-on-the-map.md)), and the Tutorial, Privacy and Terms line is the last thing in the sheet's scrolling body, at its natural height, seen when the reader scrolls to it. A first cut kept the informing lines and the links in a foot fixed under the scrolling body, which the maintainer dropped on a Pixel for the height it cost.
- **A fixed share of the map** (`controlsSheetPx`): the map less the two rows, the button's strip and room for the fullest notice band (`CONTROLS_MAP_PX`), so a cue arriving while a finger is on a control moves the button rather than the sheet. 588px at 390x844, 484px at 360x740.
- **Mounted for good**, slid below the map and inert while shut, so the panel keeps its state and the notice portal its home. A committed report lowers it, as it closed the drawer.
- **The desk is untouched**: `AppDrawer` docks the panel there as before, and `useDrawer` still says whether it is open at either width.

## Evidence

Shot 2026-10-14 at 360x740, 390x844 and 430x932: the sheet's top at 256 from the screen's top at every width, the button 16px over it, and with a cue the band 10px over the sheet and the button 16px over the band (112 to 168). Re-shot after the foot went: the sheet 484, 588 and 676px tall, the Terms link at 709, 813 and 901 when scrolled to the end, 17px above the sheet's bottom.

## Alternatives rejected

- **The side drawer with its own Analyze:** two Analyze buttons, and the drawer hid the map.
- **A modal sheet:** it would dim the button that commits what it changes.

## Consequences

`ControlPanel` takes `phone`, which drops its logo header (the sheet has its own) and the footer's Analyze. The tour's Analyze step lights the map's button on a phone. The drawer's backdrop is gone, and `SheetTop` in `BottomSheet.tsx` is the top both kinds of sheet wear.
