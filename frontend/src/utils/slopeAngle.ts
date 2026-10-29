// The slope angle shading's every decision (#799): the bands, their colours,
// how steep a pixel of the elevation is, and the key the legend draws.
//
// The shading is computed in the browser from the same elevation tiles the
// relief and the contours read (`map/terrain.ts`), one pixel of a tile at a
// time, and painted by band: nothing under 27 degrees, then six colours to
// the steepest rock. `map/slope.ts` hands MapLibre the picture; everything
// that decides what the picture says is here, and none of it needs a map.
import { hexToRgb } from './colors'
import { type RampTick, rampCss, rampTicks } from './legendRamp'

/**
 * One band of the shading: the steepness it starts at, in degrees, and its
 * colour. A band runs from its own `from` up to the next band's.
 */
export interface SlopeBand {
  readonly from: number
  readonly color: string
}

/**
 * CalTopo's bands, which are the avalanche world's: 27 to 29 degrees yellow,
 * 30 and 31 orange, 32 to 34 red, 35 to 45 purple, 46 to 50 blue, and 51 and
 * steeper black. Under 27 nothing is painted. Slab avalanches start on slopes
 * of about 30 to 45 degrees, most often 35 to 45, so the warm colours climb
 * toward the purple band, where they run most, and blue and black are the rock
 * too steep to hold much snow.
 *
 * Each band holds its lower edge, so 30.0 is orange and 50.9 is still blue.
 * CalTopo's legend writes the ranges in whole degrees, `46-50` and then `50+`,
 * and its black starts past 50, so here it starts at 51 (the maintainer,
 * 2026-10-28).
 *
 * The colours are the pure hues those names say, CalTopo's look, painted at
 * {@link SLOPE_ALPHA}. Measured 2026-10-28 at that alpha against Liberty's land
 * (`#efece6`) and a dark forest under the imagery (`#3a4a33`), as WCAG contrast
 * of the painted pixel with the ground it covers:
 *
 * | Band   | Colour    | On land | On forest |
 * |--------|-----------|---------|-----------|
 * | 27     | `#ffff00` | 1.03    | 3.55      |
 * | 30     | `#ffa500` | 1.31    | 2.33      |
 * | 32     | `#ff0000` | 2.29    | 1.23      |
 * | 35     | `#a020f0` | 2.21    | 1.17      |
 * | 46     | `#0000ff` | 3.13    | 1.24      |
 * | 51     | `#000000` | 3.84    | 1.66      |
 *
 * Lightness alone does not carry these, and cannot: a yellow light enough to
 * stand out on a dark forest is the colour of the pale land, and a red dark
 * enough for the land is the forest's. The hue does it. Painted, each band
 * differs from the band beside it by at least 24 in CIELAB (ΔE76) on either
 * ground, and from the ground itself by at least 44 on the land and 50 on the
 * forest. The one weak pair is the black band on the dark forest, at 18,
 * where the ground is nearly black already; slopes of 51 degrees and more are mostly
 * bare rock, which the imagery draws pale. `slopeAngle.test.ts` pins every
 * ratio.
 */
export const SLOPE_BANDS: readonly SlopeBand[] = [
  { from: 27, color: '#ffff00' },
  { from: 30, color: '#ffa500' },
  { from: 32, color: '#ff0000' },
  { from: 35, color: '#a020f0' },
  { from: 46, color: '#0000ff' },
  { from: 51, color: '#000000' },
]

/**
 * How strongly the bands paint: half, CalTopo's own strength. Tried over
 * Rainier and the Enchantments on Liberty and on the imagery (2026-10-28):
 * at 0.4 the yellow band went missing on Liberty's pale land, and at 0.6 the
 * purple and the blue hid the imagery's rock and snow, which is what a reader
 * looks at a steep slope to see. The relief under it shows through at half.
 */
export const SLOPE_ALPHA = 0.5

/**
 * How steep a slope is, in degrees, from its rise per metre east and per
 * metre north: the angle of the steepest line down the ground, whichever way
 * that runs.
 */
export function slopeDegrees(dzDx: number, dzDy: number): number {
  return (Math.atan(Math.hypot(dzDx, dzDy)) * 180) / Math.PI
}

/** The band a slope of `degrees` paints in, as an index into {@link SLOPE_BANDS}, or -1 for none. */
export function bandOf(degrees: number): number {
  for (let i = SLOPE_BANDS.length - 1; i >= 0; i--) {
    if (degrees >= SLOPE_BANDS[i].from) return i
  }
  return -1
}

/** The Web Mercator world's width in metres at the equator, the WGS 84 radius times two pi. */
const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * 6_378_137

/**
 * How far apart on the ground two pixels of a tile's row `row` are, in
 * metres. Web Mercator stretches the map by one over the cosine of the
 * latitude, so a pixel spans less ground the farther it is from the equator:
 * at Rainier's 46.85 degrees a zoom-12 pixel of a 512px tile is 13.1 m where
 * the equator's is 19.1. A slope read with the equator's spacing would come
 * out too gentle by that ratio, and every band would slide.
 *
 * Read per row rather than once per tile, because the latitude moves down a
 * tile: at zoom 8 a tile over Rainier spans a degree of it. The cosine is
 * `1 / cosh` of the Mercator y, which is the latitude's cosine without
 * working the latitude out.
 */
export function groundMetresPerPixel(z: number, tileY: number, row: number, size: number): number {
  const tiles = 2 ** z
  const yNorm = (tileY + (row + 0.5) / size) / tiles
  const cosLat = 1 / Math.cosh(Math.PI * (1 - 2 * yNorm))
  return (EARTH_CIRCUMFERENCE_M * cosLat) / (size * tiles)
}

/** A decoded elevation tile, in metres, row by row from the top left, as the contour library hands one over. */
export interface HeightGrid {
  readonly width: number
  readonly height: number
  readonly data: Float32Array
}

/**
 * The four tiles that touch a tile's edges, each null where there is none:
 * north of the top row of the world, south of the bottom, and over open ocean,
 * which has no elevation tile at any zoom.
 */
export interface EdgeTiles {
  readonly north: HeightGrid | null
  readonly south: HeightGrid | null
  readonly west: HeightGrid | null
  readonly east: HeightGrid | null
}

/**
 * The slope shading of one elevation tile, as RGBA pixels the size of the tile:
 * each pixel its band's colour, opaque, or transparent where no band holds it.
 * The layer's opacity is {@link SLOPE_ALPHA}, so the colours are not faded here.
 *
 * Each pixel's slope is a central difference: the height one pixel east less
 * the one west, and north less south, over two pixels of ground at the row's
 * latitude. A pixel on the tile's edge reads its outer neighbour from the next
 * tile's edge, which is what keeps a band from breaking along every tile
 * boundary: a slope worked out from a one-sided difference there is a slightly
 * different number, and a different colour wherever it sits on a band's edge.
 * Where there is no next tile, the edge pixel's own slope carries on past it,
 * which reads the same as a one-sided difference.
 *
 * A pixel with no height (NaN) or no neighbour height is left transparent.
 *
 * The band test compares the squared rise per metre with each band's tangent
 * squared, worked out once, rather than taking an arctangent for each of the
 * tile's quarter-million pixels: the same answer, since both rise together.
 */
export function slopeRaster(
  z: number,
  tileY: number,
  centre: HeightGrid,
  edges: EdgeTiles,
): Uint8ClampedArray<ArrayBuffer> {
  const { width: w, height: h } = centre
  const pad = paddedHeights(centre, edges)
  const stride = w + 2
  const out = new Uint8ClampedArray(w * h * 4)
  const limits = SLOPE_BANDS.map((band) => Math.tan((band.from * Math.PI) / 180) ** 2)
  const colours = SLOPE_BANDS.map((band) => hexToRgb(band.color))
  for (let row = 0; row < h; row++) {
    const twoPixels = 2 * groundMetresPerPixel(z, tileY, row, h)
    const above = row * stride + 1
    const here = (row + 1) * stride + 1
    const below = (row + 2) * stride + 1
    for (let col = 0; col < w; col++) {
      const dzDx = (pad[here + col + 1] - pad[here + col - 1]) / twoPixels
      const dzDy = (pad[above + col] - pad[below + col]) / twoPixels
      const tan2 = dzDx * dzDx + dzDy * dzDy
      // NaN fails every comparison, so a pixel with a missing height stays clear.
      if (!(tan2 >= limits[0])) continue
      let band = limits.length - 1
      while (tan2 < limits[band]) band--
      const [r, g, b] = colours[band]
      const at = (row * w + col) * 4
      out[at] = r
      out[at + 1] = g
      out[at + 2] = b
      out[at + 3] = 255
    }
  }
  return out
}

/**
 * The tile's heights with a one-pixel frame read from the four tiles around
 * it, so every pixel of the tile has a neighbour on each side. A side with no
 * tile is extended in a straight line from the tile's own last two rows or
 * columns. The four corners stay NaN: a central difference never reads them.
 */
function paddedHeights(centre: HeightGrid, { north, south, west, east }: EdgeTiles): Float32Array {
  const { width: w, height: h, data } = centre
  const stride = w + 2
  const pad = new Float32Array(stride * (h + 2)).fill(Number.NaN)
  for (let row = 0; row < h; row++) pad.set(data.subarray(row * w, row * w + w), (row + 1) * stride + 1)
  const fits = (t: HeightGrid | null) => (t && t.width === w && t.height === h ? t : null)
  const n = fits(north)
  const s = fits(south)
  const wt = fits(west)
  const e = fits(east)
  for (let col = 0; col < w; col++) {
    pad[col + 1] = n ? n.data[(h - 1) * w + col] : 2 * data[col] - data[w + col]
    pad[(h + 1) * stride + col + 1] = s ? s.data[col] : 2 * data[(h - 1) * w + col] - data[(h - 2) * w + col]
  }
  for (let row = 0; row < h; row++) {
    pad[(row + 1) * stride] = wt ? wt.data[row * w + w - 1] : 2 * data[row * w] - data[row * w + 1]
    pad[(row + 1) * stride + w + 1] = e ? e.data[row * w] : 2 * data[row * w + w - 1] - data[row * w + w - 2]
  }
  return pad
}

/** The legend's strip: the six colours, blended like every scale on the map (`rampCss`). */
export function slopeRampCss(): string {
  return rampCss(SLOPE_BANDS.map((band) => band.color))
}

/**
 * The legend's numbers: each band's lower edge, in degrees, with no unit, on
 * the boundary that carries its colour. On a blended strip that is one
 * boundary right of where the band starts, since `rampCss` puts colour `i` at
 * boundary `i + 1`; the top band's tick passes its own index, because `end`
 * alignment hangs it from the far side of its column. `snowTicks` places its
 * ticks by the same rule.
 */
export function slopeTicks(): RampTick[] {
  const last = SLOPE_BANDS.length - 1
  return rampTicks(SLOPE_BANDS.map((band, i) => ({ at: i === last ? i : i + 1, text: String(band.from) })))
}
