# 0259. A drag on a phone's results sheet takes it to full screen when let go near the top

- Status: Accepted. Amends [0034](0034-phone-sheet-on-map.md) and [0135](0135-phone-opens-on-the-map.md) (a dragged sheet no longer always stops under the chip row)
- Date: 2026-10-30
- Decider: the maintainer (TJ), on issue #837, 2026-10-30: full screen reached by dragging the handle to the top of the screen and never the default; the drag snaps there within 48px of the top; Chart still lifts to the cap. On PR #841, 2026-10-31: the sheet slides over the map's controls rather than hiding them, the controls it covers are out of reach, and the drag must be fast enough for a 120 Hz phone
- Issues and PRs: #837, #841
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
- **The sheet slides over the map's rows and its Analyze button.** They stand on `LAYER.mapControls`, above a resting sheet; for the whole of a drag and at full screen the sheet takes `LAYER.sheetRaised`, over them and under the analysis overlay (`sheetRaised`). Nothing hides or moves out of its way.
- **At full screen what it covers is out of reach** (`overMapRows`): the rows and the Analyze button are `inert` under it, so neither the keyboard nor a screen reader lands on a control no finger can.
- **A drag on a phone moves the sheet by a transform, not a height.** When it begins, the dragged panel is drawn at the most the drag can reach (`ceilPx`) and the sheet is moved down by the difference; each move sets the transform and one CSS variable, `--sheet-shift`, on the map's column, and renders nothing. The Analyze button, the player, the scale and the credit follow through that variable (`fabShiftPx`), and the lift they stand on holds where the drag began. The release commits one height and clears both. A desk's grips and the divider in Both still resize as they move.
- A desk is unchanged.

## Evidence

Measured 2026-10-31 with the browser suite's image at 390x844, a 200-row report, one pointer move each frame and the CPU slowed four times (`e2e/perf/sheetDrag.spec.ts`), Chrome's main-thread work per move:

| Drag | Before | After |
|---|---|---|
| Table | 68.1 ms; median frame 53 ms; 53 of 60 frames over 20 ms | 9.5 ms; median frame 16 ms; 1 of 60 |
| Chart | 34.2 ms; median frame 40 ms; 39 of 60 | 4.4 ms; median frame 16 ms; 1 of 60 |

The one slow frame left is the render a drag begins with. Before, each move rendered the whole app twice, the second time for the sheet's measured height, and laid out the table and the chart at a new height.

`useResultsLayout.test.tsx` holds the release at 390 by 1000, and that a move renders nothing: a sheet let go 48px under the top covers the whole map, one let go 60px over the cap falls back to the cap, the next drag brings it down from where it stands, a double press puts it at rest, Chart lifts only to the cap and keeps full screen once it is there, Both fills with the table, and a desk never reaches it. `resultsSheet.test.ts` holds the release rule and that the band between the cap and the top is wider than the snap. `fullScreen.spec.ts` drags the sheet to the top at 390x844 in the browser suite.

## Alternatives rejected

- **A detent at the cap that a further pull flips past:** a gesture rule the menu sheets do not have, and a detent the reader cannot see feels like a stuck handle.
- **A free drag to the top with no snap:** a sheet held a few pixels under the top leaves a sliver of map with no rows over it.
- **Holding a release anywhere between the cap and the top:** the rows and the button would stand over the sheet's bar there.
- **Hiding the rows, the Analyze button and the player while the sheet stood over them** (`invisible`, this PR's first cut): the maintainer asked why the sheet did not simply slide over them, as it already did over the scale and the credit (2026-10-31).
- **A height per move, as before:** two renders of the app and a layout of the table and the chart on every move, 68.1 ms of work per move on a Table at four times slower.
- **The browser's Fullscreen API:** it needs a button and a string of its own, and iPhone Safari is not known to offer it for anything but video (not verified).
- **Lifting Chart to full screen when it is picked:** the maintainer asked for full screen never to be a default.

## Consequences

A drag draws the sheet at its tallest once, so the drag's first frame is its one slow one. The foot rides a CSS variable rather than its lift while a drag lasts, so anything new that stands on the sheet's edge has to read `--sheet-shift` too. An inert foot puts the message badge's live region out of reach at full screen; a run that fails still opens the Messages sheet, which stands outside it. A release still lands where it lands, with no animation to its stop.
