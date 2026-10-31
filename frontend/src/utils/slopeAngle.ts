// The slope angle shading's every decision (#799): the bands, their colours,
// how steep a pixel of the elevation is, and the key the legend draws.
//
// The shading is computed in the browser from the same elevation tiles the
// relief and the contours read (`map/terrain.ts`), one pixel of a tile at a
// time, and painted by band: nothing under 27 degrees, then seven colours to
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
 * CalTopo's bands, which are the avalanche world's, as its own legend writes
 * them: 27 to 29 degrees yellow, 30 and 31 gold, 32 to 34 orange, 35 to 45
 * red, 46 to 50 purple, 51 to 59 blue, and 60 and steeper black. Under 27
 * nothing is painted. Slab avalanches start on slopes of about 30 to 45
 * degrees, most often 35 to 45, so the colours warm toward the red band, where
 * they run most, and purple, blue and black are the rock too steep to hold
 * much snow. An earlier six-band copy put purple at 35, which painted the
 * commonest steep ground a colour CalTopo keeps for cliffs (the maintainer,
 * 2026-10-29, beside a CalTopo screenshot of Squak Mountain).
 *
 * Each band holds its lower edge, so 30.0 is gold and 59.9 is still blue.
 *
 * The colours are pure hues, CalTopo's look, painted at
 * {@link SLOPE_ALPHA}. Measured 2026-10-28 at that alpha against Liberty's land
 * (`#efece6`) and a dark forest under the imagery (`#3a4a33`), as WCAG contrast
 * of the painted pixel with the ground it covers:
 *
 * | Band   | Colour    | On land | On forest |
 * |--------|-----------|---------|-----------|
 * | 27     | `#ffff00` | 1.03    | 3.55      |
 * | 30     | `#ffaa00` | 1.30    | 2.37      |
 * | 32     | `#ff5500` | 1.73    | 1.63      |
 * | 35     | `#ff0000` | 2.29    | 1.23      |
 * | 46     | `#a020f0` | 2.21    | 1.17      |
 * | 51     | `#0000ff` | 3.13    | 1.24      |
 * | 60     | `#000000` | 3.84    | 1.66      |
 *
 * Lightness alone does not carry these, and cannot: a yellow light enough to
 * stand out on a dark forest is the colour of the pale land, and a red dark
 * enough for the land is the forest's. The hue does it. Painted, each band
 * differs from the band beside it by at least 22 in CIELAB (ΔE76) on either
 * ground, and from the ground itself by at least 43 on the land and 50 on the
 * forest. The gold and the orange are the two that keep the warm end apart:
 * CalTopo's own gold sits within 18 of the yellow. The one weak pair is the
 * black band on the dark forest, at 18, where the ground is nearly black
 * already; slopes of 60 degrees and more are mostly
 * bare rock, which the imagery draws pale. `slopeAngle.test.ts` pins every
 * ratio.
 */
export const SLOPE_BANDS: readonly SlopeBand[] = [
  { from: 27, color: '#ffff00' },
  { from: 30, color: '#ffaa00' },
  { from: 32, color: '#ff5500' },
  { from: 35, color: '#ff0000' },
  { from: 46, color: '#a020f0' },
  { from: 51, color: '#0000ff' },
  { from: 60, color: '#000000' },
]

/**
 * How strongly the bands paint at the Slope angle row's default level: half,
 * CalTopo's own strength. Tried over Rainier and the Enchantments on Liberty
 * and on the imagery (2026-10-28): at 0.4 the yellow band went missing on
 * Liberty's pale land, and at 0.6 the cliff bands hid the imagery's
 * rock and snow, which is what a reader looks at a steep slope to see. The
 * relief under it shows through at half. The row's slider moves it from 0 to
 * 1 since record 0250, and the default stays here: `OPACITY_DEFAULT` in
 * `baseMapOpacity.ts` is this half as a percent.
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
 * A slope tile finer than the elevation under it (#799): the elevation tile
 * `level` that covers tile `x`, `y` at zoom `z`, and the square of that
 * tile's pixels the finer tile lies over. Mapterhorn holds zoom 12 over all
 * land and finer zooms only where a survey reaches, so a slope tile at 14
 * over ground surveyed to 13 reads a quarter of the zoom-13 tile, and one
 * over the 30 m fill a sixteenth of the zoom-12 tile.
 *
 * `size` is the elevation tile's side in pixels, 512 for Mapterhorn's, which
 * every step out halves: the window's side is `size` over 2 to the power of
 * the levels between, and its corner counts from the covering tile's top
 * left. At `level === z` the window is the whole tile.
 */
export interface DemWindow {
  /** The covering elevation tile's column and row, at `level`. */
  readonly x: number
  readonly y: number
  /** The window's top left pixel and its side, in the covering tile's pixels. */
  readonly left: number
  readonly top: number
  readonly span: number
}

export function demWindow(z: number, x: number, y: number, level: number, size: number): DemWindow {
  const per = 2 ** (z - level)
  const span = size / per
  return { ...coveringTile(z, x, y, level), left: (x % per) * span, top: (y % per) * span, span }
}

/** The tile at zoom `level` that tile `x`, `y` at zoom `z` lies inside, as its column and row. */
export function coveringTile(z: number, x: number, y: number, level: number): { x: number; y: number } {
  const per = 2 ** (z - level)
  return { x: Math.floor(x / per), y: Math.floor(y / per) }
}

/**
 * Which of the covering tile's four edges a finer tile's window touches
 * ({@link demWindow}). Only those need the next elevation tile at the
 * covering level: a window inside the tile finds every outer neighbour in the
 * tile itself. At `level === z` the window is the tile, and it touches all four.
 */
export function windowEdges(
  z: number,
  x: number,
  y: number,
  level: number,
): Record<keyof EdgeTiles, boolean> {
  const per = 2 ** (z - level)
  return { north: y % per === 0, south: y % per === per - 1, west: x % per === 0, east: x % per === per - 1 }
}

/**
 * The slope shading of one elevation tile, as RGBA pixels the size of the tile:
 * each pixel its band's colour, opaque, or transparent where no band holds it.
 * The layer's opacity is the row's level, {@link SLOPE_ALPHA} by default, so the
 * colours are not faded here.
 *
 * `z` and `tileY` are the ELEVATION tile's, so each row's ground spacing is
 * the spacing of the heights it differences. With a `window`
 * ({@link demWindow}), only that square of the elevation tile is shaded, at
 * the elevation's own spacing, and each of its pixels is drawn as a block of
 * the tile size over the window's side: a slope tile one zoom finer than the
 * elevation under it paints every elevation pixel as two by two, the bands
 * the coarser tile itself paints there, rather than a slope read across
 * heights stretched to look finer than they are.
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
  window: Pick<DemWindow, 'left' | 'top' | 'span'> = { left: 0, top: 0, span: centre.width },
): Uint8ClampedArray<ArrayBuffer> {
  const { width: w, height: h } = centre
  const { left, top, span } = window
  const scale = w / span
  const pad = paddedHeights(centre, edges)
  const stride = w + 2
  const out = new Uint8ClampedArray(w * h * 4)
  const limits = SLOPE_BANDS.map((band) => Math.tan((band.from * Math.PI) / 180) ** 2)
  const colours = SLOPE_BANDS.map((band) => hexToRgb(band.color))
  for (let row = top; row < top + span; row++) {
    const twoPixels = 2 * groundMetresPerPixel(z, tileY, row, h)
    const above = row * stride + 1
    const here = (row + 1) * stride + 1
    const below = (row + 2) * stride + 1
    for (let col = left; col < left + span; col++) {
      const dzDx = (pad[here + col + 1] - pad[here + col - 1]) / twoPixels
      const dzDy = (pad[above + col] - pad[below + col]) / twoPixels
      const tan2 = dzDx * dzDx + dzDy * dzDy
      // NaN fails every comparison, so a pixel with a missing height stays clear.
      if (!(tan2 >= limits[0])) continue
      let band = limits.length - 1
      while (tan2 < limits[band]) band--
      const [r, g, b] = colours[band]
      if (scale === 1) {
        // The whole tile, pixel for pixel: the common case, kept free of the
        // block loop below, which cost a third more over a 512px tile
        // (medians of 50 in Node, 2026-10-29).
        const at = (row * w + col) * 4
        out[at] = r
        out[at + 1] = g
        out[at + 2] = b
        out[at + 3] = 255
        continue
      }
      const outCol = (col - left) * scale
      for (let outRow = (row - top) * scale; outRow < (row - top + 1) * scale; outRow++) {
        const end = (outRow * w + outCol + scale) * 4
        for (let at = (outRow * w + outCol) * 4; at < end; at += 4) {
          out[at] = r
          out[at + 1] = g
          out[at + 2] = b
          out[at + 3] = 255
        }
      }
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

/** The legend's strip: the seven colours, blended like every scale on the map (`rampCss`). */
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

/** The tile at zoom `z` a point falls in, and its pixel in a tile `size` pixels square. */
export interface TilePixel {
  readonly x: number
  readonly y: number
  readonly col: number
  readonly row: number
}

/** The Web Mercator world ends here, north and south, where its square does. */
const MERCATOR_MAX_LAT = 85.0511287798

/**
 * The tile and pixel a latitude and longitude fall on at zoom `z`, Web
 * Mercator's, which is every tile here: the same address MapLibre asks a
 * tile at and the same pixel `slopeRaster` would paint for the point.
 */
export function tilePixel(lat: number, lon: number, z: number, size: number): TilePixel {
  const tiles = 2 ** z
  const phi = (Math.max(-MERCATOR_MAX_LAT, Math.min(MERCATOR_MAX_LAT, lat)) * Math.PI) / 180
  const wx = (((lon + 180) / 360) % 1 + 1) % 1 * tiles
  const wy = ((1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2) * tiles
  const x = Math.min(tiles - 1, Math.floor(wx))
  const y = Math.min(tiles - 1, Math.max(0, Math.floor(wy)))
  const col = Math.min(size - 1, Math.floor((wx - x) * size))
  const row = Math.min(size - 1, Math.max(0, Math.floor((wy - y) * size)))
  return { x, y, col, row }
}

/** What the ground is at one point (#832): its height, how steep it is, and which way it faces. */
export interface GroundReading {
  readonly elevationM: number
  readonly degrees: number
  /**
   * The compass bearing the slope faces, the way down, in degrees from north
   * clockwise; null on ground with no fall at all, which faces nowhere.
   */
  readonly aspect: number | null
}

/**
 * The ground at one pixel of an elevation tile: the pixel's own height, and
 * the slope and aspect of a central difference across its four neighbours,
 * the difference `slopeRaster` takes for the pixel it paints, so the number
 * names the band the shading draws from the same tile. A neighbour off the
 * tile's edge is carried on in a straight line from the pixel and the one
 * inside it, as `slopeRaster` does where it has no next tile; a point is one
 * pixel, and the next tile is not worth a fetch for it. Null where the pixel
 * or a neighbour has no height.
 *
 * `z` and `tileY` are the tile's own, for the ground spacing at its row.
 */
export function groundAt(grid: HeightGrid, col: number, row: number, z: number, tileY: number): GroundReading | null {
  const { width: w, height: h, data } = grid
  const at = (c: number, r: number) => data[r * w + c]
  const here = at(col, row)
  // A neighbour, or past the edge the line through the pixel and the one on
  // the other side of it.
  const side = (dc: number, dr: number) => {
    const c = col + dc
    const r = row + dr
    if (c >= 0 && c < w && r >= 0 && r < h) return at(c, r)
    return 2 * here - at(col - dc, row - dr)
  }
  const twoPixels = 2 * groundMetresPerPixel(z, tileY, row, h)
  // Rise per metre east and per metre north; north is up the tile, a row less.
  const dzDx = (side(1, 0) - side(-1, 0)) / twoPixels
  const dzDy = (side(0, -1) - side(0, 1)) / twoPixels
  if (!Number.isFinite(here) || !Number.isFinite(dzDx) || !Number.isFinite(dzDy)) return null
  const flat = dzDx === 0 && dzDy === 0
  // The way down is against the rise: east of it by -dzDx, north by -dzDy.
  const aspect = flat ? null : (((Math.atan2(-dzDx, -dzDy) * 180) / Math.PI) % 360 + 360) % 360
  return { elevationM: here, degrees: slopeDegrees(dzDx, dzDy), aspect }
}

/** The eight points of the compass, from north clockwise, as a card writes a bearing. */
const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

/** The nearest of the eight points to a bearing in degrees, `NE` for 38. */
export function compassPoint(bearing: number): string {
  return COMPASS_POINTS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]
}
