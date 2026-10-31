# 0253. A right-click or a long press opens a card for the spot under it

- Status: Accepted
- Date: 2026-10-30
- Decider: the maintainer (TJ), on #832
- Issues and PRs: #832, PR #835; builds on #799 (PR #823) and #828
- Cited in code as: #832
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/coordinatePopup.ts`, `src/utils/pointForecast.ts` and `src/utils/slopeAngle.ts` bullets; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `src/map/mapPopups.ts`, `src/map/coordinatePopup.ts`, `src/map/gridHeads.ts`, `src/map/slope.ts` and `src/map/terrain.ts` bullets; [`USAGE.md`](../USAGE.md), Click a destination; [`DATA.md`](../DATA.md), Mapterhorn

## Context

The map answered a click only on a label or a ranked marker. A col, a camp or a point on a ridge had no way in: the reader pasted its coordinates into the search box and ran Analyze to learn anything about it. Nothing under `frontend/src/` listened for `contextmenu` (2026-10-29).

## Decision

A right-click on the map, or a finger held still on it for 500 ms, opens a card for the coordinate under it. The gesture means "this spot" wherever it lands, over a marker or a label as over bare ground; a left click still opens the place's own card. The browser's menu is refused on the map and nowhere else. Nothing opens while the ring is drawn.

- **Header.** The title is the coordinate pair at five decimals. Its link-out glyph opens CalTopo at the point and the map's zoom, named `Open in CalTopo`. There is no copy button.
- **Add to analysis.** The button a label's card carries, through the same `onAddPoi` and `onRemovePoi`. The spot is registered as a pasted coordinate is, kind `coordinates`, rounded to the five decimals the title shows.
- **The forecast is fetched as the card opens** (the issue's option A, not a button). It uses the last analysis's window and model, or the panel's before any analysis. A failed fetch shows the line the panel already shows for that failure; a model without coverage shows the coverage sentence's first half alone. Air quality failing alone reads `N/A` in its cell.
- **The forecast's grid is the ranked marker's card's**, over the table's columns (`popupGroups`, `popupGrid`, `metricGrid`), with nothing marked as ranked, since the spot stands in no ranking. Its column heads drag and resize as a ranked card's do, and a column sized on either card is sized on both.
- **The ground** reads on the facts line as `8,412 ft · [swatch] 38° NE`: the elevation, then the slope and its aspect as one fact, the swatch in the slope's band and absent below 27°. The angle is the whole degree under it, so the number and the swatch agree at a band's edge. The aspect is one of the eight compass points. A layout with Elevation, Slope and Aspect as labelled rows in a section of their own stays the fallback, to be judged once this one is seen in the app.
- **The ground is read from the finest Mapterhorn tile under the spot**, zoom 16 falling back to 12, not from the tile at the map's zoom. The card names one slope for a spot however far out the reader is, and a coarser tile reads the slope gentler, which is the difference between 27 and 35 degrees on avalanche ground. Zoomed out, the Slope angle layer under the pointer is painted from the coarser tile and can show a gentler band than the card. The maintainer chose this over matching the paint, 2026-10-30.
- **Wind and temperature are read at the ground's elevation**, from the same tile the facts line reads, so the card states one elevation. Open-Meteo is never sent an elevation, so the request does not wait for the tile: its columns are kept and reduced again at the height once both are in. Where no tile answers, the spot is read at Open-Meteo's terrain height, as the forecast grid's points are.
- **Mapterhorn is credited in the map's corner while a card is open.** Its elevation is CC BY 4.0, and the terrain sources carry the credit only while a terrain row is drawn. An empty source carrying the same credit, with a layer that draws nothing, is shown while any card holds it, because MapLibre credits a source only while a visible layer uses it. No new string. The maintainer chose this over a credit line in the card, 2026-10-30.
- **The elevation loads once.** The card asks `terrain.ts` for the tiles the terrain rows load, so the card and the rows share one library chunk, one worker cache and one session's record of missing tiles. The cold load still asks for no elevation.
- **A card left open across a new analysis follows it**: a new window or model asks its forecast again, and new columns redraw its grid.

## Evidence

Measured 2026-10-30 in the maintainer's Chrome on bluebirdforecast.com, desk connection, `gfs_seamless`, Current window:

- The weather and cloud requests for one point, fired together: 424 ms for the first point, which opened a connection; 197 to 251 ms over 10 new points, median about 210 ms; 192 to 193 ms for one point repeated.
- Air quality was not timed: its host was on the address's daily limit. Its refusal took 184 ms.
- One point costs about 3.6 weighted calls: weather 1.6, cloud 1, air quality 1.

At those times a button would add a press to save under half a second, so the card spends on open. That makes the right-click the one map gesture that spends, an exception to record [0003](0003-analyze-is-spend-boundary.md)'s spend boundary that the maintainer accepted with option A.

The gesture's constants are the platforms' own: 500 ms is iOS's default long press (`UILongPressGestureRecognizer`), and 8 px is Android's touch slop. iOS Safari fires no `contextmenu` for a long press, so the map keeps its own timer. The right button opens on release because macOS fires `contextmenu` on the press, and MapLibre's right-drag rotates the map.

## Alternatives rejected

- A `Retrieve point forecast` button (option B): the measurement above.
- The coordinates as a facts line with the title naming nothing, and a copy button beside them: the maintainer, 2026-10-30.
- `View on CalTopo`, the wording the other cards' glyphs use: the maintainer chose `Open in CalTopo`.
- A right-click on a marker or a label acting as a left click on it: one meaning for the gesture.
- Open-Meteo's own terrain height for the forecast, as the forecast grid uses: the card would state one elevation and adjust to another.
- The ground read at the map's zoom, to match the painted band under the pointer: the slope would change with the zoom and read gentler zoomed out.
- A `© Mapterhorn` line in the card: a new string, where the corner's credit says it already.
- Grid heads that do nothing on this card: one grid, one behaviour.

## Consequences

The `map-popups-owned` and `map-drag-owned` checks already keep every `contextmenu`, `mousedown`, `mouseup` and touch listener in `map/mapPopups.ts`, so the gesture lives there and the card registers what it opens through `registerContextMenu`.
