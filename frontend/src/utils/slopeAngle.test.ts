import { describe, expect, it } from 'vitest'
import { contrast, mixOver, round2 } from '../testSupport/contrast'
import {
  SLOPE_ALPHA,
  SLOPE_BANDS,
  bandOf,
  groundMetresPerPixel,
  slopeDegrees,
  slopeRampCss,
  slopeRaster,
  slopeTicks,
  type HeightGrid,
} from './slopeAngle'

const NO_EDGES = { north: null, south: null, west: null, east: null }

/** A tile of `size` pixels whose heights are `at(col, row)`. */
function grid(size: number, at: (col: number, row: number) => number): HeightGrid {
  const data = new Float32Array(size * size)
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) data[row * size + col] = at(col, row)
  return { width: size, height: size, data }
}

/** The RGBA of one pixel. */
const pixel = (out: Uint8ClampedArray, size: number, col: number, row: number) =>
  Array.from(out.subarray((row * size + col) * 4, (row * size + col) * 4 + 4))

/** A colour as the opaque RGBA the raster writes for it. */
const rgba = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(255)

const CLEAR = [0, 0, 0, 0]

describe('slopeDegrees', () => {
  it('reads flat ground as 0 and a rise equal to the run as 45', () => {
    expect(slopeDegrees(0, 0)).toBe(0)
    expect(slopeDegrees(1, 0)).toBeCloseTo(45, 10)
    expect(slopeDegrees(0, -1)).toBeCloseTo(45, 10)
  })

  // The steepest line runs between the two axes, so the two rises add as a
  // vector rather than one of them winning.
  it('takes the steepest direction from both rises', () => {
    expect(slopeDegrees(0.6, 0.8)).toBeCloseTo(45, 10)
    expect(slopeDegrees(Math.sqrt(1.5), Math.sqrt(1.5))).toBeCloseTo(60, 10)
  })
})

describe('bandOf', () => {
  it('paints nothing under 27 degrees', () => {
    expect(bandOf(0)).toBe(-1)
    expect(bandOf(26.9)).toBe(-1)
  })

  // Each band holds its lower edge.
  it('puts each boundary in the band it starts', () => {
    const cases: [number, number][] = [
      [27, 0],
      [29.9, 0],
      [30, 1],
      [31.9, 1],
      [32, 2],
      [34.9, 2],
      [35, 3],
      [45.9, 3],
      [46, 4],
      [49.9, 4],
      [50, 5],
      [89, 5],
    ]
    for (const [degrees, band] of cases) expect([degrees, bandOf(degrees)]).toEqual([degrees, band])
  })

  it('paints no band for a slope it could not read', () => {
    expect(bandOf(Number.NaN)).toBe(-1)
  })
})

describe('the bands', () => {
  it("are CalTopo's six, yellow to black", () => {
    expect(SLOPE_BANDS.map((b) => b.from)).toEqual([27, 30, 32, 35, 46, 50])
    expect(SLOPE_BANDS.map((b) => b.color)).toEqual(['#ffff00', '#ffa500', '#ff0000', '#a020f0', '#0000ff', '#000000'])
    expect(SLOPE_ALPHA).toBe(0.5)
  })

  // The table in the module's comment: each band painted at half over the
  // two grounds, against the ground it covers.
  it('paints at the ratios its comment gives, on the land and on a dark forest', () => {
    const LAND = '#efece6'
    const FOREST = '#3a4a33'
    const on = (ground: string) => SLOPE_BANDS.map((b) => round2(contrast(mixOver(b.color, ground, SLOPE_ALPHA), ground)))
    expect(on(LAND)).toEqual([1.03, 1.31, 2.29, 2.21, 3.13, 3.84])
    expect(on(FOREST)).toEqual([3.55, 2.33, 1.23, 1.17, 1.24, 1.66])
  })
})

describe('groundMetresPerPixel', () => {
  // A zoom-12 512px tile at the equator: the world's width over 2^12 tiles of
  // 512 pixels, 19.11 m, nearly whole at the rows either side of the line.
  it("is the equator's 19.1 m at zoom 12 next to the equator", () => {
    expect(groundMetresPerPixel(12, 2047, 511, 512)).toBeCloseTo(19.109, 2)
    expect(groundMetresPerPixel(12, 2048, 0, 512)).toBeCloseTo(19.109, 2)
  })

  // Rainier's summit, 46.853 N, is in row 492 of zoom-12 tile row 1442; the
  // spacing there is the equator's times the cosine of that latitude.
  it('shrinks with the cosine of the latitude', () => {
    const tileY = 1442
    const atRainier = groundMetresPerPixel(12, tileY, 492, 512)
    const yNorm = (tileY + 492.5 / 512) / 4096
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * yNorm)))
    expect(lat * (180 / Math.PI)).toBeCloseTo(46.85, 1)
    expect(atRainier).toBeCloseTo(19.109 * Math.cos(lat), 2)
    expect(atRainier).toBeCloseTo(13.07, 1)
  })

  it('halves with each zoom', () => {
    expect(groundMetresPerPixel(11, 721, 0, 512) / groundMetresPerPixel(12, 1442, 0, 512)).toBeCloseTo(2, 2)
  })
})

describe('slopeRaster', () => {
  const SIZE = 8
  // The equator's spacing at zoom 12, nearly constant down a tile there.
  const Z = 12
  const Y = 2047
  const m = groundMetresPerPixel(Z, Y, SIZE / 2, SIZE)
  // A plane rising `degrees` to the east.
  const plane = (degrees: number) => grid(SIZE, (col) => col * m * Math.tan((degrees * Math.PI) / 180))

  it('paints a slope in its band, opaque, and flat ground clear', () => {
    expect(pixel(slopeRaster(Z, Y, plane(40), NO_EDGES), SIZE, 4, 4)).toEqual(rgba('#a020f0'))
    expect(pixel(slopeRaster(Z, Y, plane(28), NO_EDGES), SIZE, 4, 4)).toEqual(rgba('#ffff00'))
    expect(pixel(slopeRaster(Z, Y, plane(20), NO_EDGES), SIZE, 4, 4)).toEqual(CLEAR)
    expect(pixel(slopeRaster(Z, Y, grid(SIZE, () => 1200), NO_EDGES), SIZE, 4, 4)).toEqual(CLEAR)
  })

  // The table's test, pixel by pixel, agrees with bandOf on slopeDegrees for
  // every half degree from 20 to 70, away from the boundaries themselves,
  // where a float either side is equally right.
  it('bands every pixel the way bandOf does', () => {
    for (let degrees = 20.25; degrees < 70; degrees += 0.5) {
      const out = slopeRaster(Z, Y, plane(degrees), NO_EDGES)
      const band = bandOf(degrees)
      expect([degrees, pixel(out, SIZE, 4, 4)]).toEqual([degrees, band < 0 ? CLEAR : rgba(SLOPE_BANDS[band].color)])
    }
  })

  // The same plane at Rainier's latitude: the right spacing there is 13.1 m,
  // so heights built on it read as the slope they are. Read with the
  // equator's spacing, the same 33 degrees would read 24 and paint nothing.
  it('reads the slope with the spacing at the tile\'s own latitude', () => {
    const y = 1442
    const here = groundMetresPerPixel(Z, y, SIZE / 2, SIZE)
    const tile = grid(SIZE, (col) => col * here * Math.tan((33 * Math.PI) / 180))
    expect(pixel(slopeRaster(Z, y, tile, NO_EDGES), SIZE, 4, 4)).toEqual(rgba('#ff0000'))
    const atEquator = (Math.atan((here * Math.tan((33 * Math.PI) / 180)) / m) * 180) / Math.PI
    expect(atEquator).toBeLessThan(27)
  })

  // A ridge line on the boundary: the tile's last column is the crest, and
  // the next tile falls away from it. Read from the neighbour, the crest is
  // as flat as a crest is; with no neighbour, the slope carries on.
  it("reads an edge pixel's outer neighbour from the next tile", () => {
    const rise = m * Math.tan((40 * Math.PI) / 180)
    const centre = grid(SIZE, (col) => col * rise)
    const east = grid(SIZE, (col) => (SIZE - 2 - col) * rise)
    const withEast = slopeRaster(Z, Y, centre, { ...NO_EDGES, east })
    expect(pixel(withEast, SIZE, SIZE - 1, 4)).toEqual(CLEAR)
    expect(pixel(withEast, SIZE, SIZE - 2, 4)).toEqual(rgba('#a020f0'))
    expect(pixel(slopeRaster(Z, Y, centre, NO_EDGES), SIZE, SIZE - 1, 4)).toEqual(rgba('#a020f0'))
  })

  // A plane across two tiles paints both edges the same, which is what keeps a
  // seam from showing where two tiles meet.
  it('paints the two sides of a tile boundary alike', () => {
    const rise = m * Math.tan((33 * Math.PI) / 180)
    const west = grid(SIZE, (col) => col * rise)
    const centre = grid(SIZE, (col) => (col + SIZE) * rise)
    const westOut = slopeRaster(Z, Y, west, { ...NO_EDGES, east: centre })
    const centreOut = slopeRaster(Z, Y, centre, { ...NO_EDGES, west })
    for (let row = 0; row < SIZE; row++) {
      expect(pixel(westOut, SIZE, SIZE - 1, row)).toEqual(rgba('#ff0000'))
      expect(pixel(centreOut, SIZE, 0, row)).toEqual(rgba('#ff0000'))
    }
  })

  it('reads the north and south neighbours for the top and bottom rows', () => {
    const rise = m * Math.tan((48 * Math.PI) / 180)
    const centre = grid(SIZE, (_, row) => (SIZE - row) * rise)
    const north = grid(SIZE, (_, row) => (2 * SIZE - row) * rise)
    const south = grid(SIZE, () => -2 * rise)
    const out = slopeRaster(Z, Y, centre, { ...NO_EDGES, north, south })
    expect(pixel(out, SIZE, 3, 0)).toEqual(rgba('#0000ff'))
    // The south tile is flat, a step below the plane: steeper at the edge, so
    // black.
    expect(pixel(out, SIZE, 3, SIZE - 1)).toEqual(rgba('#000000'))
  })

  it('leaves a pixel with a missing height clear', () => {
    const tile = plane(40)
    tile.data[4 * SIZE + 5] = Number.NaN
    const out = slopeRaster(Z, Y, tile, NO_EDGES)
    expect(pixel(out, SIZE, 4, 4)).toEqual(CLEAR)
    expect(pixel(out, SIZE, 2, 4)).toEqual(rgba('#a020f0'))
  })

  it('ignores a neighbour of another size', () => {
    const centre = plane(40)
    const out = slopeRaster(Z, Y, centre, { ...NO_EDGES, east: grid(4, () => 0) })
    expect(pixel(out, SIZE, SIZE - 1, 4)).toEqual(rgba('#a020f0'))
  })
})

describe('the legend', () => {
  it('blends the six colours like every strip on the map', () => {
    expect(slopeRampCss()).toBe(
      'linear-gradient(90deg,#ffff00 0%,#ffff00 16.666666666666664%,#ffa500 33.33333333333333%,#ff0000 50%,' +
        '#a020f0 66.66666666666666%,#0000ff 83.33333333333334%,#000000 100%)',
    )
  })

  // Each number stands where its band's colour is pure, the top one hung from
  // the strip's end.
  it("prints each band's lower edge on the boundary that carries its colour", () => {
    expect(slopeTicks()).toEqual([
      { at: 1, label: '27', align: 'center' },
      { at: 2, label: '30', align: 'center' },
      { at: 3, label: '32', align: 'center' },
      { at: 4, label: '35', align: 'center' },
      { at: 5, label: '46', align: 'center' },
      { at: 5, label: '50', align: 'end' },
    ])
  })
})
