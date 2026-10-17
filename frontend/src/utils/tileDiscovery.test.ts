import { describe, expect, it, vi } from 'vitest'
import type { Position } from 'geojson'
import { encodeTile, type MvtPoint } from '../testSupport/mvt'
import {
  DISCOVERY_TILE_BUDGET,
  TILE_TYPES,
  decodeLakes,
  discoverFromTiles,
  isTile,
  splitTypes,
  tileDiscoverable,
  tilesCovering,
} from './tileDiscovery'
import { PEAK_TILE_ZOOM, tileKey, type TileRef } from './peakTiles'

const Z = PEAK_TILE_ZOOM
const N = 2 ** Z
const EXTENT = 4096

// The north-west corner of a tile, and a point inside one, in degrees.
const lonOf = (x: number) => (x / N) * 360 - 180
const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / N))) * 180) / Math.PI
const centre = (x: number, y: number): Position => [lonOf(x + 0.5), latOf(y + 0.5)]

// Four tiles under Mount Rainier, and an L-shaped ring over them that keeps
// the south-east tile's centre outside. Its corners sit just inside the
// tiles' edges: a point exactly on an edge belongs to the neighbour.
const X = 2650
const Y = 5772
const IN = 0.99
const RING: Position[] = [
  [lonOf(X), latOf(Y)],
  [lonOf(X + 1 + IN), latOf(Y)],
  [lonOf(X + 1 + IN), latOf(Y + 1)],
  [lonOf(X + 1), latOf(Y + 1)],
  [lonOf(X + 1), latOf(Y + 1 + IN)],
  [lonOf(X), latOf(Y + 1 + IN)],
  [lonOf(X), latOf(Y)],
]
const point = (id: number, properties: MvtPoint['properties'], x = EXTENT / 2, y = EXTENT / 2): MvtPoint => ({ id, x, y, properties })
const peaks = (points: MvtPoint[]) => ({ name: 'mountain_peak', extent: EXTENT, points })
const lakes = (points: MvtPoint[]) => ({ name: 'water_name', extent: EXTENT, points })
const EMPTY = new Uint8Array()
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82])

// A fetcher over a map of tiles by key; a tile not in it is empty.
function fetching(tiles: Record<string, Uint8Array | null | Error>) {
  const asked: string[] = []
  const fetchTile = vi.fn(async (t: TileRef) => {
    asked.push(tileKey(t))
    const got = tiles[tileKey(t)]
    if (got instanceof Error) throw got
    return got === undefined ? EMPTY : got
  })
  return { fetchTile, asked }
}
const key = (x: number, y: number) => tileKey({ z: Z, x, y })

// A ring's corner in tile units from the block's north-west corner, inside
// the tiles rather than on their edges.
const at = (dx: number, dy: number): Position => [lonOf(X + dx), latOf(Y + dy)]

describe('the tiles under a ring', () => {
  it('are every zoom-14 tile the ring touches, in row order', () => {
    expect(tilesCovering(RING).map(tileKey)).toEqual([key(X, Y), key(X + 1, Y), key(X, Y + 1), key(X + 1, Y + 1)])
    expect(tilesCovering([])).toEqual([])
  })

  // A triangle over a four-by-four block: the six tiles past its diagonal
  // are under its bounding box and touched by nothing (#745).
  it('leave out the tiles of the bounding box the ring never reaches', () => {
    const triangle = [at(0.2, 0.2), at(3.6, 0.2), at(0.2, 3.6), at(0.2, 0.2)]
    const expected: string[] = []
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) if (dx + dy <= 3) expected.push(key(X + dx, Y + dy))
    expect(tilesCovering(triangle).map(tileKey)).toEqual(expected)
  })

  // A U over a three-by-three block: the tile in its mouth is inside the
  // bounding box, crossed by no edge and outside the ring, and the tile under
  // it is crossed by the mouth's floor.
  it('leave out a tile inside a concave ring\'s mouth and keep the one its floor crosses', () => {
    const u = [at(0.1, 0.1), at(2.9, 0.1), at(2.9, 2.9), at(2.1, 2.9), at(2.1, 1.1), at(0.9, 1.1), at(0.9, 2.9), at(0.1, 2.9), at(0.1, 0.1)]
    const keys = tilesCovering(u).map(tileKey)
    expect(keys).toHaveLength(8)
    expect(keys).not.toContain(key(X + 1, Y + 2))
    expect(keys).toContain(key(X + 1, Y + 1))
    expect(keys).toContain(key(X + 1, Y))
  })

  it("are the tiles' to discover for a kind they carry, inside the budget", () => {
    expect(tileDiscoverable(RING, ['peak'])).toBe(true)
    expect(tileDiscoverable(RING, ['lake', 'trailhead'])).toBe(true)
    expect(tileDiscoverable(RING, ['trailhead'])).toBe(false)
    expect(tileDiscoverable(RING, [])).toBe(false)
    // The whole of Washington is tens of thousands of tiles.
    const state: Position[] = [[-124.8, 45.5], [-116.9, 45.5], [-116.9, 49], [-124.8, 49], [-124.8, 45.5]]
    expect(tilesCovering(state).length).toBeGreaterThan(DISCOVERY_TILE_BUDGET)
    expect(tileDiscoverable(state, ['peak'])).toBe(false)
  })

  // A strip three tiles wide along the diagonal of a hundred-tile square: the
  // box holds ten times the budget, the strip a few hundred tiles (#745).
  it('count a ring by the tiles it touches, so a strip along a range fits where its box would not', () => {
    const strip = [at(0.5, 0.5), at(3.5, 0.5), at(100.5, 97.5), at(97.5, 100.5), at(0.5, 0.5)]
    const n = tilesCovering(strip).length
    expect(n).toBeGreaterThan(300)
    expect(n).toBeLessThan(DISCOVERY_TILE_BUDGET)
    expect(tileDiscoverable(strip, ['peak'])).toBe(true)
  })

  it('split a request into what the tiles answer and what the map server keeps', () => {
    expect(splitTypes(['peak', 'trailhead', 'lake'])).toEqual({ tiles: ['peak', 'lake'], server: ['trailhead'] })
    expect([...TILE_TYPES].sort()).toEqual(['lake', 'peak'])
  })
})

describe('decoding a tile', () => {
  it('reads the named lakes, with the OSM way or relation behind the feature id', () => {
    const bytes = encodeTile([
      lakes([
        point(1702136232, { class: 'lake', name: 'Lake Ingalls' }),
        point(5573061233, { class: 'lake', name: 'Baker Lake' }),
        point(70, { class: 'lake', name: 'Lake' }),
        point(81, { class: 'lake' }),
        point(91, { class: 'ocean', name: 'Pacific Ocean' }),
      ]),
    ])
    const found = decodeLakes(bytes, { z: Z, x: X, y: Y })
    expect(found.map((l) => [l.name, l.osm_id])).toEqual([
      ['Lake Ingalls', 'way/170213623'],
      ['Baker Lake', 'relation/557306123'],
      ['Lake', null],
    ])
    const [lon, lat] = centre(X, Y)
    expect(found[0].longitude).toBeCloseTo(lon, 6)
    expect(found[0].latitude).toBeCloseTo(lat, 6)
  })

  // The lookup reads an image as an empty tile; a discovery must not, since
  // an empty answer here means "nothing in this ring". A tile is told by a
  // layer with a feature in it: Planetiler writes no empty layers, and the
  // decoder drops one.
  it('tells a tile from bytes that are none', () => {
    expect(isTile(EMPTY)).toBe(true)
    expect(isTile(encodeTile([peaks([point(1, { class: 'saddle' })])]))).toBe(true)
    expect(isTile(PNG)).toBe(false)
    expect(decodeLakes(PNG, { z: Z, x: X, y: Y })).toEqual([])
  })
})

describe('discovering a ring from its tiles', () => {
  const NW = encodeTile([
    peaks([
      point(14409 * 10 + 1, { class: 'peak', name: 'Columbia Crest', ele_ft: 14409 }),
      point(21, { class: 'saddle', name: 'A Col', ele_ft: 14000 }, 2100),
      point(41, { class: 'volcano', ele_ft: 9000 }, 2700),
    ]),
    lakes([point(1702136232, { class: 'lake', name: 'Lake Ingalls' }, 100, 100)]),
  ])
  // The same crest again, in the next tile's buffer, and a second summit.
  const NE = encodeTile([
    peaks([
      point(14409 * 10 + 1, { class: 'peak', name: 'Columbia Crest', ele_ft: 14409 }, -10, EXTENT / 2),
      point(51, { class: 'peak', name: 'Little Tahoma', ele_ft: 11138 }),
    ]),
  ])
  const SW = encodeTile([peaks([point(61, { class: 'peak', name: 'Pyramid Peak', ele_ft: 6937 })])])
  // Outside the triangle: its centre is past the diagonal.
  const SE = encodeTile([peaks([point(71, { class: 'peak', name: 'Not Here', ele_ft: 5000 })])])
  const ALL = { [key(X, Y)]: NW, [key(X + 1, Y)]: NE, [key(X, Y + 1)]: SW, [key(X + 1, Y + 1)]: SE }

  it('answers the named peaks inside the ring, once each, as discovery reports them', async () => {
    const { fetchTile, asked } = fetching(ALL)
    const found = await discoverFromTiles(RING, ['peak'], false, fetchTile)
    expect(found?.map((d) => [d.name, d.type, d.elevation_ft, d.osm_id])).toEqual([
      ['Columbia Crest', 'peak', 14409, 'node/14409'],
      ['Little Tahoma', 'peak', 11138, 'node/5'],
      ['Pyramid Peak', 'peak', 6937, 'node/6'],
    ])
    expect(asked.sort()).toEqual(Object.keys(ALL).sort())
    const [lon, lat] = centre(X, Y)
    expect(found?.[0].longitude).toBeCloseTo(lon, 6)
    expect(found?.[0].latitude).toBeCloseTo(lat, 6)
  })

  it('names an unnamed summit by its elevation only when asked to', async () => {
    const with_ = await discoverFromTiles(RING, ['peak'], true, fetching(ALL).fetchTile)
    expect(with_?.map((d) => d.name)).toContain('Peak 9000')
    const without = await discoverFromTiles(RING, ['peak'], false, fetching(ALL).fetchTile)
    expect(without?.map((d) => d.name)).not.toContain('Peak 9000')
  })

  it('answers the lakes with no elevation, and only the kinds asked for', async () => {
    const found = await discoverFromTiles(RING, ['lake', 'trailhead'], false, fetching(ALL).fetchTile)
    expect(found).toEqual([
      expect.objectContaining({ name: 'Lake Ingalls', type: 'lake', elevation_ft: null, osm_id: 'way/170213623' }),
    ])
    const both = await discoverFromTiles(RING, ['peak', 'lake'], false, fetching(ALL).fetchTile)
    expect(both?.map((d) => d.type)).toEqual(['peak', 'lake', 'peak', 'peak'])
  })

  // A partial answer would be a field with holes in it, so one unreadable
  // tile sends the whole ring to the map server, and nothing more is fetched.
  it('gives the ring up to the map server when a tile cannot be read', async () => {
    expect(await discoverFromTiles(RING, ['peak'], false, fetching({ ...ALL, [key(X + 1, Y)]: null }).fetchTile)).toBeNull()
    expect(await discoverFromTiles(RING, ['peak'], false, fetching({ ...ALL, [key(X + 1, Y)]: PNG }).fetchTile)).toBeNull()
    expect(await discoverFromTiles(RING, ['peak'], false, fetching({ ...ALL, [key(X, Y)]: new Error('offline') }).fetchTile)).toBeNull()
  })

  it('answers an empty ring from empty tiles', async () => {
    expect(await discoverFromTiles(RING, ['peak', 'lake'], false, fetching({}).fetchTile)).toEqual([])
  })

  // For the loading card's bar (#745): every tile read, against the count.
  it('reports each tile read against the ring\'s count', async () => {
    const seen: [number, number][] = []
    await discoverFromTiles(RING, ['peak'], false, fetching(ALL).fetchTile, (read, total) => seen.push([read, total]))
    expect(seen).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]])
  })
})
