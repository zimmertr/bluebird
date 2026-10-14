# 0135. A phone opens on the map, with the search pill and two rows across its top and Analyze as a floating button at its foot

- Status: Accepted; amended by 0141 (the panel the summary chip opens is the Controls sheet, and the map's button is the one Analyze). Amends 0019 (on a phone Layers is a chip in the row under the search pill), 0034 (a searched place is framed for the sheet it is about to open, a sheet holding only pending rows shows the table alone, and a full sheet stops 88px under the chip row), 0035 (the camera's padding for a search is the resting lift of a sheet that is not open yet) and 0132 (the draw bar stands under the chip row, not at the foot).
- Date: 2026-10-14
- Decider: the maintainer (TJ), on issue #696: the drawer starts closed on a phone and the search runs across the map's top (round one, 2026-10-13), then the phone flow mockup approved 2026-10-14 (the search pill with the locate button at its right, three chips under it at 13px type and 12px padding, sheets from the bottom), and the same day Analyze as an extended floating action button, Material's form for a screen's one primary action, and the visible and hit sizes of the new chrome
- Issues and PRs: #696, #687, #708, #336, #693
- Cited in code as: #696
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `PhoneMapRows.tsx`, `PhoneFoot.tsx`, `MapStage.tsx`, `SearchBox.tsx` and `MapDrawBar.tsx` bullets; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useResultsLayout.ts` and `useDrawer.ts` bullets; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), `controls.ts`; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `analyzeGate.ts`, `controlsSummary.ts`, `resultsSheet.ts` and `layout.ts` bullets; [`docs/STYLES.md`](../STYLES.md), Phone chrome; [`docs/USAGE.md`](../USAGE.md), On a phone

## Context

On a phone, finding the forecast for one named place took five steps across three surfaces (TJ, on an Android phone, 2026-10-08). The drawer opened over the map at every width, so the search field the Destinations section named was under it. A picked place was framed for a map with no sheet, and the sheet then opened over its label. And the only Analyze was back inside the drawer the reader had just closed, with the cue that said so beside it.

## Decision

- **A phone opens on the map, a shared link included.** The drawer starts closed below the desktop breakpoint and open above it (`useDrawer`), read once at mount. A desktop is unchanged.
- **Two rows across the map's top** (`PhoneMapRows`, `MAP_ROWS`). The first is the search pill, with the map's own locate button in a round slot at its right (`placeLocate` moves the library's control there, so its states and its permission prompt come with it). The second is three chips, content-sized and left-aligned: the controls summary, `☰ Current · NOAA GFS`, which opens the drawer and names the When arm and the model (`controlsSummary`); Layers; and Legend, greyed until there is a key to show. The right end of the chip row is left empty. While the search has the keyboard the pill takes the whole first row and the chips step aside. The rows end 92px down, and every other anchor on a phone's top is built from that sum.
- **Analyze is an extended floating action button**, Material's form for a screen's one primary action (`PhoneFoot`, `MAP_FAB`): 56px tall, 16px off the right edge, a 16px corner, the label in the call to action's 14px semibold on `BUTTON_PRIMARY`'s accent fill, so the white label keeps record [0008](0008-accent-fill-sky-650.md)'s contrast. It is the panel's command and gate, not a second one: the same `handleAnalyze`, the same `analyzeGateFor` from the same inputs, greyed by the same `DISABLED`, reading `Analyzing…` while a run is on, and the analysis overlay keeps its progress and its Cancel. Its width is reserved for the wider of its two words by standing both in one grid cell, so it never resizes as a run starts and ends. It is always on a phone's map, a report on screen included. No icon: nothing in `icons.tsx` says "run this" without meaning something else on the same screen.
- **Two things move the button, and nothing else**, Material's rule for a floating button beside sheets and snackbars: the results sheet, whose top edge it rides 16px above at every height, and the notice band (record [0140](0140-phone-notices-on-the-map.md)), above which it rises by the band's height plus 8px while the band holds a notice (`fabBottomPx`). It never rises over the chip row: a notice over a sheet dragged high goes under it. It hides while a modal bottom sheet is open (record [0136](0136-phone-menus-are-bottom-sheets.md)), Material's rule for a floating button under a modal sheet, and comes back when the sheet closes.
- **A full sheet stops 88px under the chip row** (`DRAGGED_MAP_PX`, 92 + 16 + 56 + 16), so the button keeps a strip of map to stand on. While the reader has the forecast player on, the sheet also leaves the player its 88px over the button (`PLAYER_ROOM_PX`), since the player now stands on the button rather than on the sheet; where it still has no room it steps off rather than standing over the chips (`transportFits`).
- **The draw bar stands under the chip row** (`MAP_ROWS.drawBar`, 8px under it), so every chip and the button stay in reach while a ring is drawn, and the foot stays the notices' and the button's.
- **Seen at one size, pressed at another.** On a coarse pointer every new piece of chrome is a 44px target, the way Material's chips take their 48dp, by an invisible area in its role and never a `touch:` utility at a call site: a chip is 32px seen and 44 pressed (a pseudo-element 6px above and below it), the locate button 40 seen and 44 pressed (a rim `map.css` puts on the library's button), and the pill 40 seen with its field 44 pressed. Sheet rows are 44 and the button 56, both over the floor already. The drawer keeps its own sizes.
- **No zoom buttons on a coarse pointer**, since a pinch zooms; the compass stays at the top right, under the rows. A compact credit stands at the bottom left beside the scale.
- **A searched place is framed for the sheet it is about to open** (`sheetPadBottomPx`), and **a phone sheet holding only pending rows shows the table alone** (`heldResultsMode`) without writing the reader's saved mode.

## Evidence

Measured 2026-10-14 in the Playwright image's Chromium (its system face, not a Mac's) against the built image on a coarse pointer:

- The chips: the summary 169.4px, Layers 65.0, Legend 69.4, 6px apart, 315.8 in all, the same at 360, 390 and 430 wide. The row has 336, 366 and 406, so its empty right end is 20.2, 50.2 and 90.2px. The summary's words fit whole (121px of 121).
- The button: `Analyze` 52.9px and `Analyzing…` 80.1px at 14px, so the button is 120.1px wide in both states, measured reading each.
- The hit areas: a press 5px above or below a chip lands on the chip; a press 1px outside the locate slot lands on the locate button; the pill's field is 44px tall in a 40px pill.
- The mockup measured the same chips at 289px in Chrome on the maintainer's Mac and `☰ Current · Meteo-France ARPEGE` at 355, so the longest model name truncates the summary by about 19px at 360 and fits at 390.

## Alternatives rejected

- **Analyze in the chip row's right end**, under the locate button, which the first approved mockup drew: the maintainer chose the floating button, the standard placement, and the row's right end stays empty.
- **The search field at the top of the drawer:** the fly-to would happen behind the drawer, out of sight, and the phone would carry two search fields feeding one `registerPlace`.
- **An analysis run by the search pick itself:** it would narrow [0003](0003-analyze-is-spend-boundary.md), which the maintainer kept whole.
- **Analyze in the results bar:** out of place there, it costs the sheet's height, and it wraps the bar's second line.
- **A two-track grid of Controls, Layers, Legends and Analyze, and a legend that folds to a header on the map:** built first, then rejected by the maintainer for the mockup above.
- **The notice band on the sheet's edge, over the scale and the credit**, as the mockup drew it: the credit line is a licence term, so the band stands just above that corner and the button rises over the band.

## Consequences

`MapStage` renders `PhoneMapRows` and `PhoneFoot` on a phone and works out the button's place from the sheet's lift and the band's measured height; `useResultsLayout` publishes `mapPx` and takes `playerOn`; `addControls` takes a `touch` flag and returns the locate control. The phone's Both threshold moved from 652 to 552px of viewport, since the drag floor it reads went from 412 to 312 with two grips. Two Analyze buttons share a name on a phone, one inert inside the closed drawer, so a browser test there picks it through the main landmark. A phone browser suite for the whole flow still waits on #693.
