/**
 * The Satellite row's imagery (#799): two raster sources under the basemap's
 * roads, trails and labels, EOX's Sentinel-2 mosaic everywhere and USGS's
 * NAIP photography over it in the United States.
 *
 * Added the first time the row is switched on and never on load, because a
 * raster source starts fetching the moment a rendered layer names it and the
 * cold load asks no imagery host for anything. Switched off, the two layers
 * are hidden rather than removed: a hidden raster layer fetches nothing, and
 * the next switch-on draws from the tiles already held.
 *
 * The imagery goes directly above Liberty's `background` and under every other
 * layer of the style, so the roads, the trails, every label and the app's own
 * `ofm-*` layers stay on top. Liberty's ground then has to get out of its way:
 * while the row is on, its land and water fills, its buildings, its rivers and
 * its Natural Earth relief go to opacity 0 (`basemapFade`), and come back to
 * whatever they were when it goes off. Opacity rather than `visibility: none`,
 * because `lakeAnchor` in `map/basemap.ts` reads the `water` fill through
 * `queryRenderedFeatures`, which skips a hidden layer and keeps a transparent
 * one, so a clicked lake keeps its outline over the imagery.
 *
 * A tile host that fails (a dead network, a 5xx) is asked again once per
 * window `online` event through `recovery.ts`, the overlays' own rule. A 404
 * is not a failure: MapLibre drops it without an error event, and USGS answers
 * one outside its coverage, where the EOX layer beneath shows through.
 */
import type * as maplibregl from 'maplibre-gl'
import { EOX_IMAGERY_TILES, USGS_IMAGERY_TILES } from '../../utils/terrainSources'
import { overlayRecovery } from './recovery'

export const IMAGERY_EOX = 'imagery-eox'
export const IMAGERY_USGS = 'imagery-usgs'

/**
 * The deepest zoom EOX's tiles add detail at. Measured 2026-10-27 over a
 * forest, a town and a range in Washington, British Columbia and the Alps: a
 * z15 tile differs from its z14 parent, upsampled, by 1.7 to 3.2 RMS (of 255),
 * where a z14 tile differs from its z13 parent by 8.7 to 12.6. The 10m mosaic
 * runs out at z14, so past it the map stretches the tiles it has rather than
 * asking for more of the same pixels.
 */
const EOX_MAX_ZOOM = 14

/**
 * Where USGS's tiles are worth asking for. Below z13 its cache fills the land
 * outside its coverage with opaque white JPEGs (z9 to z12, measured
 * 2026-10-27 over British Columbia, Ontario and Sonora), and z8 and under are
 * a coarse world mosaic rather than NAIP. From z13 up, the edge of the
 * coverage is a transparent PNG and beyond it a 404, so EOX shows through
 * cleanly. Below z13 EOX alone draws everywhere, and a z12 screen pixel is
 * already coarser than EOX's 10m. z16 is the last level cached; z17 is a 404.
 */
const USGS_MIN_ZOOM = 13
const USGS_MAX_ZOOM = 16

/** Both imagery services tile at 256px. */
const IMAGERY_TILE_SIZE = 256

// Each provider's own credit, as `NOTICES.md` transcribes it, carried by its
// source so the map corner credits it while the layer draws.
const USGS_ATTRIBUTION =
  'Map services and data available from U.S. Geological Survey, National Geospatial Program'
const EOX_ATTRIBUTION =
  'EOxCloudless <a href="https://cloudless.eox.at" target="_blank">https://cloudless.eox.at</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)'

/** Liberty's two sources: its vector tiles and its Natural Earth relief. */
const BASEMAP_VECTOR = 'openmaptiles'
const BASEMAP_RELIEF = 'ne2_shaded'

/** The paint property that fades each kind of basemap layer. */
type FadeProperty = 'background-opacity' | 'raster-opacity' | 'fill-opacity' | 'fill-extrusion-opacity' | 'line-opacity'

/** A layer as `map.getStyle()` lists it, as far as `basemapFade` reads it. */
export interface StyleLayerRef {
  id: string
  type: string
  source?: unknown
  'source-layer'?: string
}

/**
 * The opacity property that fades this basemap layer under the imagery, or
 * null where it stays.
 *
 * What fades is the ground the imagery replaces: the background, the Natural
 * Earth relief, every vector fill but the road areas (land cover, land use,
 * parks, water, aeroways), the buildings in 2D and 3D, and the river lines,
 * which the photo shows for itself. What stays is everything a photo cannot
 * say: roads, paths, rail, boundaries, park outlines and every symbol. A layer
 * on a source that is not Liberty's (the app's overlays, the contours) is
 * never touched.
 */
export function basemapFade(layer: StyleLayerRef): FadeProperty | null {
  if (layer.type === 'background') return 'background-opacity'
  if (layer.source === BASEMAP_RELIEF && layer.type === 'raster') return 'raster-opacity'
  if (layer.source !== BASEMAP_VECTOR) return null
  const sourceLayer = layer['source-layer']
  if (layer.type === 'fill' && sourceLayer !== 'transportation') return 'fill-opacity'
  if (layer.type === 'fill-extrusion') return 'fill-extrusion-opacity'
  if (layer.type === 'line' && sourceLayer === 'waterway') return 'line-opacity'
  return null
}

/**
 * The layer the imagery goes beneath: the one directly above the background,
 * so the imagery is the lowest thing drawn but the background. With no
 * background, the style's first layer; with no layers, the top.
 */
export function imageryBeneath(layers: readonly StyleLayerRef[]): string | undefined {
  const at = layers.findIndex((l) => l.type === 'background')
  return layers[at + 1]?.id
}

export interface ImageryOverlay {
  update(next: { show: boolean }): void
}

export function mountImagery(map: maplibregl.Map, deps: { online?: EventTarget | null } = {}): ImageryOverlay {
  let showing = false
  // Each faded layer's opacity before the fade, `undefined` where the style
  // left it at its default, so the switch-off puts back exactly what was there.
  const faded = new Map<string, { property: FadeProperty; value: unknown }>()

  const recovery = overlayRecovery(
    () => {
      for (const id of [IMAGERY_EOX, IMAGERY_USGS]) if (map.getSource(id)) map.refreshTiles(id)
      // One attempt per `online`: a host still down fails the reload, and
      // its error arms the next one.
      recovery.succeeded()
    },
    { online: deps.online },
  )
  map.on('error', (event) => {
    const id = (event as { sourceId?: unknown }).sourceId
    // MapLibre's tile errors carry no headers, so there is no Retry-After to
    // wait out, and the attempt waits for `online` alone.
    if (showing && (id === IMAGERY_EOX || id === IMAGERY_USGS)) recovery.failed(null)
  })

  function add() {
    const layers = map.getStyle().layers as StyleLayerRef[]
    const beneath = imageryBeneath(layers)
    if (!map.getSource(IMAGERY_EOX)) {
      map.addSource(IMAGERY_EOX, {
        type: 'raster',
        tiles: [EOX_IMAGERY_TILES],
        tileSize: IMAGERY_TILE_SIZE,
        maxzoom: EOX_MAX_ZOOM,
        attribution: EOX_ATTRIBUTION,
      })
    }
    if (!map.getSource(IMAGERY_USGS)) {
      map.addSource(IMAGERY_USGS, {
        type: 'raster',
        tiles: [USGS_IMAGERY_TILES],
        tileSize: IMAGERY_TILE_SIZE,
        minzoom: USGS_MIN_ZOOM,
        maxzoom: USGS_MAX_ZOOM,
        attribution: USGS_ATTRIBUTION,
      })
    }
    // EOX first, then USGS before the same layer, so USGS lands over EOX.
    if (!map.getLayer(IMAGERY_EOX)) {
      map.addLayer({ id: IMAGERY_EOX, type: 'raster', source: IMAGERY_EOX }, beneath)
    }
    if (!map.getLayer(IMAGERY_USGS)) {
      // The layer's own floor too, so the map corner credits USGS only where
      // its photos can draw.
      map.addLayer({ id: IMAGERY_USGS, type: 'raster', source: IMAGERY_USGS, minzoom: USGS_MIN_ZOOM }, beneath)
    }
  }

  function fade() {
    for (const layer of map.getStyle().layers as StyleLayerRef[]) {
      const property = basemapFade(layer)
      if (property === null || faded.has(layer.id)) continue
      faded.set(layer.id, { property, value: map.getPaintProperty(layer.id, property) })
      map.setPaintProperty(layer.id, property, 0)
    }
  }

  function restore() {
    for (const [id, { property, value }] of faded) {
      // The value came from this property of this layer, which the five
      // properties' union of types cannot say.
      if (map.getLayer(id)) map.setPaintProperty(id, property, value as never)
    }
    faded.clear()
  }

  return {
    update({ show }) {
      if (show === showing) return
      showing = show
      if (!show) {
        for (const id of [IMAGERY_EOX, IMAGERY_USGS]) {
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none')
        }
        restore()
        recovery.stop()
        return
      }
      if (map.getLayer(IMAGERY_EOX)) {
        for (const id of [IMAGERY_EOX, IMAGERY_USGS]) map.setLayoutProperty(id, 'visibility', 'visible')
      } else {
        add()
      }
      fade()
    },
  }
}
