# 0253. A right-click or a long press opens a card for the spot under it

- Status: Accepted
- Date: 2026-10-30
- Decider: the maintainer (TJ), on #832
- Issues and PRs: #832
- Cited in code as: #832
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/coordinatePopup.ts` bullet; [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `src/map/mapPopups.ts` and `src/map/coordinatePopup.ts` bullets; [`USAGE.md`](../USAGE.md), Click a destination

## Context

The map answered a click only on a label or a ranked marker. A col, a camp or a point on a ridge had no way in: the reader pasted its coordinates into the search box and ran Analyze to learn anything about it. Nothing under `frontend/src/` listened for `contextmenu` (2026-10-29).

## Decision

A right-click on the map, or a finger held still on it for 500 ms, opens a card for the coordinate under it. The gesture means "this spot" wherever it lands, over a marker or a label as over bare ground; a left click still opens the place's own card. The browser's menu is refused on the map and nowhere else. Nothing opens while the ring is drawn.

- **Header.** The title is the coordinate pair at five decimals. Its link-out glyph opens CalTopo at the point and the map's zoom, named `Open in CalTopo`. There is no copy button.
- **Add to analysis.** The button a label's card carries, through the same `onAddPoi` and `onRemovePoi`. The spot is registered as a pasted coordinate is, kind `coordinates`, rounded to the five decimals the title shows.
- **The forecast is fetched as the card opens** (the issue's option A, not a button). It uses the last analysis's window and model, or the panel's before any analysis. A failed fetch shows the line the panel already shows for that failure; a model without coverage shows the coverage sentence's first half alone. Air quality failing alone reads `N/A` in its cell.
- **The ground** reads on the facts line as `8,412 ft · [swatch] 38° NE`: the elevation, then the slope and its aspect as one fact, the swatch in the band the Slope angle layer paints and absent below 27°. A layout with Elevation, Slope and Aspect as labelled rows in a section of their own stays the fallback, to be judged once this one is seen in the app.
- **Wind and temperature are adjusted to the ground's elevation**, from the same Mapterhorn tile the facts line reads, so the card states one elevation. The forecast and the ground wait for PR #823, which brings that tile.

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

## Consequences

The `map-popups-owned` and `map-drag-owned` checks already keep every `contextmenu`, `mousedown`, `mouseup` and touch listener in `map/mapPopups.ts`, so the gesture lives there and the card registers what it opens through `registerContextMenu`.
