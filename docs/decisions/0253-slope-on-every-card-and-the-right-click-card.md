# 0253. Every card that names a place says its slope, and a right-click opens a card for the spot

- Status: Accepted; amends [0123](0123-popup-grid-and-scroll-cap.md) (the facts under the name are two lines)
- Date: 2026-10-31
- Decider: the maintainer (TJ), on #832
- Issues and PRs: #832; builds on #799 (PR #823). PR #835 built a point forecast on the right-click card and was closed for this
- Cited in code as: #832
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/coordinatePopup.ts`, `src/utils/resultPopup.ts` and `src/utils/slopeAngle.ts` bullets; [`frontend/src/utils/popup/CLAUDE.md`](../../frontend/src/utils/popup/CLAUDE.md), `groundFact.ts` and `popupChrome.ts`; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `mapPopups.ts`, `coordinatePopup.ts`, `groundReadings.ts`, `resultsLayer.ts`, `slope.ts` and `terrain.ts` bullets; [`USAGE.md`](../USAGE.md), Click a destination and The map's legend; [`DATA.md`](../DATA.md), Mapterhorn

## Context

The map answered a click only on a label or a ranked marker. A col, a camp or a point on a ridge had no way in, and no card said anything about the ground. #823 put Mapterhorn's elevation in the browser for the Slope angle layer, so the ground under any point can be read without a request of the app's own.

PR #835 built the issue as written: a right-click card with the spot's forecast, fetched as the card opened. Built and working, it raised a question the maintainer asked on 2026-10-31: does a forecast for one point, compared with nothing, belong in an app whose job is to rank places? `Add to analysis` already forecasts a point, ranked beside the field, for that one location's fetch, since the browser reuses the forecasts it holds.

## Decision

The point forecast goes. The ground stays, and every card that names a place reads it.

- **A right-click on the map, or a finger held still on it for 500 ms, opens a card for the coordinate under it.** The gesture means "this spot" wherever it lands, over a marker or a label as over bare ground; a left click still opens the place's own card. The browser's menu is refused on the map and nowhere else. Nothing opens while the ring is drawn. The title is the coordinate pair at five decimals, and its glyph opens CalTopo there, named `Open in CalTopo`. Under it is the ground, `8,412 ft · [swatch] 38° NE`, the height being the tile's since a bare point has no other. **Add to analysis** registers the spot as a pasted coordinate is, kind `coordinates`, and the next Analyze forecasts it.
- **Slope and aspect stand on the ranked marker's card, the clicked label's card and a pending dot's card**, read at the destination's OpenStreetMap point. The elevation beside them stays OpenStreetMap's, which the forecast's wind and temperature are read at.
- **A destination's facts are two lines under its name**: the coordinates alone, then the type, the elevation and the slope, `Peak · 7,211 ft · [swatch] 33° NW`. The slope is the swatch of its band from 27 degrees, the whole degree under the angle, and one of the eight compass points.
- **Every kind of destination shows its reading**, summits included, though a summit's is mostly noise (Evidence). Flat ground reads `0°` with no compass point, since nothing falls any way.
- **A pending dot opens a card whenever no ring is drawn**: the ranked card's header with no rank and no grid. It carries **Remove from analysis** where the table's pending row carries its ×, on a searched place alone; a pasted row leaves by the coordinates box and a found one by the ring that found it. The pending row's name in the table opens the same card, as a ranked row's opens its marker's.
- **The ground is read from the finest Mapterhorn tile under the point**, zoom 16 falling back to 12, not from the tile at the map's zoom, so a card names one slope for a point however far out the reader is. A coarser tile reads the slope gentler, the difference between 27 and 35 degrees on avalanche ground. Zoomed out, the Slope angle layer under the pointer is painted from the coarser tile and can show a gentler band than the card. The maintainer chose this over matching the paint, 2026-10-30.
- **A point is read once a session**, by one reader every card shares, off the one elevation source the terrain rows load. The cold load still asks for no elevation; the first card that opens loads it.
- **Mapterhorn is credited in the map's corner while any card that reads it is open.** Its elevation is CC BY 4.0, and the terrain sources carry the credit only while a terrain row is drawn. An empty source carrying the same credit, with a layer that draws nothing, is shown while a card holds it, because MapLibre credits a source only while a visible layer uses it. No new string.

## Evidence

Measured 2026-10-31 with the app's own reading (`groundAt` over Mapterhorn's tiles, finest zoom), at the 57 destinations the production places table returned for a box around Mount Rainier, reading each OpenStreetMap point and eight points 15 m from it:

- 36 summits: 27 read at least 15 degrees steeper somewhere within those 15 m than at the point, and 32 faced opposite ways. Whitman Crest reads 4° N at its point and 17° to 51°, NE or SW, around it.
- 14 trailheads: the reading swings by 18 degrees at the median.
- 7 lakes: five read exactly 0° with no direction.

The maintainer weighed that and kept the reading on every kind (2026-10-31).

In the mockup of 2026-10-31, drawn by the app's own popup code, the facts on one line measured 372 px with the slope beside a peak's elevation, past the 340 px card, and the line never wraps.

The gesture's constants are the platforms' own: 500 ms is iOS's default long press (`UILongPressGestureRecognizer`), and 8 px is Android's touch slop. iOS Safari fires no `contextmenu` for a long press, so the map keeps its own timer. The right button opens on release because macOS fires `contextmenu` on the press, and MapLibre's right-drag rotates the map.

## Alternatives rejected

- The point forecast on the right-click card, fetched on open (PR #835, measured at about 210 ms for weather and cloud): a forecast with no comparison is another app's job, and Add to analysis gives the point the whole report for one press.
- The ground on the right-click card alone: the maintainer wanted it on every card.
- The slope in the facts line's one line (372 px), or on a line of its own under it, or the type on the title row: the mockups of 2026-10-31.
- Leaving summits' slope off, or lakes' line off: the maintainer kept both.
- The tile's height in place of OpenStreetMap's on a destination's card: the forecast is read at OpenStreetMap's, and one card states one elevation.
- `Remove from analysis` on every pending dot: a pasted row would have its line deleted from the coordinates box by a map button, and a found one would need a removal its table row does not offer.
- The ground read at the map's zoom, to match the painted band under the pointer: the slope would change with the zoom and read gentler zoomed out.
- A `© Mapterhorn` line in the card: a new string, where the corner's credit says it already.

## Consequences

A pending dot is a click target now, ranked after a ranked marker, and is left out of `DRAW_TARGETS`, so drawing a ring around one still places a corner.

A ranked card is redrawn when its ground lands, which made a redraw that left the grid's heads unarmed visible (#828's heads were armed at open only). The heads are armed again after every redraw.

The `map-popups-owned` and `map-drag-owned` checks already keep every `contextmenu`, `mousedown`, `mouseup` and touch listener in `map/mapPopups.ts`, so the gesture lives there and the card registers what it opens through `registerContextMenu`.
