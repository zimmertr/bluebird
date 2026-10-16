# 0161. Every popup that describes a thing is the card: the band, the notices, the body and the action

- Status: Accepted
- Date: 2026-10-16
- Decider: TJ, in the session that filed #738 (2026-10-16)
- Issues and PRs: #738, #741
- Cited in code as: #738
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `popupChrome.ts`, `closures.ts`, `smoke.ts` and `wildfires.ts` bullets; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `mapPopups.ts`, `drawRing.ts`, `poiPopup.ts` and overlay bullets

## Context

The destination card had four sections by #696: the name, its link-out glyph and the facts line on a slate band, then the warnings, the grid and one button, each ruled off by the header's edge. A ranked result wore it from #700 and a clicked basemap feature from #712 (record 0139). The fire, closure and smoke popups did not. Each built its own `<div>` from `POPUP_FACE` and `POPUP_TITLE_SIZE`: an emoji and the name in a `<strong>`, lines parted by `<br>`, a sky-400 text link (`View on NIFC map ↗`, `View closure order ↗`), and MapLibre's own padding around all of it, since they opened without the card's class. Pinned side by side on the map, the four kinds of thing a reader can click read as three kinds of card. Nothing stopped a new layer adding a fourth: the chrome exported the pieces a card is made of, and no check asked a popup to be the card.

## Decision

Every popup that describes a thing is `popupCard` in `utils/popupChrome.ts`, with four sections, each but the band left out when empty:

1. **The header band**: the name, its link out as the title's glyph, and the facts line under it.
2. **The notices**: amber lines under one ⚠️.
3. **The body**: a destination's grid, an overlay's lines.
4. **The action**: one centred button.

The overlays' copy, all approved by TJ on 2026-10-16:

- **No emoji.** The facts line names the kind in the Layers menu's own word, singular, then the one figure that identifies it: `Wildfire | 138,285 acres`, `Area closure | 4,210 acres`, `Trail closure | BACON CR 1060000`. A plume's is the satellite alone, `GOES-EAST`: under `Medium smoke` a `Smoke` read twice (TJ, 2026-10-16). An emoji was tried at the start of that line first and dropped: the destination card's facts carry none, a screen reader reads 🚫 as "prohibited", an emoji keeps its own colour on a line set to step back, and 🌫️ drew as a faint grey square on macOS.
- **The links are the title's glyph**: NIFC for a fire, the order's page for a closure that has one, none for smoke, which has no page. The text links went, and their words became the glyph's name for a screen reader (`aria-label="View on NIFC map"`, `"View closure order"`). The glyph is `aria-hidden` and its anchor had no name, so a destination card's link had read as a bare "link" since #712; TJ took the fix for every card in this change: `View on Peakbagger`, `View on Mountain Project` or `View on OpenStreetMap`, by the rule `destinationUrl` picks the site with. A card cannot link out unnamed: `popupCard` takes the link and its name as one value.
- **The body keeps the old lines**, less what moved to the band: the containment and `Last updated` for a fire, the forest and dates for a closure, `Observed` for smoke. `Traced from {satellite} imagery` went, the satellite being on the band.
- **A closure's notice is the order's type, where the region files one**: Region 3 or 4's `ClosureType` verbatim and bare (`Safety Closure`), and no line on a Region 6 order. Region 6's feed is fire closures alone and names the fire, so `Closed for: Wildfire (Little Giant Fire)` was shipped to the preview first and dropped: under `Little Giant Fire Closure` it said the order's name twice (TJ, 2026-10-16). TJ's condition for any line was that it come from the feed natively and never from matching two datasets, so it carries no link.
- **A fire and a plume carry no notice and no action.** The card is the hazard, and a warning on it would say it twice, which is the reason the destination card has no Wildfire row (TJ, 2026-09-14).

**One framework opens every card** (TJ, 2026-10-16: "applies all of these patterns and controls equally to everything that consumes it"). `openCard` in `map/mapPopups.ts` frames a card in `POPUP_CARD_CLASS`, measures it, caps a body too tall to stand whole above the results sheet, stands it on whichever side of its point shows more of it, and pans the map by the fit's move, for a fire, a closure, a plume and a clicked label exactly as for a destination. That fit was the result card's alone (`map/resultsLayer.ts`), so an overlay card opened wherever it was clicked and on a phone its band could stand under the search pill. A caller that flies the map itself takes the move instead (`pan: false`). The one popup that is not a card, the ring's remove-point button, is `openBare`.

Enforced three ways: `POPUP_FACE` and `POPUP_TITLE_SIZE` are no longer exported, so only the card sets them; `openCard` is the only way a card opens, and the TypeScript of `MapPopups` has no other; and the linter's `style-popup-card` check fails a `*PopupHtml` builder that never calls `popupCard`, and a `<strong>`, `<br>` or `<hr>` anywhere outside `popupChrome.ts`.

## Evidence

Measured 2026-10-16 against the Forest Service feeds `services/usfs_closures.py` reads: Region 6 named its fire in `FireName` on 12 of 13 active areas, 891 of 901 lines and 172 of 172 points. Regions 3 and 4 name no fire, and their `ordertype` values that day included `Safety Closure`, `Recreation Closure`, `Closure for Resource Protection`, `Fire Closure - Stage 3` and `Other Closure`. `ClosureType` already rode `/api/closures`; only the browser's `ClosureProps` lacked it.

The built image was shot on 2026-10-16 in Chrome on macOS at 1389 px in both themes: Kaiser Canyon (`Wildfire | 138,285 acres`), a Coconino area closure (`Area closure | 2,816 acres` over `Safety Closure`), the Little Giant area closure and the Three Queens and Ptarmigan trail closures (no notice once the fire line went), and a GOES-EAST plume; Mount Rainier's clicked-feature card was unchanged. On a 390 px phone the browser suite's new placement test taps an area closure 30 px under the chip rows: the build before the shared fit stood the card over them (the overlap the test asserts against), and this one hangs it clear below. The full browser suite (47 tests) passes.

## Alternatives rejected

- **Keep the emoji, in the title or on the facts line.** For the reasons above.
- **A button in the action section for the link** (`View on NIFC map`). Offered; TJ chose the title glyph, which is where a destination's link out is.
- **Keep the text links in the body.** The same.
- **No notice on any overlay card.** Offered as the default; TJ took the closure reason on the condition above.
- **Name the fire on Region 6, `Closed for: Wildfire ({FireName})`.** Built first; dropped as above.
- **`Closed for: Safety Closure`.** Chosen first, then dropped for the bare type once the fire line went: the amber section already says it is a flag, and `Closed … Closure` said closed twice.
- **`Smoke | GOES-EAST`.** Built first; dropped as above.
- **A test alone, with no lint check.** A test catches a builder that exists today; the check catches the next one in the editor.

## Consequences

`closurePopupHtml` takes the layer's kind, which the card names. A card whose body would be empty leaves it out rather than drawing an empty padded strip, which also applies to a destination card whose grid has no rows. A click on a fire or a closure now moves the map when its card would not stand whole, as a marker click always has. Rain radar and snow depth open no card at all, which #737 audits, and every card stays white in the dark theme, which #740 weighs.
