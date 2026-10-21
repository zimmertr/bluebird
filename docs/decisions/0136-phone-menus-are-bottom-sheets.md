# 0136. On a phone every menu is a bottom sheet

- Status: Accepted. Amends 0134 on a phone (a desk's menus still unfurl from their control), 0019 (on a phone the Layers menu is a sheet) and 0048 (on a phone the legend's keys are the Legend sheet's, not a box on the map). Amended by 0146 (the grip drags the sheet), 0201 (the Controls sheet's model list and calendar are sheets too) and 0207 (the Controls sheet is a bottom sheet too, and no sheet hides the Analyze button: it stays where it stood under every sheet's dim).
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696: the phone flow mockup approved 2026-10-14, "one menu shape on a phone: a bottom sheet with a title and Done"
- Issues and PRs: #696, #708, #687
- Cited in code as: #696
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `BottomSheet.tsx`, `MapLegend.tsx`/`LayersPopover.tsx`, `ColumnsPicker.tsx`, `ModelsPicker.tsx` and `RemovedPicker.tsx` bullets; [`docs/STYLES.md`](../STYLES.md), Phone chrome; [`docs/USAGE.md`](../USAGE.md), On a phone

## Context

A desk's menus unfurl out of the control that opens them (record [0134](0134-menus-unfurl-from-their-control.md)). On a phone that card was as wide as a chip or a bar group, a press outside it had to land on a map or a sheet the reader was also using, and the legend took a column of the map's left side whether or not the reader was reading it.

## Decision

- **A phone has one menu shape** (`BottomSheet`): a card rising from the screen's bottom edge over a dimmed map, with a grip, its heading and Done, and rows a finger's 44px tall with a rule between them. Done, Escape, a press on the dim and a drag down the grip each close it, and the grip drags it taller too (record [0146](0146-sheet-grips-drag.md)). It is modal (`useDialog`: the keyboard goes into it and comes back, Tab stays inside), and its dim covers the whole screen, the search row and the chips included, Material's rule for a modal sheet's scrim. It is fixed to the viewport, so a preview banner above the map cannot leave a band of the map bright; a first build started the dim under the chip row to keep the opened chip readable, and on the maintainer's phone, under the preview banner, its edge cut through the chips (2026-10-14).
- **Its homes:** Layers and Legend from the chip row, and Columns, Models and Removed from the results bar. Each is headed by words the app already says: the chip's or the button's word, and for Removed the desk card's own heading, Removed rows.
- **The legend's keys are the Legend sheet's on a phone**, and the map holds no legend box. `legendSections` decides the list once, so a desk's box and a phone's sheet draw the same keys.
- **The Analyze button hides while any sheet is open** (`useSheetOpen`) and comes back when it closes, Material's rule for a floating button under a modal sheet (record [0135](0135-phone-opens-on-the-map.md)).
- **The tutorial does not hold a sheet open:** a modal sheet would take the keyboard from the tour's own card, so on a phone its Layers step points at the chip.

## Evidence

Shot 2026-10-14 at 390x844 and 360x800 against the built image: the Layers sheet holds all eight rows on one line each with room to spare, and the Columns sheet's grips and boxes keep the desk's behaviour.

## Alternatives rejected

- **The desk's unfurling card on a phone:** too narrow at a chip's width, and its press-outside dismissal fought the map.
- **A legend that folds to a header on the map**, built first in #708: rejected by the maintainer for the sheet.
- **The chart's metric in a sheet too**, which the mockup drew: it stays the native select for now, because the sheet's heading would be a new visible string (its only name today is the select's accessible name, `Chart metric`), and a phone's native select already opens the platform's own picker from the bottom.

## Consequences

`ColumnsPicker`, `ModelsPicker`, `RemovedPicker` and `LayersPopover` take `sheet`; the pickers no longer take `widthRef`, and `ResultsBar` no longer hands up its actions row. `MapLegend` exports `legendSections` and `LegendSections`. The `layers-popover-dismiss` check keys on `popoverOpen`, the desk menu's own flag.
