# 0239. Slope angle is painted in the browser from the shared elevation, in CalTopo's bands, at half strength under the contours

- Status: Accepted
- Date: 2026-10-28
- Decider: the maintainer (TJ), on #799, 2026-10-28: a slope angle layer like CalTopo's, the row named `Slope angle`, and CalTopo's bands, with black from 51 degrees; the legend header `Slope angle (Mapterhorn)`, credit included. The way the tiles are made, the alpha and the stacking were the implementer's, measured as below, for review on the pull request.
- Issues and PRs: #799, #823
- Cited in code as: #799
- Guide: [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `slope.ts` bullet; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `slopeAngle.ts` bullet
- Related: 0235 (the relief, the contours and 3D on one elevation model, loaded on first use), 0050 (every strip in the legend blends)

## Context

The maintainer asked for slope angle shading after seeing CalTopo's: each cell's steepness painted in the avalanche bands, over the base map. The elevation the relief and the contours draw from was already loading in the browser, through the contour library's cache.

## Decision

- **CalTopo's bands, which are the avalanche world's**: 27 to 29 degrees yellow, 30 and 31 orange, 32 to 34 red, 35 to 45 purple, 46 to 50 blue, 51 and steeper black, nothing under 27. Each band holds its lower edge, so 50.9 is blue. CalTopo writes the top two as `46-50` and `50+`, and its black starts past 50, so black starts at 51 here (the maintainer, 2026-10-28). The colours are the pure hues (`#ffff00`, `#ffa500`, `#ff0000`, `#a020f0`, `#0000ff`, `#000000`) in `utils/slopeAngle.ts`, which the raster and the legend both read.
- **Painted in the browser from the shared elevation.** `map/slope.ts` registers a URL scheme, `bluebird-slope://`, beside the contour library's, and MapLibre asks it for 512px raster tiles. Each tile reads its elevation tile and the four that touch its edges through the library's `getDemTile`, from the cache the relief and the contours fill, decoded in the library's worker. A tile two layers need is fetched once.
- **Central differences at the row's own ground spacing.** A pixel's slope is the height one pixel east less one west, and north less south, over two pixels of ground, where a pixel's ground is the Mercator width times the cosine of its row's latitude. Read per row, since the latitude moves down a tile.
- **No seams.** A pixel on a tile's edge reads its outer neighbour from the next tile's edge row or column. Where there is no next tile (past the poles, or open ocean, which has no tile), the edge carries its own slope on, which is a one-sided difference.
- **On the main thread**, handed to MapLibre as an ImageBitmap.
- **Half strength**, as `raster-opacity`, over opaque band colours.
- **Over the relief, under the contours**: directly under the contours' casing, the lowest of their layers, so the bands read over the shading and the photos and the lines and their heights stay on top. Under the style's first label and every `ofm-` layer like the rest of the ground.
- **Added the first time the row is on, hidden when it is off, nothing on load**, the rule 0235 set for the ground. The source stops at zoom 12, the elevation's cap, and MapLibre stretches it further in. There is no zoom floor.
- **Keyed as one strip**, the six colours blended like every scale on the map (0050), with the degrees each band starts at inside it: `27 30 32 35 46 51`. The section reads `Slope angle (Mapterhorn)`, the credit linking Mapterhorn's attribution page, because every layer drawn from somebody else's data names them in its own section. The ticks needed one fix: two on neighbouring boundaries share a grid column, so every tick now stands in the strip's first row.

## Evidence

- **Cost per tile**, 2026-10-28, a 512px tile of synthetic terrain, medians of 50 after a warm-up: the band loop 3.6 ms and `createImageBitmap` 1.1 ms in headless Chromium; the loop 5.9 ms in Node. The decode, the larger half, is in the library's worker already.
- **Requests.** Over Rainier at zoom 12 with only the slope on, a 1,389 by 868 desk asked Mapterhorn for 16 tiles and a 390px phone for 12; zoom 13, stretched, 12 on each. The neighbours come out of the same cache, since a neighbour of one tile in view is another in view or in its margin.
- **The alpha.** Over Rainier and the Enchantments on Liberty and on the imagery: at 0.4 the yellow band went missing on Liberty's pale land; at 0.6 the purple and the blue hid the rock and snow under them. Painted at 0.5, measured as WCAG contrast of the painted pixel with the ground under it:

  | Band | On Liberty's land `#efece6` | On a dark forest `#3a4a33` |
  |---|---|---|
  | 27 yellow | 1.03 | 3.55 |
  | 30 orange | 1.31 | 2.33 |
  | 32 red | 2.29 | 1.23 |
  | 35 purple | 2.21 | 1.17 |
  | 46 blue | 3.13 | 1.24 |
  | 51 black | 3.84 | 1.66 |

  Lightness cannot carry all six on both grounds; the hue does. Painted, each band stands at least 24 in CIELAB (ΔE76) from the band beside it on either ground, and at least 44 from Liberty's land and 50 from the forest, but for black on the forest at 18. `slopeAngle.test.ts` pins the ratios.
- **The latitude.** At Rainier's 46.85 degrees a zoom-12 pixel is 13.1 m where the equator's is 19.1. Read with the equator's spacing, a 33-degree slope there reads 24 and paints nothing.
- **The legend.** In a desk's 224px card the strip is 202px and the closest two numbers, 46 and 51, stand 15px apart (8px in the 184px card it had before the fire key widened it); on a 360px phone's sheet the strip is 328px and they stand 36px apart. The section's name is one line at both, alone and under the snow, smoke and fire keys.
- **Low zooms.** Rainier's cleavers read black at zoom 12 and purple at zoom 10, as a pixel spans more ground. At zoom 9 the bands still pick out the steep ground over the Cascades.

## Alternatives rejected

- **Another provider's slope tiles.** A second source of heights under the map, with its own host, licence and credit, for a picture the elevation already in the browser can paint.
- **A second fetch of the elevation for the slope**, outside the library's cache: a first view would download each tile twice, the case 0235 rejected for the relief.
- **One-sided differences at tile edges, with no neighbours.** A slope there is a slightly different number, and a different colour where it sits on a band's edge, which draws a line along every tile boundary.
- **Tracing from the parent tile with a margin**, as the contours do with `overzoom: 1`. Each slope tile would be drawn from elevation half as fine, one zoom coarser than the tile itself.
- **A worker of the app's own.** The fetch and the decode are already in the library's worker; a second worker would take each tile's five grids across another thread and the picture back, for a 4 ms loop.
- **Encoding a PNG.** MapLibre takes an ImageBitmap from a scheme and draws it as it would a decoded image; a PNG would be encoded only to be decoded again.
- **A zoom floor**, as the fire detections have (0238). Zoomed out the bands thin rather than mislead, the relief and the contours have none for the same tiles, and a floor is a layer that goes blank with nothing saying why.
- **A hard-stopped strip in the legend**, one block per band. These bands are a classification, as NOAA's snow bands are, and 0050 already accepted a blend over a classification so that every strip in the box reads as one system.
- **Six chips in a row**, one per band. Six 14px chips and their numbers do not fit the card.
- **Over the contours.** The lines and their heights would sit under a colour.

## Consequences

- `utils/slopeAngle.test.ts` holds the bands, their edges, the spacing, the seams and the ratios; `map/slope.test.ts` the neighbours and the scheme; `map/terrain.test.ts` the first-use load and the stack in every order; `MapLegend.test.tsx` the strip and the credit.
- `utils/slopeAngle.ts` is a colour owner (`value-hex`).
- A cliff band or a gully narrower than two pixels reads gentler than it is, and the whole layer reads gentler zoomed out. `docs/USAGE.md` says so, and that it is no substitute for measuring a slope in the field.
- Black on a dark forest under the imagery is faint. Slopes of 51 degrees and more are mostly bare rock, which the imagery draws pale.
- The legend's name carries no unit, where every other scale's does (`Snow depth (in)`). The maintainer approved `Slope angle (Mapterhorn)` as it stands on 2026-10-28.
