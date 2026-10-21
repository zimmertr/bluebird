# 0207. On a phone the Controls sheet opens over the dimmed map like Legend and Layers, and moves nothing under it

- Status: Accepted. Supersedes 0141. Amends 0140 (the notice band still rides the Controls sheet's edge, now over its dim, and the Analyze button, the scale and the (i) stay at the map's foot), 0135 (no sheet hides the Analyze button or moves it: every phone sheet opens over it, and it stays where it stood under the dim) and 0136 (the Controls sheet is a bottom sheet too, and the Analyze button stays mounted under every sheet, a menu sheet included).
- Date: 2026-10-21
- Decider: the maintainer (TJ), on issue #714, reviewing PR #759 on a phone, 2026-10-21: "On mobile when you open the Control Pane, it slides up differently than Layers/Legend. Why? Layers and Legend seem to draw above the Attribution/Analyze button, but the Control pane pushes them up. Shouldn't all three behave the same way? I prefer the legend/layers approach fwiw." Asked where Analyze goes while the sheet is open, he chose: the sheet opens over the dimmed map and pushes nothing; Analyze, the scale and the (i) stay where they are under the dim; the notice band alone keeps riding the sheet's edge, so a cue like `Select at least one date to analyze.` still shows while editing; Done, then Analyze, the extra tap accepted. Asked the same day which rule the button should follow under a sheet's dim, inert under this sheet or hidden under a menu sheet, he chose one rule for every sheet, 2026-10-21: "Just leave the button mounted and not have the app think about its state when the modals paint over it. Should simplify the code too?"
- Issues and PRs: #714, #759
- Cited in code as: none (the code cites the record by number)
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `AppDrawer.tsx`, `BottomSheet.tsx`, `PhoneFoot.tsx` and `MapStage.tsx` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useDialog.ts`, `useSheetDrag.ts` and `useHeldSheetPx.ts` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), `resultsSheet.ts`; [`docs/STYLES.md`](../STYLES.md), Layers and Phone chrome; [`docs/USAGE.md`](../USAGE.md), On a phone

## Context

Record [0141](0141-phone-controls-sheet.md) made the Controls sheet a sheet that dimmed nothing. The map and the chips stayed live, and the Analyze button, the notice band, the scale and the (i) rode its top edge, so a reader could change a control and press Analyze without closing anything. Every other phone sheet opens over a dimmed map and moves nothing (record [0136](0136-phone-menus-are-bottom-sheets.md)). On a phone the maintainer saw the two shapes side by side: Legend and Layers drew over the foot of the map, and Controls pushed it up.

## Decision

- **The Controls sheet is a bottom sheet in the menus' shape**: the grip, `Controls` and Done, over a dim that covers the whole screen. Done, Escape and a press on the dim close it. The keyboard goes into it as it opens, Tab stays inside it, and the keyboard goes back to the summary chip as it closes. Its grip and title drag it as record [0146](0146-sheet-grips-drag.md) has it.
- **It pushes nothing.** The Analyze button, the scale and the (i) stand where they stood, under the dim. To run a change: Done, then Analyze.
- **No sheet touches the button.** Every phone sheet opens over it and leaves it mounted where it stood: Legend, Layers, Columns, Models, Removed, this sheet, and the model list and calendar inside it. No sheet hides it or makes it inert. A finger lands on the dim or the card, and the sheet holds the keyboard, so the button takes no press. This retires record 0136's rule that hid it under a menu sheet.
- **The notice band alone rides its edge**, 10px over it as record [0140](0140-phone-notices-on-the-map.md) placed it, and stands over the dim on the panel's layer (`MAP_NOTICE_BAND.overDim`, `LAYER.drawer`). There a cue reads at full contrast, and its × and retry take a press. Under the dim it would read through 40% black, and a press on its × would close the sheet. While the sheet is up the band's height does not reach the button (`PhoneFoot` stops reporting it), so a cue that arrives moves nothing under the dim.
- **One component.** `BottomSheet` takes `kept` for this sheet, so a phone keeps one sheet shape. The panel needs three things from it. Its state and the notice portal must outlive a close, so the sheet stays mounted, inert and slid below the map while shut. It renders in place, its dim (`CONTROLS_SHEET.scrim`, `LAYER.scrim`) one layer under its card (`LAYER.drawer`), so the band can stand between the dim and a sheet opened from inside the panel (`LAYER.popover`). And App holds its height (`useHeldSheetPx`), because `MapStage` stands the band on it.
- **A sheet opened from inside it stands over it.** `useDialog` keeps a stack, so Escape in the model list or the calendar closes that sheet alone, and Tab stays in the top one.
- **The tutorial keeps the keyboard.** While the tour runs (`tourRuns`), a panel step holds the sheet open behind the tour's card, and the sheet takes neither the keyboard nor Escape. A tour started from the sheet gives it back open and modal, with the keyboard on the Tutorial link.
- **The heights stay.** `controlsSheetPx` and `controlsFullPx` are unchanged: the sheet opens 484px tall at 360x740 and 588px at 390x844, its top 256px down. Nothing above it needs the button's 88px strip now. With room for the fullest band and a 16px inset under the chip row, it could stand 72px taller, its top at 184. That change waits for the maintainer.
- **From 0141, unchanged:** the summary chip raises the sheet and is lit while it is up; the sheet holds no Analyze and no notice block, and the document links are the last thing in its scrolling body; a committed report lowers it; a desk docks the panel as before.

## Evidence

Measured 2026-10-21 in the Playwright image's Chromium on a coarse pointer, with a five-row report landed, the sheet open, and `A new destination type requires a new analysis.` arriving in the band while it was up (`e2e/controlsSheet.spec.ts`):

| Viewport | Sheet top | Band | Button | Scale | (i) |
|---|---|---|---|---|---|
| 360x740 | 256 | 184 to 246 | 390 to 446 | 424 to 446 | 422 to 446 |
| 390x844 | 256 | 184 to 246 | 444 to 500 | 478 to 500 | 476 to 500 |

The button, the scale and the (i) stood on the same pixels with the sheet shut and open. The band stood 10px over the sheet's top. A probe at the band's middle hit the band, and one at the button's middle hit the sheet. A press on the dim shut the sheet and gave the button back.

Measured again 2026-10-21 after the one rule, in the same Chromium with the same report landed and the Layers sheet open (`e2e/controlsSheet.spec.ts`):

| Viewport | Layers top | Button | Scale | (i) |
|---|---|---|---|---|
| 360x740 | 312 | 390 to 446 | 424 to 446 | 422 to 446 |
| 390x844 | 416 | 444 to 500 | 478 to 500 | 476 to 500 |

The button stayed mounted, neither inert nor greyed. It, the scale and the (i) stood on the same pixels before Layers opened, while it was up and after Done. A probe at the button's middle hit the Layers card at both sizes, and after Done it hit the button.

## Alternatives rejected

- **Keep the push** (record 0141): Analyze stays in reach while a control changes, at the cost of two sheet shapes on one phone. The maintainer chose the menus' shape.
- **Analyze inside the sheet**, at its foot or in its title row: a second Analyze on a phone, which record 0141 retired, and a foot that costs the sheet's height.
- **The band under the dim:** it would read through 40% black, and a press on its × would close the sheet, while the cue is about the controls being changed.
- **Hide the button under every sheet**, as record 0136 had the menu sheets do: the maintainer asked for it to stay where it stood.
- **Two rules**, the button hidden under a menu sheet and inert under this one, as this record first had it: the maintainer chose one rule for every sheet.
- **The button inert under every sheet:** the maintainer asked that the app not track the button's state under a sheet, and the sheet's modality already keeps it from a press.
- **A modal component of its own for this sheet:** a phone would have two sheet shapes again.

## Consequences

`BottomSheet` takes `kept` and renders the Controls sheet in place, and `SheetTop` is private to it. `useDialog` takes an `active` that changes, keeps a stack of open dialogs, focuses without scrolling, and leaves the keyboard where it is when the panel already holds it. `useSheetOpen.ts` is gone, with the count each menu sheet kept in it. `phoneFootLiftPx` is gone: the button and the corner ride the results sheet (`fabBottomPx`), and `noticeLiftPx` stands the band on the Controls sheet's edge. `MAP_NOTICE_BAND` is two recipes, `map` and `overDim`, since two z-index utilities on one element resolve by stylesheet order. `PhoneFoot` takes `controlsOpen` for the band alone: the layer it stands on, and the height it holds back while the sheet is up. `AppDrawer` takes `tourRuns`. The tutorial's phone walk taps Done before the Layers chip, because the sheet the tour began from comes back modal.

The band stands outside the dialog, so a keyboard reaches its × only after Done. Whether a screen reader announces a cue there while the sheet is up depends on how it treats a live region outside an `aria-modal` dialog, which is untested. Under every sheet only the sheet's `aria-modal` keeps a screen reader off the button, as it always has for the chips and the search pill. That is untested too. `e2e/controlsSheet.spec.ts` holds the geometry under this sheet and under Layers at 360 and 390 wide, and `styles.test.ts` holds the layers.
