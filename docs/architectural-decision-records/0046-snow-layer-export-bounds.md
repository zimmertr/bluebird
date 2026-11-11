# 0046. The snow depth layer is a bounded ArcGIS export

- Status: Accepted
- Date: 2026-09-17 (git: the merge of #452)
- Decider: TJ (git: author and merger of #452)
- Issues and PRs: #446, #452
- Cited in code as: #446
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `src/utils/snowDepth.ts` bullet

## Context

The NOHRSC snow depth service has no cached tiles (`singleFusedMapCache` is false and it advertises no Tilemap), refuses caching (`max-age=0, must-revalidate`), and renders every image on request.

## Decision

The layer is an ArcGIS `export` call driven as a raster source through MapLibre's `{bbox-epsg-3857}` token, with `imageSR=3857`. Three things bound its cost: a 512 px tile, the extent as the source's `bounds`, and `SNOW_MAX_ZOOM`, past which the 1 km grid has no more detail. The legend colours are NOAA's, decoded from the legend endpoint's swatches, because the map draws NOAA's rendered image.

## Evidence

A render costs about 0.46 s whatever its size. Measured 2026-09-16: 11 renders fill a 1440x597 map, and 4 to 6 more come with each full-width pan, at 200 to 255 ms each; a 402x874 phone pays 6 and 0 to 3.

## Alternatives rejected

- The service's own EPSG:4269: an image in it does not sit on a Web Mercator map.
- Smaller tiles: each render costs the same whatever its size.
- Zoom past the 1 km grid: no more detail, so MapLibre magnifies what it holds.

## Consequences

The first band is transparent in NOAA's own paint, so the ramp has eleven blocks, not twelve. The strip goes through `legendRamp.ts`, the same builder the metric key uses.
