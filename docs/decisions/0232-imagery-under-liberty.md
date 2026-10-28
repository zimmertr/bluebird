# 0232. Satellite imagery is two rasters under Liberty, and Liberty's ground fades by opacity

- Status: Accepted
- Date: 2026-10-27
- Decider: the maintainer (TJ), 2026-10-27, on issue #799: the imagery providers, USGS and EOX, as the brief for the work records the call
- Issues and PRs: #799
- Cited in code as: #799
- Guide: [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), `overlays/imagery.ts`

## Context

The map had one look, Liberty, and no imagery. Liberty is load-bearing: `enhanceBasemap` patches its layers into the clickable peaks, lakes and places, and `lakeAnchor` finds a clicked lake's outline with `queryRenderedFeatures` on its `water` fill. A raster style in its place would drop every clickable destination without an error. And every imagery source on offer either needs a key, covers one country, or is coarse.

## Decision

- **Two raster sources, one picture, under Liberty.** EOX's Sentinel-2 cloudless mosaic everywhere, to z14, and USGS's NAIP photography over it from z13 to z16 inside `[-180, -15, -64, 72]`. Both go directly above Liberty's `background` and under every other layer of the style, so the roads, the trails, every label and the app's `ofm-*` layers stay on top. Contour lines inserted under the style's first symbol layer land over the imagery, so the hybrid look is Satellite and Contours together, not a mode of its own.
- **Added the first time the Satellite row switches on, never on load,** and hidden with `visibility: none` when it switches off. A hidden raster layer fetches nothing and is never queried.
- **Liberty's ground fades by opacity, never by visibility.** While the row is on, the background, the Natural Earth relief, every vector fill but the road areas, the buildings in 2D and 3D and the river lines go to opacity 0, and come back to the value each had. `water` keeps `visibility: visible`, because `queryRenderedFeatures` skips a hidden layer and keeps a transparent one, so a clicked lake keeps its outline. Roads, paths, rail, boundaries, park outlines and every symbol stay.
- **The Satellite row never greys.** EOX covers the world, so the layer always has something to draw (record [0117](0117-layers-grey-outside-coverage.md) greys only a row with nothing to draw).
- **Credited in the map's corner, with no legend section.** Each source carries its provider's credit as its `attribution`, the way Liberty's tiles carry theirs. The imagery keys no colour, so a legend section would be a credit alone.
- **A failed tile host is asked again on `online`** through `recovery.ts`, by `refreshTiles` on both sources. A 404 is not a failure: MapLibre leaves the tile empty and fires no error.

## Evidence

Measured 2026-10-27, by fetching tiles at named places and comparing them.

- **USGS's cache, by zoom.** z16 is the last level; z17 answers 404 everywhere. z8 and under is a coarse world mosaic, not NAIP. z9 to z12 answer an opaque white 256px JPEG (2,419 bytes) over British Columbia, Ontario and Sonora, and a half-white one where the coverage edge crosses a tile. From z13 the edge tile is a PNG with transparent pixels where there are no photos, the tile past it a fully transparent PNG, and further out a 404. So a USGS source below z13 paints white over Canada and Mexico, and from z13 it does not.
- **USGS's extent.** The service metadata states the whole Web Mercator world. Tiles were found over every state, Puerto Rico, the Virgin Islands, American Samoa, Guam and the Aleutians west of the antimeridian. Over the Alps at z14 a screen asked USGS for 30 tiles, every one a 404, each logged in the console. With the bounds it asks for none.
- **What a 404 looks like.** In Chromium over British Columbia at z14, USGS's tiles answered 404 and the EOX picture showed through with no seam or blank. At the BC border at z13 the one visible mark is a straight tile edge where USGS stops and EOX's colours differ.
- **EOX's detail, by zoom.** Over a forest and a town in Washington, a range in British Columbia and the Alps: a z14 tile differs from its z13 parent, stretched, by 8.7 to 12.6 RMS of 255; a z15 tile from its z14 parent by 1.7 to 3.2; a z16 from its z15 by 1.4 to 2.3. The mosaic's detail runs out at z14, so the source stops there and the map stretches it.
- **Liberty's layers.** The style served on 2026-10-27 has 111 layers. 21 fade: `background`, `natural_earth`, `park`, `landuse_residential`, `landcover_wood`, `landcover_grass`, `landcover_ice`, `landcover_wetland`, `landuse_pitch`, `landuse_track`, `landuse_cemetery`, `landuse_hospital`, `landuse_school`, `waterway_tunnel`, `waterway_river`, `waterway_other`, `water`, `landcover_sand`, `aeroway_fill`, `building`, `building-3d`. `imagery.test.ts` pins that list against the captured layer list in `overlays/fixtures/liberty-layers.json`.

## Alternatives rejected

- **Esri World Imagery.** The best global imagery, but its terms for keyless use outside Esri's own software are unclear without an ArcGIS account, and a key would break the rule that the app needs none.
- **MapTiler or Mapbox imagery.** Each needs a key.
- **EOX alone.** Global and keyless, but 10 m, too coarse to pick out a trail or a gully. USGS's 1 m photos are what make the layer worth switching on in the United States, where most of the app's readers plan.
- **USGS alone, greyed outside the United States** (the issue's recommendation). With EOX under it the row has something to draw everywhere, and a reader in the Alps gets a picture rather than a grey row.
- **USGS from z9, with `bounds` from its metadata.** The metadata's extent is the world, and from z9 to z12 the white filler paints over EOX across Canada and Mexico. Below z13 a screen pixel is already coarser than EOX's 10 m, so starting at z13 loses nothing.
- **`visibility: none` on Liberty's fills.** Simpler to undo, but `lakeAnchor` would lose the lake's outline, the same failure `drawRing.ts` documents.
- **Removing the sources on switch-off**, as the radar and snow layers do. Those are renders their hosts make per request; the imagery is a static cache, and keeping the hidden layers lets a second switch-on draw from tiles already held.
- **A legend section crediting USGS and EOX.** The six layers credited in the legend each key a colour beside their credit; the imagery keys nothing, and is credited where Liberty's tiles are. It would also need new strings.

## Consequences

`imagery.test.ts` holds the fade, the stacking, the zoom limits, the bounds and the recovery. The cost is in the corner: the two credits are long, and at a desk the credit line grows from one line to two or three while the layer is on, so the controls over it move up. Guam, the Northern Marianas and the western Aleutians get EOX's 10 m picture though USGS has photos there. The fade reads each layer's type, source and source layer rather than its name, so a layer Liberty adds or renames fades by the same rule; a source renamed upstream (`openmaptiles` or `ne2_shaded`) would stop the fade without an error, and the fixture, being a copy, would not show it.
