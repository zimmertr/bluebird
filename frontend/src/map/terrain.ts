/**
 * The map's ground (#799): shaded relief and contour lines drawn from one
 * elevation model, Mapterhorn's (`utils/terrainSources.ts`), and the 3D
 * terrain stood up on the same tiles.
 *
 * Nothing here is added when the map loads. The cold load fetches no
 * elevation tile and no contour code: the first time any of the three
 * switches on, the contour library loads as a chunk of its own
 * (`maplibre-contour`, a dynamic import), and its tile cache serves every
 * elevation request after that. The relief, the contours and the 3D terrain
 * all read the tiles through it (`sharedDemProtocolUrl`), so a tile two of
 * them need is fetched once. A switch turned off hides its layers rather than
 * removing them, and MapLibre asks for no tile of a source no visible layer
 * or terrain uses, so with all three off nothing is requested.
 *
 * Every colour and number here is this module's (`value-hex` and
 * `map-paint-named` list it as an owner). The map stays light in both
 * themes, so each colour is one value for both.
 */
import { addProtocol } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import { FEET_PER_METER } from '../utils/basemapPoi'
import { DEM_TILES } from '../utils/terrainSources'
import { CAMERA_MS } from './mapStyles'

/** The relief's elevation source. */
export const DEM_SOURCE = 'dem'

/**
 * The 3D terrain's elevation source: the same tiles under a second id,
 * because MapLibre takes over the tile size of the source it stands the map
 * on (twice the source's, so one zoom coarser; `TerrainTileManager` in
 * maplibre-gl 6.14) and a relief drawn from that source would blur while 3D
 * is on. MapLibre warns about the shared source for this reason. Through the
 * shared cache the second source costs no second fetch of a tile both ask for.
 */
export const TERRAIN_SOURCE = 'dem-terrain'

/** The contour lines' vector source, generated in the browser from the elevation. */
export const CONTOUR_SOURCE = 'contour-lines'

export const RELIEF_LAYER = 'relief'
export const CONTOUR_LAYER = 'contours'
export const CONTOUR_INDEX_LAYER = 'contours-index'
export const CONTOUR_LABEL_LAYER = 'contours-label'
const CONTOUR_LAYERS = [CONTOUR_LAYER, CONTOUR_INDEX_LAYER, CONTOUR_LABEL_LAYER] as const

/**
 * The deepest zoom the elevation sources ask for. Mapterhorn serves zooms 0 to
 * 12 everywhere it has land, from the 30 m Copernicus fill, and 13 to 17 only
 * where a national survey reaches; past that a tile answers 404 (measured
 * 2026-10-27: zoom 13 answers over Rainier and 404s over the Sahara,
 * Kazakhstan, the Amazon and the Himalaya; zoom 14 404s over Rainier).
 * `tilejson.json` publishes no maxzoom to read this from. At 12 a 404 can
 * only mean open ocean, which has no tile at any zoom; above it a missing
 * survey would leave holes, and nothing showed a 404 falls back cleanly.
 * MapLibre and the contour library both draw past 12 by stretching the
 * zoom-12 tiles, which at 512px is 19 m a pixel at the equator, finer than
 * the 30 m fill already.
 */
export const DEM_MAXZOOM = 12

/**
 * Mapterhorn's credit, as its `tilejson.json` gives it, opening in a new tab
 * as the map's other credits do. On every source drawn from its tiles, so the
 * map's corner names it while any of them is drawn.
 */
export const MAPTERHORN_ATTRIBUTION =
  '<a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener noreferrer">© Mapterhorn</a>'

/** The prefix of the contour library's two URL schemes, so they are this app's. */
const DEM_PROTOCOL_ID = 'bluebird-dem'

/**
 * The interval between contour lines at each zoom, in feet, as `[minor,
 * index]`: every fifth line is an index line, drawn heavier and labelled. A
 * zoom with no entry takes the one below it, and below 10 there are none.
 * Tuned by eye over Rainier and the Alpine Lakes at zooms 10 to 15
 * (2026-10-27): 1,000 ft at 10 reads the big volcanoes without filling the
 * valleys, 500 at 11 and 200 at 12 still leave a gap between lines on
 * Rainier's steepest walls, and 40 at 14 is the USGS quad's interval.
 */
export const CONTOUR_THRESHOLDS_FT: Readonly<Record<number, [minor: number, index: number]>> = {
  10: [1000, 5000],
  11: [500, 2500],
  12: [200, 1000],
  13: [100, 500],
  14: [40, 200],
}

/**
 * The deepest zoom the contour tiles are generated at. Past it MapLibre
 * stretches the zoom-15 tiles, whose lines are already drawn from the
 * zoom-12 elevation stretched three times.
 */
const CONTOUR_MAXZOOM = 15

/** The tilt the 3D button turns a flat map to, so a press visibly does something. */
export const TERRAIN_PITCH = 45

/**
 * How much the 3D terrain stretches heights. 1, true scale: 1.2 read no
 * different over Rainier or the Alpine Lakes at zoom 11 and 45 degrees
 * (2026-10-27), and a stretch is a claim about the ground the map would be
 * making up.
 */
export const TERRAIN_EXAGGERATION = 1

/**
 * The shaded relief, present but quiet: Liberty's woods, ice and water still
 * read through it. Tried 2026-10-27 over Rainier and the Alpine Lakes at
 * zooms 8 to 15: MapLibre's defaults (black and white at 0.5) turn the map
 * grey; `igor` and `multidirectional` read as heavy as `standard` at the
 * strength that showed the valleys; `standard` at 0.3 with a brown shadow and
 * a half-strength white light is the one that shades like a printed map.
 */
export const RELIEF_PAINT: maplibregl.HillshadeLayerSpecification['paint'] = {
  'hillshade-method': 'standard',
  'hillshade-exaggeration': 0.3,
  // Liberty's own warm label brown, darkened, so a shadow reads as ground
  // rather than as a grey film over the greens.
  'hillshade-shadow-color': '#5c4a32',
  // White at under half strength: at full strength the lit slopes washed
  // Liberty's woods out to the colour of its grass.
  'hillshade-highlight-color': 'rgba(255, 255, 255, 0.45)',
  // The steepest slopes' accent, in the shadow's colour, so a cliff band
  // darkens without a second hue.
  'hillshade-accent-color': '#5c4a32',
}

/**
 * The contour ink: a mid brown, the colour a printed topographic map draws
 * its contours in, light enough that the trails' sienna and the roads stay
 * the lines that read first.
 */
const CONTOUR_INK = '#8a6a4a'

export const CONTOUR_PAINT: maplibregl.LineLayerSpecification['paint'] = {
  'line-color': CONTOUR_INK,
  'line-opacity': 0.35,
  'line-width': 0.6,
}

/** An index line: the same ink, heavier, so the count of five reads at a glance. */
export const CONTOUR_INDEX_PAINT: maplibregl.LineLayerSpecification['paint'] = {
  'line-color': CONTOUR_INK,
  'line-opacity': 0.6,
  'line-width': 1.1,
}

/**
 * An index line's height, in feet, set along the line in the contour ink a
 * step darker and on the halo the peak labels wear (`POI_LABEL_PAINT` in
 * `basemap.ts`), at 11px, the app's smallest type. Lighter than a peak's
 * name, because a number on a line is the map's furniture and a summit's name
 * is a destination.
 */
export const CONTOUR_LABEL_PAINT: maplibregl.SymbolLayerSpecification['paint'] = {
  'text-color': '#7a5a3a',
  'text-halo-color': '#f8f4ef',
  'text-halo-width': 1.2,
}

const CONTOUR_LABEL_LAYOUT: maplibregl.SymbolLayerSpecification['layout'] = {
  'symbol-placement': 'line',
  // A whole number of feet with no separator, as a quad prints it.
  'text-field': ['to-string', ['get', 'ele']],
  'text-font': ['Noto Sans Regular'],
  'text-size': 11,
}

/**
 * The part of maplibre-contour's `DemSource` this module uses, spelled here so
 * nothing but the lazy chunk names the library.
 */
export interface DemTiles {
  /** The scheme MapLibre reads an elevation tile through, from the library's cache. */
  sharedDemProtocolUrl: string
  /** The scheme a contour tile is generated through, with its options in the URL. */
  contourProtocolUrl(options: {
    multiplier: number
    thresholds: Readonly<Record<number, number[]>>
    overzoom: number
    elevationKey: string
    levelKey: string
    contourLayer: string
  }): string
}

/**
 * Loads the contour library and registers its two schemes with MapLibre:
 * the one dynamic import of `maplibre-contour`, so the library is a chunk of
 * its own that the cold load never asks for.
 */
export async function loadDemTiles(): Promise<DemTiles> {
  const { default: contour } = await import('maplibre-contour')
  const tiles = new contour.DemSource({
    url: DEM_TILES,
    // MapLibre's and the library's default is `mapbox`, which reads a
    // Terrarium tile as heights that are wrong without failing.
    encoding: 'terrarium',
    maxzoom: DEM_MAXZOOM,
    id: DEM_PROTOCOL_ID,
    // Decoding and tracing the lines in a worker of the library's own, off
    // the thread that draws the map.
    worker: true,
  })
  // The library types the scheme loader for MapLibre 3's callback form as
  // well as 4's promise one; 6 takes the promise form, which the library
  // detects by the AbortController it is handed.
  tiles.setupMaplibre({ addProtocol: addProtocol as never })
  return tiles
}

export interface TerrainLayers {
  update(next: { relief: boolean; contours: boolean; terrain: boolean }): void
}

export function mountTerrain(map: maplibregl.Map, deps: { load?: () => Promise<DemTiles> } = {}): TerrainLayers {
  const load = deps.load ?? loadDemTiles
  let want = { relief: false, contours: false, terrain: false }
  let tiles: DemTiles | null = null
  let loading = false
  let standing = false

  // Under the style's first label and every `ofm-` layer the app adds
  // (`enhanceBasemap` puts its trails and labels there), so the trails, the
  // peaks and the place names stay on top of the ground.
  const beneathLabels = () =>
    map.getStyle().layers?.find((l) => l.type === 'symbol' || l.id.startsWith('ofm-'))?.id

  function demSource(id: string) {
    if (map.getSource(id)) return
    map.addSource(id, {
      type: 'raster-dem',
      tiles: [tiles!.sharedDemProtocolUrl],
      encoding: 'terrarium',
      tileSize: 512,
      maxzoom: DEM_MAXZOOM,
      attribution: MAPTERHORN_ATTRIBUTION,
    })
  }

  function show(ids: readonly string[], visible: boolean) {
    for (const id of ids) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
    }
  }

  function relief() {
    if (map.getLayer(RELIEF_LAYER)) return show([RELIEF_LAYER], true)
    demSource(DEM_SOURCE)
    // Under the contours where they are drawn, so a line is never shaded over.
    const beneath = map.getLayer(CONTOUR_LAYER) ? CONTOUR_LAYER : beneathLabels()
    map.addLayer({ id: RELIEF_LAYER, type: 'hillshade', source: DEM_SOURCE, paint: RELIEF_PAINT }, beneath)
  }

  function contours() {
    if (map.getLayer(CONTOUR_LAYER)) return show(CONTOUR_LAYERS, true)
    if (!map.getSource(CONTOUR_SOURCE)) {
      map.addSource(CONTOUR_SOURCE, {
        type: 'vector',
        tiles: [
          tiles!.contourProtocolUrl({
            // Drawn and labelled in feet, as every height in the app is.
            multiplier: FEET_PER_METER,
            thresholds: CONTOUR_THRESHOLDS_FT,
            // A contour tile is traced from a quarter of the elevation tile one
            // zoom out, the library's advice for 512px elevation, which needs
            // fewer neighbouring tiles than tracing at the same zoom.
            overzoom: 1,
            elevationKey: 'ele',
            levelKey: 'level',
            contourLayer: 'contours',
          }),
        ],
        maxzoom: CONTOUR_MAXZOOM,
        attribution: MAPTERHORN_ATTRIBUTION,
      })
    }
    // Over the relief, which is already beneath this point when it is drawn.
    const beneath = beneathLabels()
    const lines = { source: CONTOUR_SOURCE, 'source-layer': 'contours' }
    map.addLayer(
      { id: CONTOUR_LAYER, type: 'line', ...lines, filter: ['==', ['get', 'level'], 0], paint: CONTOUR_PAINT },
      beneath,
    )
    map.addLayer(
      { id: CONTOUR_INDEX_LAYER, type: 'line', ...lines, filter: ['>', ['get', 'level'], 0], paint: CONTOUR_INDEX_PAINT },
      beneath,
    )
    map.addLayer(
      {
        id: CONTOUR_LABEL_LAYER,
        type: 'symbol',
        ...lines,
        filter: ['>', ['get', 'level'], 0],
        layout: CONTOUR_LABEL_LAYOUT,
        paint: CONTOUR_LABEL_PAINT,
      },
      beneath,
    )
  }

  function stand(on: boolean) {
    if (on === standing) return
    standing = on
    if (on) {
      demSource(TERRAIN_SOURCE)
      map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: TERRAIN_EXAGGERATION })
      // A flat map stood up in 3D looks the same from straight above, so the
      // press tilts it; a map the reader already tilted keeps its tilt.
      if (map.getPitch() === 0) map.easeTo({ pitch: TERRAIN_PITCH, duration: CAMERA_MS.reveal })
      return
    }
    map.setTerrain(null)
    // Back to flat, facing where it faced.
    map.easeTo({ pitch: 0, duration: CAMERA_MS.reveal })
  }

  function apply() {
    if (want.relief) relief()
    else show([RELIEF_LAYER], false)
    if (want.contours) contours()
    else show(CONTOUR_LAYERS, false)
    stand(want.terrain)
  }

  return {
    update(next) {
      want = next
      if (tiles) return apply()
      if (loading || !(next.relief || next.contours || next.terrain)) return
      loading = true
      load().then(
        (loaded) => {
          tiles = loaded
          apply()
        },
        (err: unknown) => {
          // A failed chunk draws nothing and leaves the next switch to try
          // again; nothing else on the map depends on it.
          loading = false
          console.warn('Elevation layers failed to load', err)
        },
      )
    },
  }
}
