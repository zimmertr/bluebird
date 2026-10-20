/**
 * The map's trailhead and crag markers (#734): their source, their two layers
 * with a glow under each, and the viewport fetch that fills them.
 *
 * Always on, with no Layers row, because they are destinations the way the
 * peaks and lakes are rather than an overlay about the ground (the
 * maintainer, 2026-10-16). The click is not this module's: the two layer ids
 * are in `POI_LAYERS`, so `poiPopup.ts` opens the same card a peak opens, and
 * its glow lights these with the rest. Mounted right after `enhanceBasemap`,
 * which registers the icons the layers name.
 */
import type * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import {
  CLIMBING_IMAGE,
  POI_LABEL_PAINT,
  TRAILHEAD_IMAGE,
  emptyFC,
  glowTwin,
  poiLabelLayout,
  setSource,
} from './basemap'
import { isAbort } from '../utils/abort'
import { LANDMARK_LAYERS, LANDMARK_MINZOOM, fetchLandmarks, landmarkKindOf } from '../utils/landmarks'
import type { BBox } from '../utils/wildfires'
import { FIRE_REFETCH_DEBOUNCE_MS } from './overlays/wildfires'
import { overlayRecovery, retryAfterOf } from './overlays/recovery'

export const LANDMARK_SOURCE = 'landmarks'

// The sprite's stroked circle, for a browser with no 2D canvas to draw the
// icons on, as the climbing layer wore before #715.
const FALLBACK_ICON = 'circle_stroked_11'

export interface LandmarkLayer {
  /**
   * Where a held marker stands, by its `osm_id`, or null for one not held.
   * A click reads this rather than the drawn geometry: a GeoJSON source is
   * tiled, so `queryRenderedFeatures` answers a point snapped to the tile
   * grid, about 2 m off at zoom 11. The pod merges a clicked destination
   * into a polygon search's row by its coordinate alone, to a metre, so a
   * clicked crag 2 m from itself would rank as two rows.
   */
  pointOf(osmId: string): [number, number] | null
  dispose(): void
}

export function mountLandmarks(
  map: maplibregl.Map,
  // `online` is where the browser's `online` is heard; the window when absent.
  deps: { online?: EventTarget | null },
): LandmarkLayer {
  // Under the style's own labels and over the basemap's clickable ones. The
  // loaded style lists the layers `enhanceBasemap` added, which are symbols
  // too, so its first symbol would be the peaks' glow and these would stack
  // beneath every peak and lake.
  const beforeId = map.getStyle().layers?.find((l) => l.type === 'symbol' && !l.id.startsWith('ofm-'))?.id
  const iconOr = (id: string) => (map.hasImage(id) ? id : FALLBACK_ICON)

  map.addSource(LANDMARK_SOURCE, { type: 'geojson', data: emptyFC as FeatureCollection })
  for (const id of LANDMARK_LAYERS) {
    const kind = landmarkKindOf(id)!
    const layer: maplibregl.SymbolLayerSpecification = {
      id,
      type: 'symbol',
      source: LANDMARK_SOURCE,
      minzoom: LANDMARK_MINZOOM,
      filter: ['==', ['get', 'kind'], kind],
      layout: {
        ...poiLabelLayout(iconOr(kind === 'crag' ? CLIMBING_IMAGE : TRAILHEAD_IMAGE)),
        'text-field': ['get', 'name'],
        // The one clickable layer whose icons collide away. Boulders and
        // walls stand metres apart, so with overlap allowed a climbing area
        // drew as a pile of circles (measured at Index, 2026-10-15). The
        // maintainer chose to show one or two until the reader zooms in, and
        // accepted that a hidden icon cannot be clicked until it draws.
        ...(kind === 'crag' ? { 'icon-allow-overlap': false } : {}),
      },
      paint: POI_LABEL_PAINT,
    }
    map.addLayer(glowTwin(layer), beforeId)
    map.addLayer(layer, beforeId)
  }

  // The exact point of every marker the last answer carried, by OSM id, for
  // `pointOf`.
  const points = new Map<string, [number, number]>()
  let abort: AbortController | null = null
  let debounce: ReturnType<typeof setTimeout> | undefined
  // A failed fetch is asked again when the browser comes back online, and no
  // sooner than the pod's Retry-After (`recovery.ts`, #580). No timer: a pan
  // already asks again.
  const recovery = overlayRecovery(() => void refresh(), { online: deps.online })

  async function refresh() {
    // Below the floor the layers draw nothing, so a fetch would buy markers
    // no one sees, over a viewport wide enough to be the heaviest answer the
    // route gives. What is held stays, for the zoom back in.
    if (map.getZoom() < LANDMARK_MINZOOM) return
    // Nor inside the pod's Retry-After. The layer has no switch, so on a
    // deployment with no database every pan would ask, and log, a 503 the pod
    // already said would not change before then.
    if (recovery.waiting()) return
    abort?.abort()
    const ac = new AbortController()
    abort = ac
    const b = map.getBounds()
    const bbox: BBox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
    try {
      const fc = await fetchLandmarks(bbox, ac.signal)
      if (ac.signal.aborted) return
      points.clear()
      for (const f of fc.features) {
        const [lon, lat] = f.geometry.coordinates
        points.set(f.properties.osm_id, [lon, lat])
      }
      setSource(map, LANDMARK_SOURCE, fc)
      recovery.succeeded()
    } catch (err) {
      if (ac.signal.aborted || isAbort(err)) return
      console.warn('Landmark fetch failed', err)
      recovery.failed(retryAfterOf(err))
    }
  }
  function onMoveEnd() {
    clearTimeout(debounce)
    debounce = setTimeout(refresh, FIRE_REFETCH_DEBOUNCE_MS)
  }

  void refresh()
  map.on('moveend', onMoveEnd)

  return {
    pointOf(osmId) {
      return points.get(osmId) ?? null
    },
    dispose() {
      clearTimeout(debounce)
      abort?.abort()
      abort = null
      map.off('moveend', onMoveEnd)
      recovery.stop()
    },
  }
}
