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
 * The painting runs on the main thread. The decode, the expensive half, is
 * already in the library's worker; moving the band loop into a worker of its
 * own would hand each tile's five grids to a second thread and back, for a
 * loop measured at about 3 ms a 512px tile (2026-10-28, `docs/decisions/0239`).
 */
import { addProtocol } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import { SLOPE_ALPHA, slopeRaster, type HeightGrid } from '../utils/slopeAngle'

/** The scheme the slope tiles are painted through. */
export const SLOPE_SCHEME = 'bluebird-slope'

/** The raster source's tile template. */
export const SLOPE_TILES = `${SLOPE_SCHEME}://{z}/{x}/{y}`

/**
 * The bands at half strength, so Liberty's ground, the relief and the imagery
 * all read through them. The colours are in the tile; `utils/slopeAngle.ts`
 * owns them and the strength both.
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
 * One slope tile: the elevation at its address and its four edge neighbours,
 * painted by band. A neighbour that does not exist (past the top or bottom of
 * the world) or does not load (open ocean has no tile) leaves its edge to a
 * one-sided slope; the tile itself failing fails the request, as it does the
 * relief's. East and west wrap round the antimeridian.
 */
export async function slopeTile(
  dem: DemGrids,
  z: number,
  x: number,
  y: number,
  abort: AbortController,
  toImage: ToImage = toBitmap,
): Promise<ImageBitmap> {
  const count = 2 ** z
  const edge = (tx: number, ty: number) =>
    ty < 0 || ty >= count
      ? Promise.resolve(null)
      : dem.getDemTile(z, (tx + count) % count, ty, abort).catch(() => null)
  const [centre, north, south, west, east] = await Promise.all([
    dem.getDemTile(z, x, y, abort),
    edge(x, y - 1),
    edge(x, y + 1),
    edge(x - 1, y),
    edge(x + 1, y),
  ])
  return toImage(slopeRaster(z, y, centre, { north, south, west, east }), centre.width, centre.height)
}

/**
 * Registers the scheme with MapLibre. Called once, when the contour library
 * has loaded, so the cold load registers nothing.
 */
export function serveSlopeTiles(
  dem: DemGrids,
  deps: { register?: typeof addProtocol; toImage?: ToImage } = {},
): void {
  const register = deps.register ?? addProtocol
  register(SLOPE_SCHEME, async (request, abort) => {
    const [, z, x, y] = /(\d+)\/(\d+)\/(\d+)/.exec(request.url) ?? []
    return { data: await slopeTile(dem, Number(z), Number(x), Number(y), abort, deps.toImage) }
  })
}
