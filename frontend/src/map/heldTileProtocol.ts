/**
 * The radar's and the snow's tiles, loaded through a protocol of the app's
 * own so a copy of each stays readable (#737).
 *
 * MapLibre fetches a raster tile and uploads it to the GPU, where no script
 * can read a pixel of it, and the click cards and the cursor need to know
 * what was painted under the pointer. `maplibregl.addProtocol` lets a scheme
 * load its own tiles: these two fetch exactly the image MapLibre would have
 * asked for, hand MapLibre the bytes with the server's cache headers so its
 * refresh rules are unchanged, and keep a copy in `utils/heldTiles.ts`. No
 * tile is fetched twice, and no request is made that the layer did not
 * already make.
 *
 * The two stores are the module's own rather than a map's, because the
 * protocol is registered on MapLibre globally and the tutorial runs a second
 * map: both maps draw the same tiles from the same URLs, so one copy serves
 * either.
 */
import { heldTiles, type HeldTiles } from '../utils/heldTiles'
import { layerFetch } from '../utils/pointReadout'
import { RADAR_SCHEME, radarTileHref } from '../utils/radar'
import { RADAR_TILE_PX, radarHeldLayer } from '../utils/radarPoint'
import { SNOW_SCHEME, SNOW_TILE_SIZE, snowExportHref } from '../utils/snowDepth'
import { SNOW_HELD_LAYER } from '../utils/snowPoint'

/** Every radar frame's tiles, under `radarHeldLayer(offset)`. */
export const RADAR_TILES = heldTiles({ size: RADAR_TILE_PX })
/** The snow field's tiles, under `SNOW_HELD_LAYER`. */
export const SNOW_TILES = heldTiles({ size: SNOW_TILE_SIZE })

/** Which tile a scheme's path names, and the real URL that draws it. */
export interface HeldTileRequest {
  layer: string
  z: number
  x: number
  y: number
  url: string
}

/** What a loader answers MapLibre with: the image's bytes and the server's cache headers. */
export interface HeldTileResponse {
  data: ArrayBuffer
  cacheControl?: string | null
  expires?: string | null
}

export type HeldTileLoader = (request: { url: string }, abort: AbortController) => Promise<HeldTileResponse>

/** `maplibregl.addProtocol`, handed in so the stack can be mounted on a stub. */
export type ProtocolAdder = (scheme: string, load: HeldTileLoader) => void

function numbers(path: string, count: number): number[] | null {
  const parts = path.split('/').map(Number)
  return parts.length === count && parts.every(Number.isInteger) ? parts : null
}

/** `bluebird-radar://{offset}/{z}/{x}/{y}`. */
export function radarRequest(path: string): HeldTileRequest | null {
  const n = numbers(path, 4)
  if (!n) return null
  const [offset, z, x, y] = n
  return { layer: radarHeldLayer(offset), z, x, y, url: radarTileHref(offset, z, x, y) }
}

/** `bluebird-snow://{z}/{x}/{y}`. */
export function snowRequest(path: string): HeldTileRequest | null {
  const n = numbers(path, 3)
  if (!n) return null
  const [z, x, y] = n
  return { layer: SNOW_HELD_LAYER, z, x, y, url: snowExportHref(z, x, y) }
}

/**
 * A loader that fetches the tile a path names, keeps a copy, and hands
 * MapLibre the bytes. A failed fetch rejects, which MapLibre treats as the
 * failed tile it always was.
 */
export function holdingLoader(
  scheme: string,
  tiles: HeldTiles,
  resolve: (path: string) => HeldTileRequest | null,
  fetchWith: typeof layerFetch = layerFetch,
): HeldTileLoader {
  return async ({ url }, abort) => {
    const request = resolve(url.slice(scheme.length + 3))
    if (!request) throw new Error(`Not a ${scheme} tile: ${url}`)
    const response = await fetchWith(request.url, abort.signal)
    const data = await response.arrayBuffer()
    tiles.put(request.layer, request.z, request.x, request.y, new Blob([data], { type: 'image/png' }))
    return {
      data,
      cacheControl: response.headers.get('cache-control'),
      expires: response.headers.get('expires'),
    }
  }
}

/** Register both schemes. Registering again replaces the loaders with identical ones. */
export function serveHeldTiles(add: ProtocolAdder): void {
  add(RADAR_SCHEME, holdingLoader(RADAR_SCHEME, RADAR_TILES, radarRequest))
  add(SNOW_SCHEME, holdingLoader(SNOW_SCHEME, SNOW_TILES, snowRequest))
}
