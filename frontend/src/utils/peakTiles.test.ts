import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeTile, type MvtPoint } from '../testSupport/mvt'
import {
  FALLBACK_TILE_TEMPLATE,
  PEAK_MATCH_RADIUS_M,
  PEAK_NAME_RADIUS_M,
  PEAK_TILE_ZOOM,
  TILE_CONCURRENCY,
  TILEJSON_URL,
  decodePeaks,
  distanceM,
  fetchTileWith,
  lookupPeaks,
  nearestPeak,
  normalizeName,
  peakByName,
  resetPeakTiles,
  tileAt,
  tileKey,
  tileTemplate,
  tilesWithin,
  type TilePeak,
  type TileRef,
} from './peakTiles'
import { geoKey } from './points'

// Mount Rainier's tile at zoom 14, and that tile's centre, computed apart
// from the module (the slippy-map formula in Python, 2026-10-07).
const RAINIER = { latitude: 46.8529, longitude: -121.7604 }
const TILE: TileRef = { z: 14, x: 2650, y: 5772 }
const CENTRE_TILE: TileRef = { z: 14, x: 2650, y: 5770 }
const CENTRE = { latitude: 46.882723, longitude: -121.761475 }
// About 100 m, at that latitude.
const LAT_100M = 0.0008983
const LON_100M = 0.0013143

// A peak feature at tile-local pixel (x, y) of a 4096 extent.
function peak(id: number, x: number, y: number, properties: MvtPoint['properties']): MvtPoint {
  return { id, x, y, properties }
}

// A tile holding Columbia Crest at its centre, a saddle beside it, a named
// node with no elevation, and an unnamed one with. Feature ids are the
// node ids times ten plus one, as Planetiler writes them.
const TILE_BYTES = encodeTile([
  {
    name: 'mountain_peak',
    points: [
      peak(17449034931, 2048, 2048, { class: 'peak', name: 'Columbia Crest', ele_ft: 14409 }),
      peak(21, 2100, 2048, { class: 'saddle', name: 'A Col', ele_ft: 14000 }),
      peak(31, 2048, 2200, { class: 'peak', name: 'Raven Ridge' }),
      peak(41, 2700, 2048, { class: 'volcano', ele_ft: 9000 }),
    ],
  },
  { name: 'water_name', points: [peak(52, 10, 10, { class: 'lake', name: 'A Lake' })] },
])

afterEach(() => {
  vi.unstubAllGlobals()
  resetPeakTiles()
})

describe('the tile under a point', () => {
  it('is the slippy-map tile at the one zoom the layer is complete at', () => {
    expect(PEAK_TILE_ZOOM).toBe(14)
    expect(tileAt(RAINIER.latitude, RAINIER.longitude)).toEqual(TILE)
  })

  it('reaches into a neighbour only when the point stands within the radius of its edge', () => {
    // The centre: one tile. A tile at this latitude is about 1,672 m wide,
    // so 150 m from the centre reaches no edge.
    expect(tilesWithin(CENTRE.latitude, CENTRE.longitude, 150).map(tileKey)).toEqual([tileKey(CENTRE_TILE)])
    // Just inside the west edge: the tile to the west joins.
    const west = CENTRE.longitude - 0.5 * (1672 / 100) * LON_100M + LON_100M * 0.5
    expect(tilesWithin(CENTRE.latitude, west, 150).map(tileKey)).toEqual(['14/2649/5770', '14/2650/5770'])
    // A radius wider than the tile reaches the whole ring.
    expect(tilesWithin(CENTRE.latitude, CENTRE.longitude, 1700)).toHaveLength(9)
  })
})

describe('decodePeaks', () => {
  it('reads peaks and volcanoes with their place, elevation, name and OSM node', () => {
    const peaks = decodePeaks(TILE_BYTES, CENTRE_TILE)
    expect(peaks.map((p) => p.name)).toEqual(['Columbia Crest', 'Raven Ridge', null])
    expect(peaks.map((p) => p.elevation_ft)).toEqual([14409, null, 9000])
    expect(peaks.map((p) => p.osm_id)).toEqual(['node/1744903493', 'node/3', 'node/4'])
    expect(peaks[0].latitude).toBeCloseTo(CENTRE.latitude, 5)
    expect(peaks[0].longitude).toBeCloseTo(CENTRE.longitude, 5)
  })

  it('leaves out a saddle and every other layer', () => {
    const names = decodePeaks(TILE_BYTES, CENTRE_TILE).map((p) => p.name)
    expect(names).not.toContain('A Col')
    expect(names).not.toContain('A Lake')
  })

  it('reads an empty body, and bytes that are no tile, as an empty tile', () => {
    expect(decodePeaks(new Uint8Array(), CENTRE_TILE)).toEqual([])
    // A PNG header, which is what the browser suite's stub answers with.
    expect(decodePeaks(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), CENTRE_TILE)).toEqual([])
  })
})

describe('the match', () => {
  const at = (dLat: number, dLon: number, over: Partial<TilePeak> = {}): TilePeak => ({
    osm_id: 'node/9',
    name: 'Probe',
    elevation_ft: 5000,
    latitude: CENTRE.latitude + dLat,
    longitude: CENTRE.longitude + dLon,
    id: 91,
    ...over,
  })

  it('measures the few hundred metres it reads to within a metre', () => {
    expect(distanceM(CENTRE.latitude, CENTRE.longitude, CENTRE.latitude + LAT_100M, CENTRE.longitude)).toBeCloseTo(100, 0)
    expect(distanceM(CENTRE.latitude, CENTRE.longitude, CENTRE.latitude, CENTRE.longitude + LON_100M)).toBeCloseTo(100, 0)
  })

  it('takes the nearest node within the radius, with or without an elevation, as the pod does', () => {
    const near = at(0.5 * LAT_100M, 0, { id: 1, elevation_ft: null })
    const far = at(LAT_100M, 0, { id: 2 })
    expect(nearestPeak(CENTRE.latitude, CENTRE.longitude, [far, near])).toBe(near)
    expect(PEAK_MATCH_RADIUS_M).toBe(150)
    expect(nearestPeak(CENTRE.latitude, CENTRE.longitude, [at(1.6 * LAT_100M, 0)])).toBeNull()
  })

  it('counts a node that sits in two tiles once', () => {
    const twice = at(0, LON_100M)
    expect(nearestPeak(CENTRE.latitude, CENTRE.longitude, [twice, { ...twice }])).toBe(twice)
  })

  it('matches a name within its own radius, case, punctuation and a list number aside, only with an elevation', () => {
    expect(normalizeName('12. Mount Stuart')).toBe('mount stuart')
    expect(normalizeName("Mt. St. Helens")).toBe('mt st helens')
    expect(PEAK_NAME_RADIUS_M).toBe(300)
    const named = at(2 * LAT_100M, 0, { name: 'Buck Mountain', id: 5 })
    expect(peakByName(CENTRE.latitude, CENTRE.longitude, '7. buck mountain', [named])).toBe(named)
    expect(peakByName(CENTRE.latitude, CENTRE.longitude, 'Buck Mountain', [{ ...named, elevation_ft: null }])).toBeNull()
    expect(peakByName(CENTRE.latitude, CENTRE.longitude, 'Buck Mountain', [at(3.5 * LAT_100M, 0, { name: 'Buck Mountain' })])).toBeNull()
    expect(peakByName(CENTRE.latitude, CENTRE.longitude, '', [named])).toBeNull()
  })
})

describe('lookupPeaks', () => {
  // Rows: one on Columbia Crest, one 100 m west of the unnamed volcano (which
  // stands 652 pixels, about 266 m, east of the crest), one on the
  // no-elevation node, and one far from everything.
  const ON_CREST = { name: '1. Mount Rainier', latitude: CENTRE.latitude, longitude: CENTRE.longitude }
  const BY_VOLCANO = { name: 'Nameless', latitude: CENTRE.latitude, longitude: CENTRE.longitude + (652 / 4096) * (360 / 2 ** 14) - LON_100M }
  const ON_RAVEN = { name: 'Raven Ridge', latitude: CENTRE.latitude - (152 / 4096) * (1672 / 100) * LAT_100M, longitude: CENTRE.longitude }
  const ALONE = { name: 'Elsewhere', latitude: 47.5, longitude: -121.0 }

  function fetcher(answer: (t: TileRef) => Uint8Array | null | Promise<Uint8Array | null>) {
    return vi.fn(async (t: TileRef) => answer(t))
  }
  const tileOf = (t: TileRef) => (tileKey(t) === tileKey(CENTRE_TILE) ? TILE_BYTES : new Uint8Array())

  it('places each row on the nearest node with an elevation, and leaves the rest', async () => {
    const fetchTile = fetcher(tileOf)
    const placed = await lookupPeaks([ON_CREST, BY_VOLCANO, ON_RAVEN, ALONE], fetchTile)
    expect(placed.get(geoKey(ON_CREST.latitude, ON_CREST.longitude))).toEqual({ elevation_ft: 14409, osm_id: 'node/1744903493' })
    expect(placed.get(geoKey(BY_VOLCANO.latitude, BY_VOLCANO.longitude))).toEqual({ elevation_ft: 9000, osm_id: 'node/4' })
    // The nearest node has no elevation: not an answer here, the pod's to give.
    expect(placed.has(geoKey(ON_RAVEN.latitude, ON_RAVEN.longitude))).toBe(false)
    expect(placed.has(geoKey(ALONE.latitude, ALONE.longitude))).toBe(false)
  })

  it('fetches each tile once, and only the tiles within reach of a row', async () => {
    const fetchTile = fetcher(tileOf)
    await lookupPeaks([ON_CREST, { ...ON_CREST, name: 'Again', latitude: ON_CREST.latitude + LAT_100M }], fetchTile)
    expect(fetchTile).toHaveBeenCalledTimes(1)
    expect(fetchTile.mock.calls[0][0]).toEqual(CENTRE_TILE)
  })

  it('reaches the wider ring by name for a row the coordinate match left', async () => {
    const away = { name: 'Buck Mountain', latitude: CENTRE.latitude + 2 * LAT_100M, longitude: CENTRE.longitude }
    const tile = encodeTile([{ name: 'mountain_peak', points: [peak(71, 2048, 2048, { class: 'peak', name: 'Buck Mountain', ele_ft: 8527 })] }])
    const fetchTile = fetcher((t) => (tileKey(t) === tileKey(CENTRE_TILE) ? tile : new Uint8Array()))
    const placed = await lookupPeaks([away], fetchTile)
    expect(placed.get(geoKey(away.latitude, away.longitude))).toEqual({ elevation_ft: 8527, osm_id: 'node/7' })
  })

  it('answers nothing for an empty list without fetching', async () => {
    const fetchTile = fetcher(tileOf)
    expect((await lookupPeaks([], fetchTile)).size).toBe(0)
    expect(fetchTile).not.toHaveBeenCalled()
  })

  it('stops at the first tile that cannot be read and leaves those rows to the pod', async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ name: `Row ${i}`, latitude: 47 + i * 0.01, longitude: -121 }))
    let calls = 0
    const fetchTile = fetcher(() => {
      calls += 1
      return calls === 1 ? null : new Uint8Array()
    })
    const placed = await lookupPeaks(rows, fetchTile)
    expect(placed.size).toBe(0)
    // The pool was in flight when the first failed; nothing was queued after.
    expect(calls).toBeLessThanOrEqual(TILE_CONCURRENCY)
  })

  it('treats a fetch that throws as a tile that could not be read', async () => {
    const fetchTile = fetcher(() => Promise.reject(new TypeError('Failed to fetch')))
    expect((await lookupPeaks([ON_CREST], fetchTile)).size).toBe(0)
  })

  it('runs at most the pool in flight at once', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ name: `Row ${i}`, latitude: 47 + i * 0.02, longitude: -121 }))
    let inFlight = 0
    let most = 0
    const fetchTile = fetcher(async () => {
      inFlight += 1
      most = Math.max(most, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight -= 1
      return new Uint8Array()
    })
    await lookupPeaks(rows, fetchTile)
    expect(most).toBe(TILE_CONCURRENCY)
  })
})

describe('the tile host', () => {
  it('reads the template once from the TileJSON', async () => {
    const fetchJson = vi.fn(async () => ({ tiles: ['https://tiles.openfreemap.org/planet/20261005_001001_pt/{z}/{x}/{y}.pbf'] }))
    expect(await tileTemplate(fetchJson)).toBe('https://tiles.openfreemap.org/planet/20261005_001001_pt/{z}/{x}/{y}.pbf')
    expect(await tileTemplate(fetchJson)).toBe('https://tiles.openfreemap.org/planet/20261005_001001_pt/{z}/{x}/{y}.pbf')
    expect(fetchJson).toHaveBeenCalledTimes(1)
    expect(fetchJson).toHaveBeenCalledWith(TILEJSON_URL)
  })

  it('falls back to the current build when the TileJSON is unreadable or not one', async () => {
    expect(await tileTemplate(async () => ({ not: 'tilejson' }))).toBe(FALLBACK_TILE_TEMPLATE)
    resetPeakTiles()
    expect(await tileTemplate(async () => Promise.reject(new SyntaxError('not JSON')))).toBe(FALLBACK_TILE_TEMPLATE)
  })

  it('fetches a tile at the template, and reads a refusal as a tile that could not be read', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('/14/2650/5770.pbf')
        ? { ok: true, arrayBuffer: async () => TILE_BYTES.buffer.slice(TILE_BYTES.byteOffset, TILE_BYTES.byteOffset + TILE_BYTES.byteLength) }
        : { ok: false, status: 403 },
    )
    vi.stubGlobal('fetch', fetch)
    const fetchTile = fetchTileWith('https://tiles.example/{z}/{x}/{y}.pbf')
    expect(await fetchTile(CENTRE_TILE)).toEqual(TILE_BYTES)
    expect(fetch.mock.calls[0][0]).toBe('https://tiles.example/14/2650/5770.pbf')
    expect(await fetchTile({ z: 14, x: 1, y: 1 })).toBeNull()
  })

  it('aborts a tile fetch with the caller', async () => {
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined
        return new Promise(() => {})
      }),
    )
    const controller = new AbortController()
    void fetchTileWith('https://tiles.example/{z}/{x}/{y}.pbf', controller.signal)(CENTRE_TILE)
    expect(signal?.aborted).toBe(false)
    controller.abort()
    expect(signal?.aborted).toBe(true)
  })
})
