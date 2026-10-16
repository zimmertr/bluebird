# 0161. Every popup that describes a thing is the card: the band, the notices, the body and the action

- Status: Accepted
- Date: 2026-10-16
- Decider: TJ, in the session that filed #738 (2026-10-16)
- Issues and PRs: #738
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

- **No emoji.** The facts line names the kind in the Layers menu's own word, singular, then the one figure that identifies it: `Wildfire | 138,285 acres`, `Area closure | 4,210 acres`, `Trail closure | BACON CR 1060000`, `Smoke | GOES-EAST`. An emoji was tried at the start of that line first and dropped: the destination card's facts carry none, a screen reader reads 🚫 as "prohibited", an emoji keeps its own colour on a line set to step back, and 🌫️ drew as a faint grey square on macOS.
- **The links are the title's glyph**: NIFC for a fire, the order's page for a closure that has one, none for smoke, which has no page. The text links went, and their words became the glyph's name for a screen reader (`aria-label="View on NIFC map"`, `"View closure order"`). The glyph is `aria-hidden` and its anchor had no name, so a destination card's link had read as a bare "link" since #712; TJ took the fix for every card in this change: `View on Peakbagger`, `View on Mountain Project` or `View on OpenStreetMap`, by the rule `destinationUrl` picks the site with. A card cannot link out unnamed: `popupCard` takes the link and its name as one value.
- **The body keeps the old lines**, less what moved to the band: the containment and `Last updated` for a fire, the forest and dates for a closure, `Observed` for smoke. `Traced from {satellite} imagery` went, the satellite being on the band.
- **A closure's notice says why it was closed**, from the order's own fields: `Closed for: Wildfire ({FireName})` where Region 6 names the fire, else `Closed for: {ClosureType}` verbatim, and no line where the order carries neither. TJ's condition was that the reason come from the feed natively and never from matching two datasets, so the line carries no link: an order names its fire but not where it is.
- **A fire and a plume carry no notice and no action.** The card is the hazard, and a warning on it would say it twice, which is the reason the destination card has no Wildfire row (TJ, 2026-09-14).

Enforced three ways: `POPUP_FACE` and `POPUP_TITLE_SIZE` are no longer exported, so only the card sets them; `create` in `map/mapPopups.ts` gives every popup the card class (`POPUP_CARD_CLASS`) unless it says it is `bare`, as the ring's remove-point button does; and the linter's `style-popup-card` check fails a `*PopupHtml` builder that never calls `popupCard`, and a `<strong>`, `<br>` or `<hr>` anywhere outside `popupChrome.ts`.

## Evidence

Measured 2026-10-16 against the Forest Service feeds `services/usfs_closures.py` reads: Region 6 named its fire in `FireName` on 12 of 13 active areas, 891 of 901 lines and 172 of 172 points. Regions 3 and 4 name no fire, and their `ordertype` values that day included `Safety Closure`, `Recreation Closure`, `Closure for Resource Protection`, `Fire Closure - Stage 3` and `Other Closure`. `ClosureType` already rode `/api/closures`; only the browser's `ClosureProps` lacked it.

The built image was shot on 2026-10-16 in Chrome on macOS, at 1389 and 500 px wide and in both themes: Kaiser Canyon, the Three Queens and Ptarmigan trail closures, the Little Giant area closure (`Closed for: Wildfire (Little Giant Fire)`), a Coconino area closure (`Closed for: Safety Closure`) and a GOES-EAST plume. Mount Rainier's clicked-feature card was unchanged.

## Alternatives rejected

- **Keep the emoji, in the title or on the facts line.** For the reasons above.
- **A button in the action section for the link** (`View on NIFC map`). Offered; TJ chose the title glyph, which is where a destination's link out is.
- **Keep the text links in the body.** The same.
- **No notice on any overlay card.** Offered as the default; TJ took the closure reason on the condition above.
- **Name only the fire, leaving Regions 3 and 4 without a line.** Offered; TJ asked for every reason an order states.
- **The type bare (`Safety Closure`) with no lead-in.** Offered; TJ chose `Closed for: …`, which reads as a sentence at the cost of `Closed … Closure`.
- **A test alone, with no lint check.** A test catches a builder that exists today; the check catches the next one in the editor.

## Consequences

`closurePopupHtml` takes the layer's kind, which the card names. A card whose body would be empty leaves it out rather than drawing an empty padded strip, which also applies to a destination card whose grid has no rows. An overlay card still opens at the click and does not move the map to fit, as it did before this change, so on a phone its band can open under the search pill; the destination card's placement (`placePopup`) is not yet shared with the overlays. Rain radar and snow depth open no card at all, which #737 audits.
