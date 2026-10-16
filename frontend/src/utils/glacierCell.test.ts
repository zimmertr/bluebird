import { describe, expect, it, vi } from 'vitest'
import {
  GLACIER_TILE_ZOOM,
  SNOW_CELL_DEG,
  cellOnGlacier,
  cellTiles,
  decodeGlaciers,
  glacierCheck,
} from './glacierCell'
import { encodeTile, type MvtPolygon } from '../testSupport/mvt'
import type { TileRef } from './peakTiles'

const EXTENT = 4096
// The zoom-12 tile over Mount Rainier's summit.
const TILE: TileRef = { z: GLACIER_TILE_ZOOM, x: 662, y: 1443 }

// A point at tile units inside TILE, as a longitude and latitude.
function at(ux: number, uy: number) {
  const n = 2 ** TILE.z
  const x = TILE.x + ux / EXTENT
  const y = TILE.y + uy / EXTENT
  return {
    lng: (x / n) * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI,
  }
}

const square = (cx: number, cy: number, half: number): [number, number][] => [
  [cx - half, cy - half],
  [cx + half, cy - half],
  [cx + half, cy + half],
  [cx - half, cy + half],
]

const glacier = (rings: [number, number][][], cls = 'ice'): MvtPolygon => ({ rings, properties: { class: cls, subclass: 'glacier' } })
const tileOf = (...polygons: MvtPolygon[]) => encodeTile([{ name: 'landcover', polygons }])

// Half a cell in tile units across, at this tile's latitude: about 194.
const HALF_CELL = (SNOW_CELL_DEG / 2 / (360 / 2 ** TILE.z)) * EXTENT

describe('cellOnGlacier', () => {
  const glaciers = decodeGlaciers(tileOf(glacier([square(2048, 2048, 300)])), TILE)

  it('reads a point on a glacier as on one', () => {
    const p = at(2048, 2048)
    expect(cellOnGlacier(p.lng, p.lat, glaciers)).toBe(true)
  })

  // The number NOAA answers is its cell's, so a cell that reaches a glacier
  // is a glacier's cell even where the click itself is off the ice: the trap
  // Baker's summit dome sets, which OSM leaves out of its outlines.
  it('reads a cell that reaches a glacier as on one, and one that does not as not', () => {
    const near = at(2048 + 300 + HALF_CELL * 0.6, 2048)
    const far = at(2048 + 300 + HALF_CELL * 1.5, 2048)
    expect(cellOnGlacier(near.lng, near.lat, glaciers)).toBe(true)
    expect(cellOnGlacier(far.lng, far.lat, glaciers)).toBe(false)
  })

  it('counts a hole as bare ground', () => {
    const holed = decodeGlaciers(tileOf(glacier([square(2048, 2048, 1500), square(2048, 2048, 1000)])), TILE)
    const middle = at(2048, 2048)
    const ice = at(2048 + 1250, 2048)
    expect(cellOnGlacier(middle.lng, middle.lat, holed)).toBe(false)
    expect(cellOnGlacier(ice.lng, ice.lat, holed)).toBe(true)
  })

  it('reads only the landcover layer\'s ice', () => {
    const p = at(2048, 2048)
    expect(cellOnGlacier(p.lng, p.lat, decodeGlaciers(tileOf(glacier([square(2048, 2048, 300)], 'rock')), TILE))).toBe(false)
    expect(decodeGlaciers(encodeTile([]), TILE)).toEqual([])
    expect(decodeGlaciers(new Uint8Array([1, 2, 3]), TILE)).toEqual([])
  })
})

describe('cellTiles', () => {
  it('reads one tile for a cell inside it, and its neighbours for one on a corner', () => {
    const middle = at(2048, 2048)
    expect(cellTiles(middle.lng, middle.lat)).toEqual([TILE])
    const corner = at(1, 1)
    expect(cellTiles(corner.lng, corner.lat)).toHaveLength(4)
  })
})

describe('glacierCheck', () => {
  const p = at(2048, 2048)

  it('fetches a tile once, then answers from the one it holds', async () => {
    const fetchTile = vi.fn(async () => tileOf(glacier([square(2048, 2048, 300)])))
    const check = glacierCheck(async () => fetchTile)
    expect(check.now(p.lng, p.lat)).toBeUndefined()
    expect(await check.ask(p.lng, p.lat, new AbortController().signal)).toBe(true)
    expect(check.now(p.lng, p.lat)).toBe(true)
    expect(await check.ask(p.lng, p.lat, new AbortController().signal)).toBe(true)
    expect(fetchTile).toHaveBeenCalledTimes(1)
  })

  // A tile that cannot be read leaves the card as it was before glaciers
  // were asked about, and is asked for again next time.
  it('answers no glacier where a tile cannot be read, and keeps nothing', async () => {
    const check = glacierCheck(async () => async () => null)
    expect(await check.ask(p.lng, p.lat, new AbortController().signal)).toBe(false)
    expect(check.now(p.lng, p.lat)).toBeUndefined()
  })
})
