import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { fetchTileWith, tileKey, tileTemplate, type FetchTile, type TileRef } from './peakTiles'

/**
 * Whether the snow analysis's cell under a point lies on a glacier (#748).
 *
 * NOAA's snow analysis models a snowpack and has no glacier ice in it, so
 * where snow never melts out its depth carries over from year to year: Mount
 * Rainier's summit read 68.62 m in September and Mount Baker's 67.61 m in
 * October, neither of them a season's snow. So the snow card names the place
 * (`snowPoint.ts`), and its numbers are read as a glacier's.
 *
 * The glaciers are OpenStreetMap's, read from the basemap's own vector tiles
 * (OpenFreeMap's `landcover` layer, class `ice`), at one zoom whatever the
 * map shows. The map's own drawing will not do: it carries Natural Earth's
 * coarse outlines at zooms 5 and 6, none at 7 and 8, and OSM's from 9, and
 * OSM leaves Baker's summit dome out of its outlines, so a point test on the
 * map read Baker's summit as bare ground from zoom 9 up. The question is
 * asked of the cell instead, a box of `SNOW_CELL_DEG` around the point,
 * because the number NOAA answers is the cell's: measured 2026-10-16, the
 * box test read Baker's and Rainier's and Hood's summits, the cell west of
 * Baker's and Camp Muir as glacier, and Paradise, Baker's ski area and
 * Timberline Lodge as not, the same at every zoom from 10 to 14.
 *
 * Where OSM has mapped no glacier, the check says no and the card keeps its
 * depth word.
 */

/** The zoom the glaciers are read at: one tile usually covers a cell, and the outlines matched zoom 14's. */
export const GLACIER_TILE_ZOOM = 12

/** The snow analysis's grid, 30 arc-seconds, about 1 km. */
export const SNOW_CELL_DEG = 1 / 120

/** One tile's glaciers, as rings in fractional tile units of its zoom. */
type Rings = readonly (readonly [number, number])[][]

/** The glacier polygons in one tile's bytes, each as its rings. Bytes that are no tile hold none. */
export function decodeGlaciers(bytes: Uint8Array, tile: TileRef): Rings[] {
  let layer
  try {
    layer = new VectorTile(new PbfReader(bytes)).layers.landcover
  } catch {
    return []
  }
  if (!layer) return []
  const out: Rings[] = []
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i)
    if (feature.properties.class !== 'ice') continue
    out.push(
      feature
        .loadGeometry()
        .map((ring) => ring.map((p) => [tile.x + p.x / layer.extent, tile.y + p.y / layer.extent] as [number, number])),
    )
  }
  return out
}

/** A longitude and latitude in fractional tile units at a zoom. */
function tileUnits(lng: number, lat: number, z: number): [number, number] {
  const n = 2 ** z
  const rad = (lat * Math.PI) / 180
  return [((lng + 180) / 360) * n, ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n]
}

/** The cell around a point, as its west-north and east-south corners in tile units. */
function cellBox(lng: number, lat: number, z = GLACIER_TILE_ZOOM) {
  const half = SNOW_CELL_DEG / 2
  const [x0, y0] = tileUnits(lng - half, lat + half, z)
  const [x1, y1] = tileUnits(lng + half, lat - half, z)
  return { x0, y0, x1, y1 }
}

/** The tiles a cell touches at the glacier zoom: one, or up to four at a corner. */
export function cellTiles(lng: number, lat: number): TileRef[] {
  const { x0, y0, x1, y1 } = cellBox(lng, lat)
  const out: TileRef[] = []
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
    for (let y = Math.floor(y0); y <= Math.floor(y1); y++) out.push({ z: GLACIER_TILE_ZOOM, x, y })
  }
  return out
}

function inside([px, py]: readonly [number, number], rings: Rings): boolean {
  let hit = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[i]
      const [bx, by] = ring[j]
      if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) hit = !hit
    }
  }
  return hit
}

type P = readonly [number, number]
function crosses(p: P, q: P, r: P, s: P): boolean {
  const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0])
  if (d === 0) return false
  const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d
  const u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

/**
 * Whether a box and a polygon share any ground: a corner of the box inside
 * the polygon, a vertex of the polygon inside the box, or an edge of one
 * crossing an edge of the other. A hole counts as outside.
 */
function boxTouches({ x0, y0, x1, y1 }: ReturnType<typeof cellBox>, rings: Rings): boolean {
  const corners: P[] = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]
  if (corners.some((c) => inside(c, rings))) return true
  for (const ring of rings) {
    for (let k = 0; k < ring.length; k++) {
      const p = ring[k]
      if (p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1) return true
      const q = ring[(k + 1) % ring.length]
      for (let e = 0; e < 4; e++) if (crosses(p, q, corners[e], corners[(e + 1) % 4])) return true
    }
  }
  return false
}

/** Whether a cell touches any of the glaciers in the tiles held for it. */
export function cellOnGlacier(lng: number, lat: number, glaciers: readonly Rings[]): boolean {
  const box = cellBox(lng, lat)
  return glaciers.some((rings) => boxTouches(box, rings))
}

/** Asks whether a point's cell is on a glacier: `now` from tiles in hand, `ask` fetching what is not. */
export interface GlacierCheck {
  /** The answer from tiles already read, or undefined where one is not. */
  now(lng: number, lat: number): boolean | undefined
  /** The answer, fetching the tiles it needs; false where a tile cannot be read. */
  ask(lng: number, lat: number, signal: AbortSignal): Promise<boolean>
}

/**
 * A check that keeps the glaciers of the last `maxTiles` tiles it read, so a
 * second click in the same few kilometres answers before the card opens. A
 * tile that cannot be read answers no glacier, which leaves the card as it
 * was before glaciers were asked about, and is not kept, so the next click
 * asks again.
 */
export function glacierCheck(fetchTile?: (signal: AbortSignal) => Promise<FetchTile>, maxTiles = 16): GlacierCheck {
  const fetcher = fetchTile ?? (async (signal: AbortSignal) => fetchTileWith(await tileTemplate(), signal))
  const held = new Map<string, Rings[]>()
  const keep = (key: string, glaciers: Rings[]) => {
    held.delete(key)
    held.set(key, glaciers)
    while (held.size > maxTiles) held.delete(held.keys().next().value!)
  }
  return {
    now(lng, lat) {
      const tiles = cellTiles(lng, lat).map((t) => held.get(tileKey(t)))
      if (tiles.some((t) => t === undefined)) return undefined
      return cellOnGlacier(lng, lat, tiles.flat() as Rings[])
    },
    async ask(lng, lat, signal) {
      const read = await fetcher(signal)
      const glaciers: Rings[] = []
      for (const t of cellTiles(lng, lat)) {
        const key = tileKey(t)
        let got = held.get(key)
        if (got === undefined) {
          const bytes = await read(t).catch(() => null)
          if (bytes === null) return false
          got = decodeGlaciers(bytes, t)
          keep(key, got)
        }
        glaciers.push(...got)
      }
      return cellOnGlacier(lng, lat, glaciers)
    },
  }
}

/** The check the snow card asks. */
export const GLACIERS = glacierCheck()
