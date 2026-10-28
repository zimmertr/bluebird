# 0234. The relief, the contours and 3D are three layers on one elevation model, loaded the first time one is on

- Status: Accepted
- Date: 2026-10-27
- Decider: the maintainer (TJ), on #799: Mapterhorn as the elevation, the layers as Layers rows, and 3D as a button of the map's own rather than a row (2026-10-27). The paint, the intervals, the zoom cap and the lazy load were the implementer's, measured as below.
- Issues and PRs: #799
- Cited in code as: #799
- Guide: [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `terrain.ts` and `controls.ts` bullets

## Context

#799 asked for contour lines, shaded relief and a 3D view over the basemap. All three need elevation, which the app had none of, and the cold load carries a Lighthouse script budget (620,000 B against a 563,835 B baseline) and a promise that it asks no third party for anything it was not asked for.

## Decision

- One elevation model, Mapterhorn's Terrarium tiles at 512px (`DEM_TILES` in `utils/terrainSources.ts`), read as `terrarium`, never MapLibre's default `mapbox`, which reads them as wrong heights without failing.
- Nothing is added on load. The first time the relief, the contours or 3D switches on, `map/terrain.ts` loads `maplibre-contour` with a dynamic import, a chunk of its own, and every elevation tile after that goes through its cache (`sharedDemProtocolUrl`), so a tile two layers need is fetched once. A switch turned off hides its layers; with all three off MapLibre asks for no tile.
- The relief and 3D read the same tiles from two sources, `dem` and `dem-terrain`, because MapLibre takes over the tile size of the source it stands the map on and a relief on that source blurs one zoom while 3D is on. MapLibre warns about the shared source for the same reason.
- The sources ask for nothing past zoom 12 and stretch those tiles further in.
- The contours are in feet: 1,000 at zoom 10, 500 at 11, 200 at 12, 100 at 13 and 40 from 14, every fifth an index line labelled with its height in feet and nothing else.
- The relief is `standard` at 0.3, a brown shadow (`#5c4a32`) and a white light at 45%, under the app's `ofm-` layers and the style's first label.
- 3D is the map's own button, `3D`, named `3D terrain`, under the compass at a desk and at the end of a phone's chip row. It turns a flat map to 45 degrees and lays it flat again keeping the heading; `maxPitch` stays MapLibre's 60. Its exaggeration is 1. The link carries it as `terrain`; pitch and bearing stay out of the link.

## Evidence

- Mapterhorn's `tilejson.json` (fetched 2026-10-27) publishes `encoding: terrarium`, `tileSize: 512` and no maxzoom. Probed the same day: zoom 12 answers over Rainier, the Sahara, Kazakhstan, Antarctica, the Amazon and the Himalaya; zoom 13 answers over Rainier and 404s over all five others; zoom 14 404s over Rainier. Open ocean 404s at every zoom from 8. Tiles carry `cache-control: public, max-age=604800`.
- maplibre-contour 0.1.1 registers both schemes with maplibre-gl 6.14's `addProtocol`, which hands it an AbortController, the promise form it detects. Drawn over Rainier and the Alpine Lakes at zooms 8 to 15 (2026-10-27), in a headless Chromium on the built image.
- The relief: MapLibre's defaults (black and white at 0.5) turned the map grey; `igor` and `multidirectional` read as heavy as `standard` at the strength that showed the valleys; a full-strength white light washed Liberty's woods to the colour of its grass. 0.25 and 0.35 bracketed 0.3.
- 3D at 1 and at 1.2 over Rainier and the Alpine Lakes at zoom 11 and 45 degrees read the same.
- The cold load of the built image asked `tiles.mapterhorn.com` for nothing and loaded no contour chunk; the relief and contours on asked it 18 times at 1440 by 900 over Rainier at zoom 11. With all three switched off again, two pans asked it nothing. The chunk is 28.9 kB, 9.9 kB gzipped.

## Alternatives rejected

- **A zoom cap past 12**: a region with no national survey would draw holes, and nothing showed MapLibre or the contour library falling back cleanly on a 404 tile.
- **One source for the relief and 3D**: the relief drawn one zoom coarser while 3D is on, and a MapLibre warning on every switch.
- **Two fetches of the same tiles**, the relief through MapLibre and the contours through the library: the HTTP cache would answer most repeats, but a first view would download each tile twice.
- **Loading the contour library only for the contours**: the relief and 3D would then fetch outside its cache, the case above.
- **3D as a Layers row**: it changes how the whole map is seen rather than adding a picture to it (the maintainer, 2026-10-27).
- **Metres for the contours**: every height in the app is in feet.

## Consequences

- `map/terrain.test.ts` holds the first-switch load, the `terrarium` encoding, the stack under the labels, the two sources, the pitch both ways and the interval table; `e2e/terrain.spec.ts` holds the cold load to no elevation request and no contour chunk.
- `map/terrain.ts` owns its colours and paint numbers (`value-hex`, `map-paint-named`).
- On a phone the 3D button takes the chip row's right end, which was the map's, and the summary chip gives way to it.
- Mapterhorn keeps each request's address, referrer and user agent for up to 30 days; nobody who leaves the three switches off sends it a request.
