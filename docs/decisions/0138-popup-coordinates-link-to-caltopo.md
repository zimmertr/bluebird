# 0138. A popup's coordinates link to CalTopo, centred on the point at the map's zoom, with no layer named

- Status: Accepted
- Date: 2026-10-14
- Decider: TJ (#712)
- Issues and PRs: #712
- Cited in code as: #712
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/caltopoUrl.ts` bullet and the `factsRow` clause of the `src/utils/popupChrome.ts` bullet

## Context

The coordinate pair on a map popup was the one fact on the card that named a place and went nowhere: the arrow by the name opens Peakbagger or OpenStreetMap, every number opens Windy, and a reader who wanted the terrain around the point copied the pair into another app by hand. TJ asked for the pair to open CalTopo (2026-10-13).

## Decision

Both popups, a ranked destination's and a clicked peak's or lake's, link the pair to `https://caltopo.com/map.html#ll=LAT,LON&z=Z`, built by `caltopoUrl` in `frontend/src/utils/caltopoUrl.ts`. The URL is the bare centring one: it names no base layer and no overlay, so whatever the reader's own CalTopo settings choose is what they land on. `Z` is the map's zoom at the moment the card is drawn plus one, rounded, so the reader lands on the view they were looking at; the two map modules hand `map.getZoom()` to the popup builders. The elevation beside the pair stays plain: it is a measurement, not a place.

## Evidence

Measured against the live site on 2026-10-14, because CalTopo publishes no reference for the grammar:

- Opened at `#ll=46.85230,-121.76030&z=14`, CalTopo centred its crosshair on 46.85233, -121.76027 and its zoom badge read Z14, then cleared the hash. CalTopo's training page on blank maps writes the key as `lI`, a typo on the page.
- At Z14 CalTopo's scale bar drew 500 m across 77px, 6.5 m per pixel at 46.85° N. CalTopo counts zoom on 256px tiles and MapLibre on 512px ones, so that view is MapLibre's zoom 13: the offset is one level, `CALTOPO_ZOOM_OFFSET`.
- The link wears `popupLink`'s `LINK_COLOR` (sky-700), which measures 5.42:1 on the result card's slate-100 header band and 5.74:1 on the clicked feature's white (measured for #365 and #700), so it clears AA where it lands.

## Alternatives rejected

- Sending `b=mbt` (MapBuilder Topo) or any layer key: TJ, 2026-10-14, "I don't see why we should force them to use a specific map layer". The reader's settings decide.
- A fixed zoom: both build sites already hold the map, so passing its zoom is one field per call, and TJ wanted the view carried over (2026-10-14).
- Linking the elevation too: it is not a place.

## Consequences

`caltopoUrl.test.ts` pins the URL, the offset and the rounding; the facts-line test in `popupChrome.test.tsx` pins that the pair is the only link on the line and that the line's text does not move; `resultPopup.test.ts` and `poiPopup.test.ts` pin the link on each card. A change on CalTopo's side breaks the link silently, as one on Windy's would, and the head comment of `caltopoUrl.ts` carries the measurement date so it can be re-measured.
