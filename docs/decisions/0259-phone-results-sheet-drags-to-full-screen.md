# 0259. A drag on a phone's results sheet takes it to full screen when let go near the top

- Status: Accepted. Amends [0034](0034-phone-sheet-on-map.md) and [0135](0135-phone-opens-on-the-map.md) (a dragged sheet no longer always stops under the chip row)
- Date: 2026-10-30
- Decider: the maintainer (TJ), on issue #837, 2026-10-30: full screen reached by dragging the handle to the top of the screen and never the default; the drag snaps there within 48px of the top; the rows, the Analyze button and the player step off while the sheet covers them; Chart still lifts to the cap
- Issues and PRs: #837
- Cited in code as: #837
- Guide: [`frontend/src/utils/results/CLAUDE.md`](../../frontend/src/utils/results/CLAUDE.md), `resultsSheet.ts`; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useResultsLayout.ts`; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `MapRows.tsx`, `PhoneFoot.tsx`; [`docs/STYLES.md`](../STYLES.md); [`docs/USAGE.md`](../USAGE.md), the results sheet on a phone

## Context

A phone's results sheet stopped under the map's rows however far it was dragged (`draggedMapFloorPx`): the two rows and the Analyze button's strip, 176px of map, and 252px with the player on, summed from the constants on 2026-10-30. A long table or a chart of four plots had less room than the phone.

## Decision

- **Past the cap a drag runs on to the top of the map.** While a drag is under way the panels' floor is the sheet's own chrome (`fullScreenMapFloorPx`), so the sheet can cover the whole map.
- **The release decides where it stays** (`sheetTopRelease`). Within `SHEET_SNAP_PX` (48px) of the top the sheet goes to full screen. Above the cap but short of that it falls back to the cap. Anywhere lower it holds where it was let go, as before.
- **Full screen is a state, not a height** (`fullScreen` in `useResultsLayout`), so a rotation or a mode switch keeps it whole. In Both the chart keeps the reader's share and the table fills the rest; the divider trades the pair and leaves the sheet where it is.
- **It comes down** under the next drag on the map's grip, which starts from where the sheet stands, or a double press on that grip, which puts the sheet back at rest. The tutorial's rest brings it down too.
- **It is never a default.** The sheet opens at rest, a phone's Chart lifts to the cap (record [0155](0155-phone-chart-rests-at-the-full-stop.md)), and the tutorial's Chart step holds the cap.
- **The rows, the Analyze button with its badge and the player step off** while the sheet stands above the cap (`overMapRows`), at full screen or on the way there. The rows and the button stand above the sheet (`LAYER.mapControls`) and would draw over its bar. They are hidden with `UNDER_FULL_SHEET` (`invisible`) rather than unmounted, so the map keeps the slots its own buttons stand in, and neither the keyboard nor a screen reader reaches a control no finger can. The player steps off with them.
- A desk is unchanged.

## Evidence

`useResultsLayout.test.tsx` holds the release at 390 by 1000: a sheet let go 48px under the top covers the whole map, one let go 60px over the cap falls back to the cap, the next drag brings it down from where it stands, a double press puts it at rest, Chart lifts only to the cap and keeps full screen once it is there, Both fills with the table, and a desk never reaches it. `resultsSheet.test.ts` holds the release rule and that the band between the cap and the top is wider than the snap. `fullScreen.spec.ts` drags the sheet to the top at 390x844 in the browser suite.

## Alternatives rejected

- **A detent at the cap that a further pull flips past:** a gesture rule the menu sheets do not have, and a detent the reader cannot see feels like a stuck handle.
- **A free drag to the top with no snap:** a sheet held a few pixels under the top leaves a sliver of map with no rows over it.
- **Holding a release anywhere between the cap and the top:** the rows and the button would stand over the sheet's bar there.
- **The browser's Fullscreen API:** it needs a button and a string of its own, and iPhone Safari is not known to offer it for anything but video (not verified).
- **Lifting Chart to full screen when it is picked:** the maintainer asked for full screen never to be a default.

## Consequences

The sheet's height while dragging can now pass the cap, so the drag floor in a render is the full-screen floor whenever a drag is under way. Hidden rows mean the message badge's live region is out of the accessibility tree while the sheet is at full screen; a run that fails still opens the Messages sheet, which stands outside it.
