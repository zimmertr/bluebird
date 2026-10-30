/**
 * The slope angle shading's tiles (#799): a URL scheme of the app's own whose
 * every tile is painted in the browser from the elevation the relief and the
 * contours already read.
 *
 * MapLibre asks `bluebird-slope://z/x/y` for a tile like any raster's. The
 * loader asks the contour library's cache (`map/terrain.ts`) for the
 * elevation tile at the same address and the four that touch its edges,
 * already decoded in the library's worker, works out each pixel's slope and
 * band (`utils/slopeAngle.ts`) and hands MapLibre the picture as an
 * ImageBitmap, which it draws as it would a decoded PNG. A tile the relief or
 * the contours also need is fetched and decoded once.
 *
 * The neighbours are what keep a band from breaking along every tile edge: a
 * pixel there takes its outer neighbour's height from the next tile rather
 * than from a one-sided difference. They cost no fetch the view does not make
 * anyway, since a neighbour of one tile in view is another tile in view or
 * its margin, and they come out of the same cache.
 *
 * Past zoom 12 the tile asks for the finest elevation Mapterhorn has under
 * it (`SLOPE_MAXZOOM`): the elevation at its own zoom first, then each zoom
 * out to 12, which holds over all land. A zoom that answers 404 is remembered
 * for the session, so a pan does not ask again, and the tile is painted from
 * the square of the coarser tile it lies over (`demWindow`), at that tile's
 * ground spacing, each coarser pixel drawn as a block. The relief and the 3D
 * terrain cannot do this: MapLibre reads a `raster-dem` tile that fails as a
 * hole, so their sources stop at 12 (`DEM_MAXZOOM`).
 *
 * The painting runs on the main thread. The fetch and the decode are already
 * in the library's worker; a worker of the app's own for the band loop would
 * take each tile's five grids across a second thread and the picture back,
 * for a loop that costs about 4 ms a 512px tile, with 1 ms more to make the
 * bitmap (medians of 50 in headless Chromium, 2026-10-28).
 */
import { addProtocol } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import {
  SLOPE_ALPHA,
  coveringTile,
  demWindow,
  slopeRaster,
  windowEdges,
  type EdgeTiles,
  type HeightGrid,
} from '../utils/slopeAngle'
import { DEM_MAXZOOM } from '../utils/terrainSources'

/** The scheme the slope tiles are painted through. */
export const SLOPE_SCHEME = 'bluebird-slope'

/** The raster source's tile template. */
export const SLOPE_TILES = `${SLOPE_SCHEME}://{z}/{x}/{y}`

/**
 * The deepest zoom the slope tiles are painted at; MapLibre stretches past
 * it. Mapterhorn's finest is 13 over the US (Rainier answers at 13 and 404s at
 * 14) and 17 in the Alps (the Matterhorn answers at every zoom to 17), so 14
 * paints the US from its own survey and the Alps from 3 m tiles, a couloir and
 * a rock band apiece. 15 was tried (2026-10-29, 1389 by 868): the Alps'
 * 1.7 m tiles drew the rock's own texture rather than a slope a skier plans
 * by, a screen at 15 over the Matterhorn asked for 21 tiles and 3.5 MB where
 * 14 stretched asks 12 and 1.9 MB, and a screen at 15 over Rainier asked 8
 * more tiles that answer 404. Record 0240 has the numbers.
 */
export const SLOPE_MAXZOOM = 14

/**
 * The bands at half strength, the default level, so Liberty's ground, the
 * relief and the imagery all read through them. The colours are in the tile,
 * whole, so the Slope angle row's opacity slider is the layer's
 * `raster-opacity` and nothing else (`terrain.ts`, record 0242).
 * `utils/slopeAngle.ts` owns the colours and the default strength both.
 */
export const SLOPE_PAINT: maplibregl.RasterLayerSpecification['paint'] = {
  'raster-opacity': SLOPE_ALPHA,
}

/** The part of the contour library's `DemSource` the slope reads: one decoded elevation tile. */
export interface DemGrids {
  getDemTile(z: number, x: number, y: number, abortController?: AbortController): Promise<HeightGrid>
}

/** Turns a tile's RGBA into what MapLibre draws; `createImageBitmap` in the browser. */
type ToImage = (rgba: Uint8ClampedArray<ArrayBuffer>, width: number, height: number) => Promise<ImageBitmap>

const toBitmap: ToImage = (rgba, width, height) => createImageBitmap(new ImageData(rgba, width, height))

/**
 * The addresses of elevation tiles that answered 404, as `z/x/y`, for the
 * session: a pan or a zoom back asks none of them again. Only zooms past
 * {@link DEM_MAXZOOM} are kept, since at 12 a 404 is open ocean, which the
 * request fails on anyway. Mapterhorn marks a 404 outside every survey's area
 * cacheable for a week, but one inside an area a survey does not reach at that
 * zoom (Rainier at 14) carries no cache header, so the browser would ask again.
 */
type MissingTiles = Set<string>

const keyOf = (z: number, x: number, y: number) => `${z}/${x}/${y}`

/**
 * Whether a tile, or any tile it lies inside down to zoom 13, is known to be
 * missing. A survey's tiles nest, so a zoom-13 tile that is missing has no
 * zoom-14 tiles under it either, and a slope tile need not ask.
 */
function knownMissing(missing: MissingTiles, z: number, x: number, y: number): boolean {
  for (let level = z; level > DEM_MAXZOOM; level--) {
    const at = coveringTile(z, x, y, level)
    if (missing.has(keyOf(level, at.x, at.y))) return true
  }
  return false
}

/** The contour library's error for a tile the host answered 404, its worker's message as it crosses back. */
const isNotFound = (err: unknown) => err instanceof Error && /Bad response: 404\b/.test(err.message)

/**
 * One elevation tile past zoom 12, or null when it is known missing, answers
 * 404 (remembered), or fails otherwise (not remembered: a timeout or a 5xx is
 * worth asking again on the next pan). A request aborted while it loaded
 * rethrows, so the tile stops rather than falling back.
 */
async function finer(
  dem: DemGrids,
  z: number,
  x: number,
  y: number,
  abort: AbortController,
  missing: MissingTiles,
): Promise<HeightGrid | null> {
  if (knownMissing(missing, z, x, y)) return null
  try {
    return await dem.getDemTile(z, x, y, abort)
  } catch (err) {
    // A 404 that came back is knowledge even when the tile was abandoned
    // while it loaded. An abandoned ask whose answer never came back is not:
    // the next pan over the same ground asks for it again, as it must.
    if (isNotFound(err)) missing.add(keyOf(z, x, y))
    if (abort.signal.aborted) throw err
    return null
  }
}

/**
 * One slope tile: the finest elevation under it and the four tiles that touch
 * that elevation's edges, painted by band.
 *
 * At zoom 12 and out, the elevation is the tile at the slope tile's own
 * address. Past 12 it is the first of the tile's own zoom and each zoom out
 * that answers, down to 12; the tile is then painted from the square of that
 * elevation tile it lies over, at that tile's ground spacing (`demWindow`).
 * The edge neighbours come from the same zoom as the elevation, so a band
 * meets itself across the boundary, and only the edges the square touches are
 * asked for.
 *
 * A neighbour that does not exist (past the top or bottom of the world) or
 * does not load (open ocean has no tile, and a survey ends somewhere) leaves
 * its edge to a one-sided slope; the zoom-12 tile failing fails the request,
 * as it does the relief's. East and west wrap round the antimeridian.
 */
export async function slopeTile(
  dem: DemGrids,
  z: number,
  x: number,
  y: number,
  abort: AbortController,
  deps: { toImage?: ToImage; missing?: MissingTiles } = {},
): Promise<ImageBitmap> {
  const { toImage = toBitmap, missing = new Set() } = deps
  // Past 12, the first zoom from the tile's own outward whose elevation loads.
  let level = z
  let centre: HeightGrid | null = null
  while (level > DEM_MAXZOOM) {
    const above = coveringTile(z, x, y, level)
    centre = await finer(dem, level, above.x, above.y, abort, missing)
    if (centre) break
    level--
  }

  const at = coveringTile(z, x, y, level)
  const count = 2 ** level
  const touches = windowEdges(z, x, y, level)
  const edge = async (side: keyof EdgeTiles, tx: number, ty: number) => {
    if (!touches[side] || ty < 0 || ty >= count) return null
    const wrapped = (tx + count) % count
    if (level > DEM_MAXZOOM) return finer(dem, level, wrapped, ty, abort, missing)
    return dem.getDemTile(level, wrapped, ty, abort).catch(() => null)
  }
  // At 12 and out the tile and its neighbours load together, as before any
  // tile could fall back.
  const [grid, north, south, west, east] = await Promise.all([
    centre ?? dem.getDemTile(level, at.x, at.y, abort),
    edge('north', at.x, at.y - 1),
    edge('south', at.x, at.y + 1),
    edge('west', at.x - 1, at.y),
    edge('east', at.x + 1, at.y),
  ])
  const window = demWindow(z, x, y, level, grid.width)
  return toImage(slopeRaster(level, at.y, grid, { north, south, west, east }, window), grid.width, grid.height)
}

/**
 * Registers the scheme with MapLibre. Called once, when the contour library
 * has loaded, so the cold load registers nothing. The tiles known missing are
 * this registration's, which is the page's.
 */
export function serveSlopeTiles(
  dem: DemGrids,
  deps: { register?: typeof addProtocol; toImage?: ToImage } = {},
): void {
  const register = deps.register ?? addProtocol
  const missing: MissingTiles = new Set()
  register(SLOPE_SCHEME, async (request, abort) => {
    const [, z, x, y] = /(\d+)\/(\d+)\/(\d+)/.exec(request.url) ?? []
    return {
      data: await slopeTile(dem, Number(z), Number(x), Number(y), abort, { toImage: deps.toImage, missing }),
    }
  })
}
