/**
 * The cloud sea's layer (record 0309): a raster of the app's own scheme,
 * `bluebird-cloud://z/x/y`, whose every tile is painted in the browser from
 * the report's cloud deck at one hour (`utils/cloudSea.ts`) against the
 * elevation tile the relief and the slope already read (`map/terrain.ts`).
 *
 * The field it paints is held here rather than in the URL: a new hour or a
 * new report bumps a version on the tile template, which MapLibre reads as a
 * new set of tiles and asks for again. A tile no destination is in reach of
 * is painted empty without asking for its elevation, so the layer fetches
 * only the ground under the field. It stops at zoom 12, the elevation's own
 * coarsest-everywhere zoom, and MapLibre stretches it past that: the deck is
 * interpolated between destinations kilometres apart, so finer ground would
 * sharpen an edge the data does not have.
 */
import { addProtocol } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import { type DeckPoint, cloudRaster, sampleHeights, tileInReach } from '../utils/cloudSea'
import { DEM_MAXZOOM } from '../utils/terrainSources'
import { addLayerAt } from './layerOrder'
import type { DemGrids } from './slope'

export const CLOUD_SCHEME = 'bluebird-cloud'
export const CLOUD_SOURCE = 'cloud-sea'
export const CLOUD_LAYER = 'cloud-sea'

/** The painted tile's side. Half the elevation's 512, which the deck's kilometres-wide edges never miss. */
const TILE_PX = 256

/** Zoomed out past this a tile covers a whole range and the deck is a smear across it. */
const CLOUD_MINZOOM = 6

/** Drawn whole: the cloud's opacity is in the tile, set by where the ground stands. */
const CLOUD_PAINT: maplibregl.RasterLayerSpecification['paint'] = { 'raster-opacity': 1, 'raster-fade-duration': 0 }

let field: readonly DeckPoint[] = []
let served = false

const address = (url: string) => (/(\d+)\/(\d+)\/(\d+)/.exec(url) ?? []).slice(1).map(Number)

/** The empty tile, for every address the field is out of reach of. */
const emptyTile = () => createImageBitmap(new ImageData(1, 1))

/** Registers the scheme once, against the elevation tiles' cache. */
export function serveCloudTiles(dem: DemGrids, register: typeof addProtocol = addProtocol): void {
  if (served) return
  served = true
  register(CLOUD_SCHEME, async (request, abort) => {
    const [z, x, y] = address(request.url)
    const points = field
    if (points.length === 0 || !tileInReach(points, z, x, y)) return { data: await emptyTile() }
    const grid = await dem.getDemTile(z, x, y, abort)
    const rgba = cloudRaster(points, z, x, y, sampleHeights(grid, TILE_PX))
    return { data: await createImageBitmap(new ImageData(rgba, TILE_PX, TILE_PX)) }
  })
}

export interface CloudSeaLayer {
  /** The deck at the hour drawn, or null to take the layer away. */
  update(points: readonly DeckPoint[] | null): void
}

/**
 * Mounts the layer on `map`. `demTiles` is the terrain's one load of the
 * elevation (`TerrainLayers.demTiles`), which the first update waits on.
 */
export function mountCloudSea(map: maplibregl.Map, demTiles: () => Promise<DemGrids>): CloudSeaLayer {
  let version = 0
  let shown = false

  const template = () => `${CLOUD_SCHEME}://{z}/{x}/{y}?v=${version}`
  function retile() {
    version += 1
    const source = map.getSource(CLOUD_SOURCE) as maplibregl.RasterTileSource | undefined
    source?.setTiles([template()])
  }
  function show() {
    if (map.getSource(CLOUD_SOURCE)) {
      retile()
      return
    }
    map.addSource(CLOUD_SOURCE, {
      type: 'raster',
      tiles: [template()],
      tileSize: 512,
      minzoom: CLOUD_MINZOOM,
      maxzoom: DEM_MAXZOOM,
    })
    addLayerAt(map, { id: CLOUD_LAYER, type: 'raster', source: CLOUD_SOURCE, paint: CLOUD_PAINT })
  }
  function hide() {
    if (map.getLayer(CLOUD_LAYER)) map.removeLayer(CLOUD_LAYER)
    if (map.getSource(CLOUD_SOURCE)) map.removeSource(CLOUD_SOURCE)
  }

  return {
    update(points) {
      field = points ?? []
      shown = points !== null && points.length > 0
      if (!shown) {
        hide()
        return
      }
      void demTiles()
        .then((dem) => {
          serveCloudTiles(dem)
          // Turned off while the elevation loaded.
          if (shown) show()
        })
        .catch(() => undefined)
    },
  }
}
