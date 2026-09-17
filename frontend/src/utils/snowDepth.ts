/**
 * Snow on the ground, as one raster layer NOAA renders on request (#446).
 *
 * The source is the **NOHRSC National Snow Analysis**, the National Weather
 * Service's own snowpack analysis: a model of the snowpack constrained by
 * ground, airborne and satellite observations, at a 1 km grid. Layer 0 of the
 * service is snow depth; layer 4 is snow water equivalent and is not drawn.
 *
 * **What is being shown is an analysis of now, not a forecast.** It belongs
 * beside radar, smoke and fire for that reason: everything the results table
 * ranks is a model's opinion about the future, and these four are statements
 * about the present. So it never enters a ranking, never touches
 * `commitNeeded`, and only ever draws on the map.
 *
 * ## Why an `export` call rather than tiles
 *
 * The service has no cached tiles: `singleFusedMapCache` is false and its
 * capabilities are Map, Query and Data with no Tilemap, so the ArcGIS `tile`
 * endpoint does not exist on it. `export` renders an image per request
 * instead, which MapLibre can drive as a raster source because
 * `{bbox-epsg-3857}` expands to the tile's own bounding box in EPSG:3857
 * metres — `minX,minY,maxX,maxY`, which is the order `bbox` wants (checked
 * against maplibre-gl 6.9.0's own `getTileBBox`, not assumed).
 *
 * `imageSR=3857` is not optional. The service's own reference is EPSG:4269, and
 * an image in that reference does not sit on a Web Mercator map: it is the
 * difference between a Caltopo import, where the client reprojects, and this
 * one, where nothing does.
 *
 * ## Measured 2026-09-16 against the live service
 *
 * - **Cadence: four runs a day**, at 20 minutes past 01, 05, 11 and 17 UTC,
 *   which the service states itself.
 * - **CORS is open.** `access-control-allow-origin` reflects whatever `Origin`
 *   asked, production and a dev server alike.
 * - **Caching is refused**: `cache-control: max-age=0,must-revalidate`, so
 *   every pan re-renders. That is the layer's whole cost and it is accepted
 *   rather than proxied — a pod cache for a layer most visitors never switch on
 *   would make this app a tile server for NOAA.
 * - **A render costs about the same whatever its size**: 256 px answered in
 *   0.45 s at 1,785 bytes and 512 px in 0.47 s at 3,244 bytes, three runs each.
 *   The time is the render, not the pixels, which is why {@link SNOW_TILE_SIZE}
 *   is 512: four times the ground for the same half second.
 * - **Outside {@link SNOW_BOUNDS} the answer is a fully transparent image**,
 *   200 and all zeroes, so the extent is a real edge rather than an error. The
 *   source carries it as `bounds` so MapLibre asks for nothing out there at all.
 */

/** The `export` endpoint of the NOHRSC snow analysis map service. */
const EXPORT_URL =
  'https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer/export'

/** Where a click on the snow legend goes: NOAA's own page for the analysis. */
export const NOHRSC_HREF = 'https://www.nohrsc.noaa.gov/nsa/'

/** The MapLibre source and layer ids. One layer, so both are constants. */
export const SNOW_SOURCE_ID = 'snow-depth'
export const SNOW_LAYER_ID = 'snow-depth-fill'

/**
 * 512 rather than 256, which is four times less of NOAA's render time per
 * screen: a render costs ~0.46 s whatever its size (measured above), so a pan
 * that would have cost 24 images costs 6.
 */
export const SNOW_TILE_SIZE = 512

/**
 * Where the analysis exists, from layer 0's own extent: the coterminous United
 * States, with the model grid running a little into southern Canada and
 * northern Mexico. No Alaska, no Hawaii, nothing beyond North America.
 *
 * `[west, south, east, north]`, which is the order a raster source's `bounds`
 * takes. It is what stops a reader in the Alps paying for a screen of
 * transparent renders: MapLibre requests no tile outside it.
 */
export const SNOW_BOUNDS: [number, number, number, number] = [
  -130.5167, 24.1, -62.25, 58.2334,
]

/**
 * The deepest zoom worth asking NOAA to render.
 *
 * The analysis is a 1 km grid. At this zoom a 512 px tile is ~26 m per pixel at
 * 47°N, so one grid cell is already 38 px across and everything finer is the
 * renderer's invention rather than the analysis's detail. Past it MapLibre
 * magnifies the tiles it holds, so zooming into a basin costs no further
 * renders — which is the one place the layer's cost would otherwise be felt
 * most, since that is where a reader spends their time.
 */
export const SNOW_MAX_ZOOM = 11

/**
 * One band of NOAA's own legend, in inches of depth.
 *
 * The colours are read from the swatches the service publishes at
 * `MapServer/legend?f=pjson` (layer 3, "Image"), decoded on 2026-09-16, and
 * they have to be NOAA's: the map draws NOAA's rendered image, so a legend in
 * this app's own palette would be a key to a picture it does not describe. The
 * radar legend takes the same posture with IEM's reflectivity ramp. They live
 * here rather than in `styles.ts` for the reason `smoke.ts`'s paint table does
 * — these are the source's values, not the design system's.
 *
 * `color` is null for the first band alone, which NOAA draws fully transparent:
 * under 0.39 in (1 cm) nothing is painted, so the map says "no snow here" by
 * showing the ground. That band is kept rather than dropped because it is why
 * the ramp starts where it does, and {@link SNOW_RAMP} is what the legend draws.
 *
 * The boundaries are round numbers in centimetres (1, 5, 10, 25, 50, 100, …)
 * reported in inches, which is why they read as they do.
 */
export interface SnowBand {
  /** Inches of depth at the bottom of the band. */
  readonly from: number
  /** Inches of depth at the top of it. */
  readonly to: number
  /** What NOAA paints it, or null where NOAA paints nothing. */
  readonly color: string | null
}

export const SNOW_BANDS: readonly SnowBand[] = [
  { from: 0, to: 0.39, color: null },
  { from: 0.39, to: 2.0, color: '#abc1bf' },
  { from: 2.0, to: 3.9, color: '#66c1c4' },
  { from: 3.9, to: 9.8, color: '#63a9cb' },
  { from: 9.8, to: 20, color: '#5079c8' },
  { from: 20, to: 39, color: '#3c3fc2' },
  { from: 39, to: 59, color: '#5720c3' },
  { from: 59, to: 98, color: '#7d01bb' },
  { from: 98, to: 197, color: '#b404b1' },
  { from: 197, to: 295, color: '#a91377' },
  { from: 295, to: 394, color: '#992b50' },
  { from: 394, to: 787, color: '#8b4545' },
]

/** The bands that are actually drawn, which is what the legend is a key to. */
export const SNOW_RAMP: readonly SnowBand[] = SNOW_BANDS.filter((b) => b.color !== null)

/**
 * The ramp as one CSS background, hard-stopped so each band is its own block.
 *
 * Hard stops rather than the radar's blend, because these bands are the
 * service's own classification and a gradient between them would invent depths
 * NOAA never assigned a colour to. Equal widths, because the boundaries are
 * near-logarithmic (0.39 to 787 in eleven steps) and a strip drawn to scale
 * would be ten bands in the first two pixels.
 */
export function snowRampCss(): string {
  const n = SNOW_RAMP.length
  const stops = SNOW_RAMP.flatMap((band, i) => [
    `${band.color} ${(i / n) * 100}%`,
    `${band.color} ${((i + 1) / n) * 100}%`,
  ])
  return `linear-gradient(90deg,${stops.join(',')})`
}

/**
 * A number on the scale under that strip: where it sits, and what it reads.
 *
 * `at` is a position in BANDS, not in pixels — 0 is the strip's left edge and
 * `SNOW_RAMP.length` its right one — so the tick lands on the boundary it
 * names however wide the legend box is.
 */
export interface SnowTick {
  readonly at: number
  readonly label: string
}

/**
 * Four numbers rather than twelve.
 *
 * A row per band is eleven rows, and the phone legend stack is already 265 px
 * with four layer rows and the metric key. What a reader needs off a snow ramp
 * is which end of it they are looking at, so the ticks are the scale's two ends
 * plus the boundaries a decade apart between them — 0.39, 3.9, 39 and the top,
 * which is the whole reason these particular boundaries were chosen: NOAA's
 * classification happens to carry an exact decade sequence.
 *
 * Derived from the band table rather than written out, so a re-measured legend
 * moves the ticks with the colours instead of leaving them describing the old
 * one.
 */
export function snowTicks(): SnowTick[] {
  const ticks: SnowTick[] = []
  for (const decade of [0.39, 3.9, 39]) {
    const at = SNOW_RAMP.findIndex((band) => band.from === decade)
    if (at >= 0) ticks.push({ at, label: snowDepthLabel(decade) })
  }
  const top = SNOW_RAMP[SNOW_RAMP.length - 1]
  // The unit rides on the last tick alone: it is the one the eye finishes on,
  // and four copies of "in" across 164 px is three more than the scale needs.
  if (top) ticks.push({ at: SNOW_RAMP.length, label: `${snowDepthLabel(top.to)} in` })
  return ticks
}

/** A depth as the scale prints it: a decimal only where one carries meaning. */
function snowDepthLabel(inches: number): string {
  return inches < 10 ? String(Math.round(inches * 10) / 10) : String(Math.round(inches))
}

/**
 * The tile-URL template, with `{bbox-epsg-3857}` left for MapLibre.
 *
 * `layers=show:0` is snow depth alone: the service's other visible layer is
 * snow water equivalent, which is a different number in different units and
 * would paint straight over this one.
 *
 * `format=png32` rather than `png` because the layer has to be see-through —
 * a paletted PNG would give the transparent first band a matte edge over the
 * basemap — and `dpi=96` pins the render to the size asked for rather than to
 * whatever the service defaults to.
 */
export function snowTileUrl(): string {
  const params = new URLSearchParams({
    dpi: '96',
    transparent: 'true',
    format: 'png32',
    bboxSR: '3857',
    imageSR: '3857',
    size: `${SNOW_TILE_SIZE},${SNOW_TILE_SIZE}`,
    f: 'image',
    layers: 'show:0',
  })
  // The bbox token is appended raw: URLSearchParams would percent-encode the
  // braces MapLibre has to recognize, and a substituted `%7Bbbox…%7D` is a
  // request for a bounding box literally named "bbox-epsg-3857".
  return `${EXPORT_URL}?${params.toString()}&bbox={bbox-epsg-3857}`
}
