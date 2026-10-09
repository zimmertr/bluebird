/**
 * The NIFC wildfire overlay: its source and layers, the popup a click on a
 * perimeter opens, and the viewport fetch that runs while the overlay is on.
 *
 * One file owns what one toggle turns on and off, so the fetch's abort and the
 * fire's popups are torn down in the same place they are made. The layers are
 * added once, when the map loads, beneath the drawing UI and the result markers;
 * `update` only fills and empties them.
 */
import type * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { emptyFC, setSource } from '../basemap'
import {
  COARSE_TOLERANCE_DEG,
  WILDFIRE_EDGE,
  WILDFIRE_FILL,
  WILDFIRE_FILL_OPACITY,
  fetchWildfires,
  nifcFireUrl,
  wildfirePopupHtml,
  type BBox,
  type FireDetail,
  type WildfireProps,
} from '../../utils/wildfires'
import type { MapPopups } from '../mapPopups'
import { overlayRecovery, retryAfterOf } from './recovery'

// How long a pan or zoom must settle before the viewport is asked about again.
export const FIRE_REFETCH_DEBOUNCE_MS = 400

export const WILDFIRE_FILL_LAYER = 'wildfire-fill'

/**
 * Which cached copy of the perimeters a view should ask for.
 *
 * The server's coarse copy is simplified to ~56 m. Ask for it whenever that is
 * finer than two screen pixels of longitude, which is every view wide enough to
 * show a whole fire, and take the full-resolution shapes only when zoomed close
 * enough to see the difference. Same trade the old per-request
 * maxAllowableOffset made, expressed as a choice between two cached copies so
 * no zoom level costs an upstream query.
 */
export function fireDetailFor(westDeg: number, eastDeg: number, widthPx: number): FireDetail {
  const tol = ((eastDeg - westDeg) / (widthPx || 1)) * 2
  return tol > COARSE_TOLERANCE_DEG ? 'coarse' : 'full'
}

/**
 * NIFC map link, centered where the cursor or click sits on the fire (which is
 * inside its perimeter). Zoom is clamped so a fire clicked from a zoomed-out
 * view still opens framed rather than tiny, then nudged one level closer so the
 * fire fills more of the NIFC map.
 */
export function fireLinkAt(map: maplibregl.Map, at: { lng: number; lat: number }): string {
  return nifcFireUrl(at.lng, at.lat, Math.max(map.getZoom(), 10) + 1)
}

export interface WildfireOverlay {
  update(next: { show: boolean }): void
  dispose(): void
}

export function mountWildfires(
  map: maplibregl.Map,
  // `online` is where the browser's `online` is heard; the window when absent.
  deps: { popups: MapPopups; online?: EventTarget | null },
): WildfireOverlay {
  // Added before draw/results so the red perimeters sit beneath the drawing UI
  // and result markers. Data is populated on demand by `update`; the layers
  // render nothing until then.
  map.addSource('wildfires', { type: 'geojson', data: emptyFC as FeatureCollection })
  map.addLayer({
    id: WILDFIRE_FILL_LAYER,
    type: 'fill',
    source: 'wildfires',
    paint: { 'fill-color': WILDFIRE_FILL, 'fill-opacity': WILDFIRE_FILL_OPACITY },
  })
  map.addLayer({
    id: 'wildfire-outline',
    type: 'line',
    source: 'wildfires',
    paint: { 'line-color': WILDFIRE_EDGE, 'line-width': 1.5, 'line-opacity': 0.9 },
  })

  // A click on a perimeter describes the fire, with the link to it on NIFC's
  // map, the way a click on a marker describes the destination (TJ,
  // 2026-10-08). Nothing opens on a hover, which would cover the destinations
  // inside the fire, and the click stays on the map rather than leaving it.
  deps.popups.register({
    target: 'fire',
    layers: [WILDFIRE_FILL_LAYER],
    open: ({ feature, lngLat }) => {
      deps.popups.create(lngLat, wildfirePopupHtml(feature.properties as WildfireProps, fireLinkAt(map, lngLat)), {
        owner: 'fire',
      })
    },
  })

  // The fetch that runs while the overlay is on: perimeters for the current
  // viewport, re-fetched (debounced) as the reader pans and zooms.
  // Best-effort: a failed fetch just leaves the overlay empty and never
  // disrupts the map or an analysis.
  let showing = false
  let abort: AbortController | null = null
  let debounce: ReturnType<typeof setTimeout> | undefined
  // A failed fetch is asked again when the browser comes back online, and no
  // sooner than the pod's Retry-After (`recovery.ts`, #580). No timer: a pan
  // already asks again.
  const recovery = overlayRecovery(() => void refresh(), { online: deps.online })

  async function refresh() {
    abort?.abort()
    const ac = new AbortController()
    abort = ac
    const b = map.getBounds()
    const bbox: BBox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
    const detail = fireDetailFor(b.getWest(), b.getEast(), map.getCanvas().clientWidth)
    try {
      const fc = await fetchWildfires(bbox, detail, ac.signal)
      if (ac.signal.aborted) return
      setSource(map, 'wildfires', fc)
      recovery.succeeded()
    } catch (err) {
      if (ac.signal.aborted || (err as Error).name === 'AbortError') return
      console.warn('Wildfire overlay fetch failed', err)
      recovery.failed(retryAfterOf(err))
    }
  }
  function onMoveEnd() {
    clearTimeout(debounce)
    debounce = setTimeout(refresh, FIRE_REFETCH_DEBOUNCE_MS)
  }
  function stopFetching() {
    clearTimeout(debounce)
    abort?.abort()
    abort = null
    map.off('moveend', onMoveEnd)
    recovery.stop()
  }

  return {
    update({ show }) {
      if (show === showing) return
      showing = show
      if (show) {
        refresh()
        map.on('moveend', onMoveEnd)
        return
      }
      stopFetching()
      setSource(map, 'wildfires', emptyFC)
      // A popup about a fire the map no longer draws goes with it.
      deps.popups.closeAll('fire')
    },
    dispose() {
      stopFetching()
    },
  }
}
