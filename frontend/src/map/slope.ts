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
 * ground spacing, each coarser pixel drawn as a block. MapLibre reads a
 * `raster-dem` tile that fails as a hole, so the relief and the 3D terrain
 * read their elevation through a second scheme here, `DEM_FILL_SCHEME`, which
 * answers every address the same way, with heights rather than a picture.
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
  groundAt,
  slopeRaster,
  tilePixel,
  type GroundReading,
  windowEdges,
  type EdgeTiles,
  type HeightGrid,
} from '../utils/slopeAngle'
import { stretchWindow, terrariumRgba } from '../utils/demFill'
import { DEM_MAXZOOM } from '../utils/terrainSources'

/** The scheme the slope tiles are painted through. */
export const SLOPE_SCHEME = 'bluebird-slope'

/** The raster source's tile template. */
export const SLOPE_TILES = `${SLOPE_SCHEME}://{z}/{x}/{y}`

/**
 * The scheme the relief's and the 3D terrain's elevation is served through
 * past zoom 12 (`utils/demFill.ts`): the finest tile under each address, or a
 * coarser one's window stretched to fill it, so their `raster-dem` sources
 * never meet a missing tile and can reach {@link SLOPE_MAXZOOM}.
 */
export const DEM_FILL_SCHEME = 'bluebird-dem-fill'
export const DEM_FILL_TILES = `${DEM_FILL_SCHEME}://{z}/{x}/{y}`

/**
 * The deepest zoom the slope tiles are painted at; MapLibre stretches past
 * it. Mapterhorn's finest varies with the survey under it: 13 over Rainier
 * (14 answers 404), 16 over Squak Mountain by Issaquah (17 answers 404) and
 * 17 over the Matterhorn. 16 is the finest the US has where it has lidar, and
 * there it draws the grain CalTopo's shading shows: each zoom carries detail a
 * smoothed copy of the zoom above lacks, halving from 1.0 m at 13 to 0.12 m at
 * 16 on Tiger Mountain's face (measured 2026-10-29). The maintainer chose 16
 * that day beside a CalTopo screenshot, over 14, which drew the same slopes
 * smooth past zoom 14. It costs only past the zoom a survey stops at: a
 * missing tile is one 404 per area for the session (`missing`). Record 0248
 * has the numbers.
 */
export const SLOPE_MAXZOOM = 16

/**
 * The bands at half strength, the default level, so Liberty's ground, the
 * relief and the imagery all read through them. The colours are in the tile,
 * whole, so the Slope angle row's opacity slider is the layer's
 * `raster-opacity` and nothing else (`terrain.ts`, record 0250).
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

/**
 * The page's tiles known missing, shared by every reader of the elevation:
 * the slope tiles, the filled elevation and the right-click card's point
 * (#832), so none asks a tile another has already learned is not there.
 */
const SESSION_MISSING: MissingTiles = new Set()

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
 * The finest elevation tile over tile `x`, `y` at zoom `z`: its own zoom
 * first, then each zoom out that answers, down to 12, where `centre` is null
 * and the caller reads the zoom-12 tile itself, which every part of the land
 * has.
 */
async function finestUnder(
  dem: DemGrids,
  z: number,
  x: number,
  y: number,
  abort: AbortController,
  missing: MissingTiles,
): Promise<{ level: number; centre: HeightGrid | null }> {
  let level = z
  while (level > DEM_MAXZOOM) {
    const above = coveringTile(z, x, y, level)
    const centre = await finer(dem, level, above.x, above.y, abort, missing)
    if (centre) return { level, centre }
    level--
  }
  return { level, centre: null }
}

/**
 * One elevation tile for the relief and the 3D terrain (`DEM_FILL_SCHEME`):
 * the finest tile under the address, or the window of the coarser one it lies
 * in stretched to the tile's size, as Terrarium. Never missing where the land
 * has a zoom-12 tile, so a `raster-dem` source over it draws no hole.
 */
export async function demFillTile(
  dem: DemGrids,
  z: number,
  x: number,
  y: number,
  abort: AbortController,
  deps: { toImage?: ToImage; missing?: MissingTiles } = {},
): Promise<ImageBitmap> {
  const { toImage = toBitmap, missing = new Set() } = deps
  const found = await finestUnder(dem, z, x, y, abort, missing)
  const at = coveringTile(z, x, y, found.level)
  const grid = found.centre ?? (await dem.getDemTile(found.level, at.x, at.y, abort))
  const window = demWindow(z, x, y, found.level, grid.width)
  return toImage(terrariumRgba(stretchWindow(grid, window)), grid.width, grid.height)
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
  const { level, centre } = await finestUnder(dem, z, x, y, abort, missing)

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
 * The ground at one point (#832): its height, slope and aspect from the
 * finest elevation Mapterhorn holds under it, starting at
 * {@link SLOPE_MAXZOOM} and falling back zoom by zoom to 12 as a slope tile
 * does. The finest rather than the view's zoom, so the card names one slope
 * for a spot however far out the reader is (the maintainer, 2026-10-30): a
 * slope read off a coarser tile comes out gentler, which is the difference
 * between 27 and 35 degrees on avalanche ground. Zoomed out, the shading under
 * the pointer is painted from the coarser tile and may show a gentler band.
 * Null where the ground has no height, over open ocean.
 */
export async function groundReading(
  dem: DemGrids,
  lat: number,
  lon: number,
  abort: AbortController,
  missing: MissingTiles = SESSION_MISSING,
): Promise<GroundReading | null> {
  const top = tilePixel(lat, lon, SLOPE_MAXZOOM, 1)
  const { level, centre } = await finestUnder(dem, SLOPE_MAXZOOM, top.x, top.y, abort, missing)
  const at = coveringTile(SLOPE_MAXZOOM, top.x, top.y, level)
  const grid = centre ?? (await dem.getDemTile(level, at.x, at.y, abort))
  const { col, row } = tilePixel(lat, lon, level, grid.width)
  return groundAt(grid, col, row, level, at.y)
}

/**
 * Registers the two schemes with MapLibre, the slope's and the filled
 * elevation's. Called once, when the contour library has loaded, so the cold
 * load registers nothing. The tiles known missing are the page's
 * (`SESSION_MISSING`), shared by both and by the card's point, since all
 * three read the same elevation.
 */
export function serveSlopeTiles(
  dem: DemGrids,
  deps: { register?: typeof addProtocol; toImage?: ToImage; missing?: MissingTiles } = {},
): void {
  const register = deps.register ?? addProtocol
  const missing = deps.missing ?? SESSION_MISSING
  const address = (url: string) => (/(\d+)\/(\d+)\/(\d+)/.exec(url) ?? []).slice(1).map(Number)
  register(SLOPE_SCHEME, async (request, abort) => {
    const [z, x, y] = address(request.url)
    return { data: await slopeTile(dem, z, x, y, abort, { toImage: deps.toImage, missing }) }
  })
  register(DEM_FILL_SCHEME, async (request, abort) => {
    const [z, x, y] = address(request.url)
    return { data: await demFillTile(dem, z, x, y, abort, { toImage: deps.toImage, missing }) }
  })
}
