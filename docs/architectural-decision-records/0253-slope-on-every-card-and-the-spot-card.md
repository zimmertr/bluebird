# 0253. Every card that names a place says its slope, one module opens them all, and a click on bare map opens the spot's

- Status: Accepted; amends [0123](0123-popup-grid-and-scroll-cap.md) (the facts under the name are two lines); extended by [0266](0266-every-card-is-a-stack-of-foldable-layer-sections.md) (the spot card's sections are every card's, the hazards' among them, each folding on its chevron)
- Date: 2026-10-31, revised 2026-11-03 before it shipped
- Decider: the maintainer (TJ), on #832
- Issues and PRs: #832; builds on #799 (PR #823) and #737 (record 0165). PR #835 built a point forecast on a right-click card and was closed for this; PR #845 ships it
- Cited in code as: #832
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/destinationCard.ts`, `src/utils/pointReadout.ts` and `src/utils/slopeAngle.ts` bullets; [`frontend/src/utils/popup/CLAUDE.md`](../../frontend/src/utils/popup/CLAUDE.md), `groundFact.ts` and `popupChrome.ts`; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `mapPopups.ts`, `destinationCards.ts`, `gridHeads.ts`, `groundReadings.ts`, `resultsLayer.ts`, `poiPopup.ts` and `terrain.ts` bullets; [`USAGE.md`](../USAGE.md), Click a destination; [`DATA.md`](../DATA.md), Mapterhorn

## Context

The map answered a click only on a label or a ranked marker. A col, a camp or a point on a ridge had no way in, and no card said anything about the ground. #823 put Mapterhorn's elevation in the browser for the Slope angle layer, so the ground under any point can be read without a request of the app's own.

PR #835 built the issue as written: a right-click card with the spot's forecast, fetched as the card opened. Built and working, it raised a question the maintainer asked on 2026-10-31: does a forecast for one point, compared with nothing, belong in an app whose job is to rank places? `Add to analysis` already forecasts a point, ranked beside the field, for that one location's fetch, since the browser reuses the forecasts it holds.

Carrying the ground onto every card then showed how the cards were built. A ranked marker, a pending dot, a clicked label and the right-clicked spot each had a builder of their own in three files, each with its own header, its own button attribute and its own idea of what a place is, and each map module opened, redrew and answered its card its own way. The first redraw added for the ground left the ranked card's grid heads unarmed, a bug only that card could have, and the pending card offered its remove on one kind of destination because the table's row did. The maintainer's direction on 2026-11-03: the whole flow, click, identify what was clicked, open the card, offer the way in or out, show the data, is one object in the source, not one per mechanism.

## Decision

The point forecast goes. The ground stays, every card that names a place reads it, and one module opens them all.

- **One subject type and one builder for every card that names a place** (`utils/destinationCard.ts`): a ranked row, a pending destination, a basemap label or a spot. Every header is the result card's band: the name and its link out, the coordinates alone, then the type, the elevation and the slope, `Peak · 7,211 ft · [swatch] 33° NW`. What differs between the four is what is known, not how it is drawn.
- **One map module opens, redraws and answers them** (`map/destinationCards.ts`). The layer that draws a thing still resolves the click into a subject, since only it can read its feature; everything after that is shared: the fit, the owner on the board, the ground's redraw, the state outlines' redraw, a resized grid column's redraw, the rank following a new ranking, and the one button. A card is redrawn without taking focus and keeps its cap and scroll, since a redraw answers something done elsewhere.
- **A click on bare map opens the spot's card**, the same left click every marker and label answers. The right-click and the long press are gone: a reader trained to click a marker never finds a second gesture, and a gesture the map has to explain is a gesture most readers never use. While any card is open, a click on bare map only closes it, so dismissing a card does not open another, and so does a click on a fire's perimeter, a closure or a smoke plume (`ground` on the target's registration, 2026-11-04), which cover the map for miles and open the spot's card as bare map does: under a plume every click opened the next card and none dismissed one; Shift opens the spot beside the rest, as it does any card. Nothing opens while the ring is drawn. The card's title is the coordinate pair at five decimals, its glyph opens CalTopo there (`Open in CalTopo`), and under it is the ground, `8,412 ft · [swatch] 38° NE`, the height being the tile's since a bare point has no other. **Add to analysis** registers the spot as a pasted coordinate is, kind `coordinates`, and the next Analyze forecasts it.
- **The rain radar and the snow depth are sections of the spot's card** rather than a card of their own (record 0165's `pointCardHtml` is gone). Each section opens on its layer's name and what it reads there, `Rain radar: Weak radar echo`, `Snow depth: Glacier`, lists its values, and ends in the fine print that says where and when it was measured, `NEXRAD radar: 10 min ago`, the source in place of `Updated:` wherever a section names one (layout C1 of the mockups of 2026-11-03). The layer's name leads because the reading alone, `Weak radar echo`, did not say what it was a reading of (the maintainer, reviewing the build on 2026-11-03). A click where no picture painted opens the spot with no section.
- **A point's card stands on the three lines every card does** (2026-11-04). A pasted pair or an added spot has the pair for its name. Its card, and a spot's, has the pair as the title with the glyph that opens CalTopo, the pair again on the coordinates line, and `Coordinates`, the Type column's word for such a row, with the height and the slope (`pointFacts` in `utils/destinationCard.ts`). A point with no height of its own takes the ground's from the terrain tile, so a spot before an analysis and the same point after it say the same thing. This reverses the maintainer's call of 2026-11-03 to say the pair once: comparing a spot's card, an analyzed point's and two named places' side by side, the maintainer found the points' headers a line short, one with no type word and one with no height, and chose one layout at the cost of the pair standing twice. A title of `Dropped pin`, Google Maps' pattern, was declined because the table, the chart and the link name the point by its pair, and two such cards open would share one title.
- **Slope and aspect stand on the ranked marker's card, the clicked label's card and a pending dot's card**, read at the destination's OpenStreetMap point. The elevation beside them stays OpenStreetMap's, which the forecast's wind and temperature are read at. The slope is the swatch of its band from 27 degrees, the whole degree under the angle, and one of the eight compass points.
- **Every kind of destination shows its reading**, summits included, though a summit's is mostly noise (Evidence). Flat ground reads `0°` with no compass point, since nothing falls any way.
- **A pending dot opens a card whenever no ring is drawn**: the ranked card's header with no rank and no grid, and **Remove from analysis** on every one, whatever named the destination. The press is the ranked row's ×, a removal the Removed list can restore, and the table's pending rows carry the same × on every row, where they carried it on a searched place alone. The pending row's name in the table opens the same card, as a ranked row's opens its marker's.
- **The ground is read from the finest Mapterhorn tile under the point**, zoom 16 falling back to 12, not from the tile at the map's zoom, so a card names one slope for a point however far out the reader is. A coarser tile reads the slope gentler, the difference between 27 and 35 degrees on avalanche ground. Zoomed out, the Slope angle layer under the pointer is painted from the coarser tile and can show a gentler band than the card. The maintainer chose this over matching the paint, 2026-10-30.
- **A point is read once a session**, by one reader every card shares, off the one elevation source the terrain rows load. The cold load still asks for no elevation; the first card that opens loads it.
- **Mapterhorn is credited in the map's corner from the map's load.** Its elevation is CC BY 4.0, and the terrain sources carry the credit only while a terrain row is drawn. An empty source carrying the same credit, with a layer that draws nothing, is added when the map loads, because MapLibre credits a source only while a visible layer uses it, and any card may read the tiles at any time. It stood only while a card was open until 2026-11-03, when the maintainer called the credit coming and going with each card a distraction. No new string.

## Evidence

Measured 2026-10-31 with the app's own reading (`groundAt` over Mapterhorn's tiles, finest zoom), at the 57 destinations the production places table returned for a box around Mount Rainier, reading each OpenStreetMap point and eight points 15 m from it:

- 36 summits: 27 read at least 15 degrees steeper somewhere within those 15 m than at the point, and 32 faced opposite ways. Whitman Crest reads 4° N at its point and 17° to 51°, NE or SW, around it.
- 14 trailheads: the reading swings by 18 degrees at the median.
- 7 lakes: five read exactly 0° with no direction.

The maintainer weighed that and kept the reading on every kind (2026-10-31).

In the mockup of 2026-10-31, drawn by the app's own popup code, the facts on one line measured 372 px with the slope beside a peak's elevation, past the 340 px card, and the line never wraps.

Before the one module, the ground's redraw was written three times, the remove was answered two ways, and the grid heads were armed at open only (#828): the first redraw added for the ground left them unarmed on every ranked card, which nothing but that card could show.

## Alternatives rejected

- The point forecast on the right-click card, fetched on open (PR #835, measured at about 210 ms for weather and cloud): a forecast with no comparison is another app's job, and Add to analysis gives the point the whole report for one press.
- A right-click or a long press for the spot (built, 2026-10-31): a second gesture a reader never discovers, where the left click already means "tell me about this".
- A card per mechanism, each module opening and redrawing its own: the maintainer's direction of 2026-11-03 was one flow in the source.
- The ground on the right-click card alone: the maintainer wanted it on every card.
- The slope in the facts line's one line (372 px), or on a line of its own under it, or the type on the title row: the mockups of 2026-10-31.
- Leaving summits' slope off, or lakes' line off: the maintainer kept both.
- The tile's height in place of OpenStreetMap's on a destination's card: the forecast is read at OpenStreetMap's, and one card states one elevation.
- `Remove from analysis` on a searched place's dot alone, as the table's row then offered: a pasted or found destination had no way out but editing its source. The maintainer chose the removal on every kind and the table's rows followed (2026-11-03).
- The radar and the snow on a card of their own beside the spot's (two cards at one click), or a card whose band named both sources with `Updated:` in its rows (record 0165's layout): one card with sections, the source and time in the fine print at each section's foot, the maintainer's pick among the layouts of 2026-11-03.
- The ground read at the map's zoom, to match the painted band under the pointer: the slope would change with the zoom and read gentler zoomed out.
- A section named for its reading alone, `Weak radar echo` over `Rate` and `Reflectivity` (the first build): the maintainer did not know which layer it spoke for, and the Layers menu's own row names, `Rain radar` and `Snow depth`, are the ones it leads with now.
- A `© Mapterhorn` line in the card: a new string, where the corner's credit says it already.
- The credit shown while a card is open: a flicker in the corner on every click (the maintainer, 2026-11-03).

## Consequences

A pending dot is a click target now, ranked after a ranked marker, and is left out of `DRAW_TARGETS`, so drawing a ring around one still places a corner.

`closeAll` on the popup board answers how many popups it closed, which is how a click on bare map knows it has done its job.

`PointSection` carries `layer` and `when` beside its rows, and the radar's and the snow's readers fill them rather than an `updatedLine` row; the layer is the row label the Layers menu shows, `RADAR_ROW_LABEL` and `SNOW_ROW_LABEL`, spelled once each. `registerContextMenu`, `pointCardHtml` and `BOTH_TITLE` are gone; `registerSpot` on `mapPopups.ts` is what the map's one bare-click opener registers through.

A ranked card's grid heads are armed by `gridHeads.ts` after every write of the card's markup, on every card, so a redraw cannot leave them dead again.

The browser suite waits for the ground to land before it measures a card (`popupFit.spec.ts`, `linkLook.spec.ts`), since the landing redraws the card and replaces every node in it.
