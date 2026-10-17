import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import type { Position } from 'geojson'
import type { DiscoveredDestination, DiscoveryType } from '../types'
import { pointInRing } from './fireProximity'
import { PEAK_TILE_ZOOM, TILE_CONCURRENCY, decodePeaks, tileKey, type FetchTile, type TileRef } from './peakTiles'

/**
 * A ring's discovery from the basemap's own tiles (#675): the peaks and the
 * lakes inside a drawn area, read from the zoom-14 tiles under it rather than
 * asked of the map server, which fails most attempts on a busy evening and
 * answers in ten seconds on a good one. The tiles are static files on an edge
 * cache, so a ring's worth arrives in well under a second warm.
 *
 * What the tiles answer: the `mountain_peak` layer, complete at zoom 14, with
 * the pod's own classification (a named peak or volcano is a peak; an unnamed
 * one with an elevation is `Peak N` when the reader asks for those), and the
 * `water_name` layer's named lakes. Measured 2026-10-07 over three rings
 * (the Enchantments, Mount Baker, the Olympics' Seven Lakes basin): the
 * peaks were Overpass's exactly (42 of 42, 28 of 28, 16 of 16), and the lakes
 * a superset (46 to 40, 16 to 3, 23 to 4), because the pod's query keeps
 * `water=lake` alone and the tiles carry every named water body, tarns and
 * ponds and reservoirs included. The maintainer took the superset
 * (2026-10-07, decision 0118). What the tiles cannot answer: trailheads,
 * which no tile layer carries, crags, which the tiles hold only as climbing
 * points that cannot be told from routes (decision 0159), and a ring over
 * `DISCOVERY_TILE_BUDGET`,
 * which would take longer to read from a cold edge than the map server
 * takes to answer; both keep the Overpass path, through `analysisPipeline`.
 *
 * Pure except for what it is handed: the fetcher is the caller's
 * (`fetchTileWith` in peakTiles.ts), so every rule here is tested from tiles
 * built in a test.
 */

// The most zoom-14 tiles a ring may read before it goes to the map server
// instead. Counted over the tiles the ring touches, not its bounding box, so
// a ring drawn along a range pays for no empty corners (#745). The ceiling is
// where a cold edge stops being worth the wait: every tile there is an origin
// round trip, and at 16 in flight 256 took 5.4 s and 1,024 took 17.9 s on
// 2026-10-16 (curl, a BC interior block the edge had not held), against the
// map server's ten-second median and a failure rate of one attempt in three
// to five in six (0118). Warm, the same 1,024 took 2.4 s. The maintainer took
// a cold read slower than a good evening's map server for a read that cannot
// fail the way the map server does (2026-10-16, decision 0170). OpenFreeMap's
// terms (2026-10-14) allow an area read of up to 3,000 tiles or 50 MB; this
// many is about 4 MB at the densest. About 2,800 km² at 47° N, a 53 km
// square. Was 256 (0118).
export const DISCOVERY_TILE_BUDGET = 1024

// The kinds the tiles answer. Trailheads are in no OpenMapTiles layer, and
// crags only as `class=climbing` points that include every route (0159).
export const TILE_TYPES: ReadonlySet<DiscoveryType> = new Set<DiscoveryType>(['peak', 'lake'])

/** The kinds of a request the tiles answer, and the ones the map server keeps. */
export function splitTypes(types: readonly DiscoveryType[]): { tiles: DiscoveryType[]; server: DiscoveryType[] } {
  return { tiles: types.filter((t) => TILE_TYPES.has(t)), server: types.filter((t) => !TILE_TYPES.has(t)) }
}

// Tile columns are lines of constant longitude and tile rows are bands of
// latitude, so the ring's edges are tested in the plane of longitude and
// latitude, the plane `pointInRing` reads the rows in. A tile is touched when
// an edge crosses it, or when it lies wholly inside the ring, in which case
// its centre does and a scan line through the band finds it; a square with
// no edge through it is on one side of the ring or the other.
const xOf = (lon: number) => ((lon + 180) / 360) * 2 ** PEAK_TILE_ZOOM
const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** PEAK_TILE_ZOOM))) * 180) / Math.PI
const yOf = (lat: number) => {
  const rad = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** PEAK_TILE_ZOOM
}

/** Every zoom-14 tile the ring touches, in row order. */
export function tilesCovering(ring: readonly Position[]): TileRef[] {
  if (ring.length === 0) return []
  const n = 2 ** PEAK_TILE_ZOOM
  const last = n - 1
  const clamp = (v: number) => Math.min(last, Math.max(0, Math.floor(v)))
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const [lon, lat] of ring) {
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }
  const x0 = clamp(xOf(minLon))
  const x1 = clamp(xOf(maxLon))
  const edges: [Position, Position][] = []
  for (let i = 0; i < ring.length; i++) edges.push([ring[i], ring[(i + 1) % ring.length]])
  const out: TileRef[] = []
  for (let y = clamp(yOf(maxLat)); y <= clamp(yOf(minLat)); y++) {
    const north = latOf(y)
    const south = latOf(y + 1)
    const mid = (north + south) / 2
    const touched = new Uint8Array(x1 - x0 + 1)
    const mark = (lonA: number, lonB: number) => {
      for (let x = Math.max(x0, clamp(xOf(lonA))); x <= Math.min(x1, clamp(xOf(lonB))); x++) touched[x - x0] = 1
    }
    const crossings: number[] = []
    for (const [[lonA, latA], [lonB, latB]] of edges) {
      // The edge's run inside this band, as a span of longitude.
      if (latA === latB) {
        if (latA <= north && latA >= south) mark(Math.min(lonA, lonB), Math.max(lonA, lonB))
      } else {
        const tS = (south - latA) / (latB - latA)
        const tN = (north - latA) / (latB - latA)
        const t0 = Math.max(0, Math.min(tS, tN))
        const t1 = Math.min(1, Math.max(tS, tN))
        if (t0 <= t1) {
          const a = lonA + t0 * (lonB - lonA)
          const b = lonA + t1 * (lonB - lonA)
          mark(Math.min(a, b), Math.max(a, b))
        }
      }
      // Where the edge crosses the band's middle, for the tiles inside.
      if (latA > mid !== latB > mid) crossings.push(lonA + ((mid - latA) / (latB - latA)) * (lonB - lonA))
    }
    crossings.sort((a, b) => a - b)
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const from = Math.max(x0, Math.ceil(xOf(crossings[i]) - 0.5))
      const to = Math.min(x1, Math.floor(xOf(crossings[i + 1]) - 0.5))
      for (let x = from; x <= to; x++) touched[x - x0] = 1
    }
    for (let x = x0; x <= x1; x++) if (touched[x - x0]) out.push({ z: PEAK_TILE_ZOOM, x, y })
  }
  return out
}

/** Whether a ring's discovery is the tiles' to answer: a kind they carry, inside the budget. */
export function tileDiscoverable(ring: readonly Position[], types: readonly DiscoveryType[]): boolean {
  if (splitTypes(types).tiles.length === 0) return false
  const n = tilesCovering(ring).length
  return n > 0 && n <= DISCOVERY_TILE_BUDGET
}

export interface TileLake {
  osm_id: string | null
  name: string
  latitude: number
  longitude: number
  id: number
}

// Planetiler writes the feature id as the OSM id times ten plus the element
// type: 1 a node, 2 a way, 3 a relation (OsmElement.java). A lake is any of
// the three.
const ELEMENT_TYPES: Record<number, string> = { 1: 'node', 2: 'way', 3: 'relation' }
function osmIdOf(id: number | undefined): string | null {
  if (id === undefined || !Number.isFinite(id)) return null
  const kind = ELEMENT_TYPES[id % 10]
  return kind ? `${kind}/${Math.floor(id / 10)}` : null
}

/**
 * The tile's layers, or null for bytes that are no tile at all. The lookup
 * reads such bytes as an empty tile (`decodePeaks`); a discovery must not,
 * because an empty answer here means "nothing in this ring" and skips the map
 * server, where a stub answering with an image means nothing of the kind.
 * An empty body is a genuinely empty tile, which the host answers for open
 * water and the browser suite answers for everything.
 */
function readTile(bytes: Uint8Array): VectorTile | null {
  if (bytes.length === 0) return null
  try {
    const tile = new VectorTile(new PbfReader(bytes))
    return Object.keys(tile.layers).length > 0 ? tile : null
  } catch {
    return null
  }
}

/**
 * Whether bytes decode as a tile: empty, or at least one layer with a feature
 * in it. Planetiler writes no empty layers and the decoder keeps none, so a
 * layer is what an image or an error page read as protobuf cannot produce.
 */
export function isTile(bytes: Uint8Array): boolean {
  return bytes.length === 0 || readTile(bytes) !== null
}

/**
 * The named lakes in one tile's `water_name` layer. A label is a point or a
 * centre line; a line's middle vertex stands for the lake. The layer's one
 * class for inland water is `lake`, whatever OSM's `water` subtype says.
 */
export function decodeLakes(bytes: Uint8Array, tile: TileRef): TileLake[] {
  const vt = readTile(bytes)
  const layer = vt?.layers.water_name
  if (!layer) return []
  const n = 2 ** tile.z
  const out: TileLake[] = []
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i)
    if (feature.properties.class !== 'lake') continue
    const name = feature.properties.name
    if (typeof name !== 'string' || name === '') continue
    const line = feature.loadGeometry()[0]
    const point = line?.[Math.floor((line.length - 1) / 2)]
    if (!point) continue
    out.push({
      osm_id: osmIdOf(feature.id),
      name,
      longitude: ((tile.x + point.x / layer.extent) / n) * 360 - 180,
      latitude: (Math.atan(Math.sinh(Math.PI * (1 - (2 * (tile.y + point.y / layer.extent)) / n))) * 180) / Math.PI,
      id: feature.id ?? -1 - i,
    })
  }
  return out
}

/**
 * The rows a ring's tiles answer, as discovery would report them: the pod's
 * classification (`_classify` in osm/query.py), its naming of an unnamed
 * summit (`Peak N`, row 20 of the mirror table), one row per OSM element
 * however many tiles' buffers carry it, and only the elements inside the
 * ring. Null when a tile could not be read, which sends the whole ring to the
 * map server: a partial answer would be a field with holes in it. Reports
 * each tile read against the ring's count, for the loading card's bar (#745).
 */
export async function discoverFromTiles(
  ring: readonly Position[],
  types: readonly DiscoveryType[],
  includeUnnamedPeaks: boolean,
  fetchTile: FetchTile,
  onProgress?: (read: number, total: number) => void,
): Promise<DiscoveredDestination[] | null> {
  const wanted = new Set(splitTypes(types).tiles)
  const refs = tilesCovering(ring)
  const tiles = new Map<string, Uint8Array | null>()
  let broken = false
  const queue = [...refs]
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const bytes = broken ? null : await fetchTile(t).catch(() => null)
      if (bytes === null || !isTile(bytes)) broken = true
      tiles.set(tileKey(t), bytes)
      onProgress?.(tiles.size, refs.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(TILE_CONCURRENCY, queue.length) }, worker))
  if (broken) return null
  const out: DiscoveredDestination[] = []
  const seen = new Set<string>()
  const take = (key: string, row: DiscoveredDestination) => {
    if (seen.has(key) || !pointInRing(row.longitude, row.latitude, ring as Position[])) return
    seen.add(key)
    out.push(row)
  }
  for (const t of refs) {
    const bytes = tiles.get(tileKey(t))
    if (!bytes) continue
    if (wanted.has('peak')) {
      for (const p of decodePeaks(bytes, t)) {
        const name = p.name ?? (includeUnnamedPeaks && p.elevation_ft !== null ? `Peak ${Math.round(p.elevation_ft)}` : null)
        if (name === null) continue
        take(`peak:${p.osm_id ?? p.id}`, {
          name,
          type: 'peak',
          latitude: p.latitude,
          longitude: p.longitude,
          elevation_ft: p.elevation_ft,
          osm_id: p.osm_id,
        })
      }
    }
    if (wanted.has('lake')) {
      for (const l of decodeLakes(bytes, t)) {
        take(`lake:${l.osm_id ?? l.id}`, {
          name: l.name,
          type: 'lake',
          latitude: l.latitude,
          longitude: l.longitude,
          elevation_ft: null,
          osm_id: l.osm_id,
        })
      }
    }
  }
  return out
}
