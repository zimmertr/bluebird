import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import type { CustomDestination } from '../types'
import { geoKey } from './points'
import type { Identity } from './elevationLookup'

/**
 * The elevation lookup's first source (#673): the basemap's own vector tiles.
 *
 * OpenFreeMap's `mountain_peak` layer carries every OSM peak and volcano node
 * at zoom 14 (lower zooms keep five per label-grid cell), with the elevation
 * in feet rounded from OSM's raw metres, which is the number the pod's
 * Overpass lookup reports, and the OSM node id inside the feature id. So a
 * pasted coordinate can be placed from a few static, edge-cached tile fetches
 * in well under a second, with no map server in the loop: measured 2026-10-07
 * on the 100 Bulgers, 135 tiles, 353 KB, 0.2 to 0.7 s, every elevation and
 * OSM id identical to Overpass's. The tiles are rebuilt weekly, so a node
 * edited since is the pod's lookup to find; that lookup runs behind this one
 * for whatever this one leaves.
 *
 * Pure except for the two fetchers at the bottom: the matching takes bytes
 * or decoded peaks, so it is tested from a tile built in a test.
 */

// The one zoom the layer is complete at (MountainPeak.java in
// planetiler-openmaptiles: five per label-grid cell from zoom 7 to 13).
export const PEAK_TILE_ZOOM = 14

// How far a coordinate may stand from the node it is matched to, and the rule
// is the pod's: the nearest node inside it, whether or not that node carries
// an elevation. Mirrors `CUSTOM_MATCH_RADIUS_M` in
// backend/app/services/osm/enrich.py (#207; measured there, re-measure
// before changing either), held to it by mirroredConstants.test.ts.
export const PEAK_MATCH_RADIUS_M = 150

// How far a node of the SAME name may stand, for a row the coordinate match
// left. A guidebook's coordinate and OSM's node for one summit can sit a few
// hundred metres apart (Buck Mountain, 174 m on 2026-10-07), where a bare
// coordinate match reaches nothing. 500 m reached the wrong Reynolds Peak (a
// named 8,350 ft node 514 m from the 8,510 ft summit), so the reach stays
// short.
export const PEAK_NAME_RADIUS_M = 300

export const TILEJSON_URL = 'https://tiles.openfreemap.org/planet'
// Served as the current build when the TileJSON cannot be read.
export const FALLBACK_TILE_TEMPLATE = 'https://tiles.openfreemap.org/planet/latest/{z}/{x}/{y}.pbf'
// A tile the edge serves answers in well under a second (the 135 above took
// 0.2 to 0.7 s together), so one not back in this long is a host that is not
// answering, and its rows go to the pod's lookup.
export const TILE_DEADLINE_MS = 5_000
// Tile fetches in flight at once: MapLibre's own ceiling on its tile requests
// (`maxParallelImageRequests`), so the lookup asks the host for no more at
// once than the map beside it does. It matters on a cold edge cache, where
// every tile is an origin round trip: 135 tiles at 8 in flight took 7.5 s on
// 2026-10-07, at 16 half that, and the same tiles warm took 1.4 s.
export const TILE_CONCURRENCY = 16

export interface TilePeak {
  // The OSM node, read out of the feature id; null when the id was absent.
  osm_id: string | null
  name: string | null
  elevation_ft: number | null
  latitude: number
  longitude: number
  // The raw feature id, for counting a peak that sits in two tiles' buffers
  // once.
  id: number
}

export interface TileRef {
  z: number
  x: number
  y: number
}

const EARTH_CIRCUMFERENCE_M = 40_075_016.686
const EARTH_RADIUS_M = 6_371_000

// The tile under a point, in fractional tile units, and a tile's width in
// metres at that latitude.
function tileFraction(latitude: number, longitude: number, z: number) {
  const n = 2 ** z
  const rad = (latitude * Math.PI) / 180
  return {
    xf: ((longitude + 180) / 360) * n,
    yf: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
    widthM: (EARTH_CIRCUMFERENCE_M * Math.cos(rad)) / n,
  }
}

/** The tile a point falls in. */
export function tileAt(latitude: number, longitude: number, z = PEAK_TILE_ZOOM): TileRef {
  const { xf, yf } = tileFraction(latitude, longitude, z)
  return { z, x: Math.floor(xf), y: Math.floor(yf) }
}

/**
 * Every tile that comes within `radiusM` of a point: the one under it, and
 * each neighbour whose edge is nearer than the radius. A tile's buffer would
 * often cover the gap, but a tile is cheap and the buffer is a build setting
 * this code does not own.
 */
export function tilesWithin(latitude: number, longitude: number, radiusM: number, z = PEAK_TILE_ZOOM): TileRef[] {
  const { xf, yf, widthM } = tileFraction(latitude, longitude, z)
  const r = radiusM / widthM
  const n = 2 ** z
  const out: TileRef[] = []
  for (let x = Math.floor(xf - r); x <= Math.floor(xf + r); x++) {
    for (let y = Math.floor(yf - r); y <= Math.floor(yf + r); y++) {
      if (y < 0 || y >= n) continue
      out.push({ z, x: ((x % n) + n) % n, y })
    }
  }
  return out
}

export const tileKey = (t: TileRef) => `${t.z}/${t.x}/${t.y}`

/** Metres between two points, flat over the few hundred metres this reads. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p = Math.PI / 180
  const dx = (lon2 - lon1) * p * Math.cos(((lat1 + lat2) / 2) * p)
  const dy = (lat2 - lat1) * p
  return EARTH_RADIUS_M * Math.sqrt(dx * dx + dy * dy)
}

// Planetiler writes the feature id as the OSM id times ten plus the element
// type, where a node is 1 (OsmElement.java). Only nodes are in this layer, so
// an id that is not a node's is no id.
function osmIdOf(id: number | undefined): string | null {
  if (id === undefined || !Number.isFinite(id) || id % 10 !== 1) return null
  return `node/${(id - 1) / 10}`
}

/**
 * The peaks and volcanoes in one tile's `mountain_peak` layer. Saddles share
 * the layer and are left out: a saddle 100 m from a summit is not the summit.
 * Bytes that are not a tile (an empty body, or a stub answering with an
 * image) are an empty tile.
 */
export function decodePeaks(bytes: Uint8Array, tile: TileRef): TilePeak[] {
  if (bytes.length === 0) return []
  let layer
  try {
    layer = new VectorTile(new PbfReader(bytes)).layers.mountain_peak
  } catch {
    return []
  }
  if (!layer) return []
  const n = 2 ** tile.z
  const out: TilePeak[] = []
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i)
    const kind = feature.properties.class
    if (kind !== 'peak' && kind !== 'volcano') continue
    const point = feature.loadGeometry()[0]?.[0]
    if (!point) continue
    const longitude = ((tile.x + point.x / layer.extent) / n) * 360 - 180
    const latitude = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (tile.y + point.y / layer.extent)) / n))) * 180) / Math.PI
    const ele = feature.properties.ele_ft
    const name = feature.properties.name
    out.push({
      osm_id: osmIdOf(feature.id),
      name: typeof name === 'string' && name !== '' ? name : null,
      elevation_ft: typeof ele === 'number' && Number.isFinite(ele) ? ele : null,
      latitude,
      longitude,
      id: feature.id ?? -1 - i,
    })
  }
  return out
}

/**
 * A name as it is compared: a list's own numbering stripped ("12. Mount
 * Stuart"), case folded, punctuation gone.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^\d+[.)]?\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * The peak a point stands on, by the pod's rule: the nearest node within the
 * match radius, with or without an elevation. A node that sits in two tiles'
 * buffers counts once.
 */
export function nearestPeak(
  latitude: number,
  longitude: number,
  peaks: readonly TilePeak[],
  radiusM = PEAK_MATCH_RADIUS_M,
): TilePeak | null {
  let best: TilePeak | null = null
  let bestM = Infinity
  const seen = new Set<number>()
  for (const peak of peaks) {
    if (seen.has(peak.id)) continue
    seen.add(peak.id)
    const d = distanceM(latitude, longitude, peak.latitude, peak.longitude)
    if (d <= radiusM && d < bestM) {
      best = peak
      bestM = d
    }
  }
  return best
}

/** The nearest node of the same name within the name radius that has an elevation. */
export function peakByName(
  latitude: number,
  longitude: number,
  name: string,
  peaks: readonly TilePeak[],
  radiusM = PEAK_NAME_RADIUS_M,
): TilePeak | null {
  const want = normalizeName(name)
  if (!want) return null
  let best: TilePeak | null = null
  let bestM = Infinity
  const seen = new Set<number>()
  for (const peak of peaks) {
    if (seen.has(peak.id)) continue
    seen.add(peak.id)
    if (peak.elevation_ft === null || peak.name === null || normalizeName(peak.name) !== want) continue
    const d = distanceM(latitude, longitude, peak.latitude, peak.longitude)
    if (d <= radiusM && d < bestM) {
      best = peak
      bestM = d
    }
  }
  return best
}

/** What a placed row learns from its peak. */
export function identityOf(peak: TilePeak): Identity {
  return { elevation_ft: peak.elevation_ft, osm_id: peak.osm_id }
}

/** One tile's bytes, or null when it could not be read. */
export type FetchTile = (tile: TileRef) => Promise<Uint8Array | null>

// One lookup's tiles, by key, null for a tile that could not be read, and
// whether one has failed: after the first failure nothing more is fetched,
// since the rows go to the pod's lookup either way and a host that is not
// answering must not be waited on once per tile.
interface Pass {
  tiles: Map<string, TilePeak[] | null>
  broken: boolean
}

// Fetch and decode the tiles the pass does not hold yet, at most
// `TILE_CONCURRENCY` at once.
async function fetchInto(pass: Pass, refs: readonly TileRef[], fetchTile: FetchTile): Promise<void> {
  const queue = refs.filter((t) => !pass.tiles.has(tileKey(t)))
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const bytes = pass.broken ? null : await fetchTile(t).catch(() => null)
      if (bytes === null) pass.broken = true
      pass.tiles.set(tileKey(t), bytes === null ? null : decodePeaks(bytes, t))
    }
  }
  await Promise.all(Array.from({ length: Math.min(TILE_CONCURRENCY, queue.length) }, worker))
}

function refsAround(rows: readonly CustomDestination[], radiusM: number): TileRef[] {
  const refs = new Map<string, TileRef>()
  for (const r of rows) for (const t of tilesWithin(r.latitude, r.longitude, radiusM)) refs.set(tileKey(t), t)
  return [...refs.values()]
}

function peaksAround(pass: Pass, latitude: number, longitude: number, radiusM: number): TilePeak[] {
  const out: TilePeak[] = []
  for (const t of tilesWithin(latitude, longitude, radiusM)) {
    const got = pass.tiles.get(tileKey(t))
    if (got) out.push(...got)
  }
  return out
}

/**
 * Place a list from the tiles: the coordinate match first, over every tile
 * within the match radius of any row, then the name match over the wider ring
 * for the rows it left. The answer holds only the rows placed with an
 * elevation. A row whose nearest node has none, or whose tiles could not be
 * read, is not in it, so the pod's lookup is asked about that row: the pod's
 * answer is the fresher one, and a null from it is final where a null here is
 * only as current as the last tile build.
 */
export async function lookupPeaks(rows: readonly CustomDestination[], fetchTile: FetchTile): Promise<Map<string, Identity>> {
  const placed = new Map<string, Identity>()
  if (rows.length === 0) return placed
  const pass: Pass = { tiles: new Map(), broken: false }
  await fetchInto(pass, refsAround(rows, PEAK_MATCH_RADIUS_M), fetchTile)
  const leftovers: CustomDestination[] = []
  for (const r of rows) {
    const peak = nearestPeak(r.latitude, r.longitude, peaksAround(pass, r.latitude, r.longitude, PEAK_MATCH_RADIUS_M))
    if (peak && peak.elevation_ft !== null) placed.set(geoKey(r.latitude, r.longitude), identityOf(peak))
    else leftovers.push(r)
  }
  if (leftovers.length > 0) {
    await fetchInto(pass, refsAround(leftovers, PEAK_NAME_RADIUS_M), fetchTile)
    for (const r of leftovers) {
      const peak = peakByName(r.latitude, r.longitude, r.name, peaksAround(pass, r.latitude, r.longitude, PEAK_NAME_RADIUS_M))
      if (peak) placed.set(geoKey(r.latitude, r.longitude), identityOf(peak))
    }
  }
  return placed
}

let templatePromise: Promise<string> | null = null

/**
 * The tile URL template, read once per session from the TileJSON: a dated,
 * immutable path, so a tile the map already drew is served from the browser's
 * cache. Anything but a readable TileJSON falls back to the `latest` path,
 * which the host answers with the current build.
 */
export function tileTemplate(fetchJson: (url: string) => Promise<unknown> = fetchTileJson): Promise<string> {
  templatePromise ??= fetchJson(TILEJSON_URL)
    .then((body) => {
      const tiles = (body as { tiles?: unknown } | null)?.tiles
      const first = Array.isArray(tiles) ? tiles[0] : null
      return typeof first === 'string' && first.includes('{z}') ? first : FALLBACK_TILE_TEMPLATE
    })
    .catch(() => FALLBACK_TILE_TEMPLATE)
  return templatePromise
}

async function fetchTileJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TILE_DEADLINE_MS) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// The deadline and the caller's own signal as one, without `AbortSignal.any`,
// which openMeteo.ts notes is not in every browser the app runs in.
function withDeadline(signal: AbortSignal | undefined): AbortSignal {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TILE_DEADLINE_MS)
  const onAbort = () => {
    clearTimeout(timer)
    controller.abort()
  }
  if (signal?.aborted) onAbort()
  else signal?.addEventListener('abort', onAbort, { once: true })
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true })
  return controller.signal
}

/** A fetcher for one tile's bytes from the live host, null when it cannot be read. */
export function fetchTileWith(template: string, signal?: AbortSignal): FetchTile {
  return async (t) => {
    const url = template.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y))
    const res = await fetch(url, { signal: withDeadline(signal) })
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  }
}

/** Forget the memoized template (tests). */
export function resetPeakTiles(): void {
  templatePromise = null
}
