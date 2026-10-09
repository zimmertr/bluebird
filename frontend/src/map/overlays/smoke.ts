/**
 * The NOAA HMS smoke overlay: its source, the three density fills and the
 * outline, the popup a click on a plume opens, and the fetch that runs while
 * the overlay is on.
 *
 * The layers are added once, when the map loads, first of the three polygon
 * overlays: under the fire perimeters and over the radar tiles, which insert
 * themselves beneath the first fill here. That chain is the one the data
 * implies: rain is a measurement of the sky, smoke is a shape drawn over the
 * ground, and a fire is the thing you are steering away from.
 */
import type * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { emptyFC, setSource } from '../basemap'
import type { MapPopups } from '../mapPopups'
import { overlayRecovery, retryAfterOf } from './recovery'
import {
  SMOKE_CLICK_ORDER,
  SMOKE_DENSITIES,
  SMOKE_EDGE,
  SMOKE_FILL,
  SMOKE_OPACITY,
  fetchSmoke,
  smokeLayerId,
  smokePopupHtml,
  type SmokeProps,
} from '../../utils/smoke'

export interface SmokeOverlay {
  update(next: { show: boolean }): void
  dispose(): void
}

export function mountSmoke(
  map: maplibregl.Map,
  deps: {
    popups: MapPopups
    /** Where the browser's `online` is heard; the window when absent. */
    online?: EventTarget | null
  },
): SmokeOverlay {
  // One source, three fills, because opacity is the whole encoding and a single
  // data-driven fill-opacity would still need the same three-way match. This
  // way each density is also its own click target and its own legend row.
  map.addSource('smoke', { type: 'geojson', data: emptyFC as FeatureCollection })
  for (const density of SMOKE_DENSITIES) {
    map.addLayer({
      id: smokeLayerId(density),
      type: 'fill',
      source: 'smoke',
      filter: ['==', ['get', 'density'], density],
      paint: { 'fill-color': SMOKE_FILL, 'fill-opacity': SMOKE_OPACITY[density] },
    })
  }
  // One hairline over all three, so a plume has an edge you can find even where
  // it is faint. Deliberately not per density: the outline says "here is a
  // boundary", and three weights of it would be a second encoding competing
  // with the fills.
  map.addLayer({
    id: 'smoke-outline',
    type: 'line',
    source: 'smoke',
    paint: { 'line-color': SMOKE_EDGE, 'line-width': 1, 'line-opacity': 0.7 },
  })

  // A click on a plume describes it. HMS nests its plumes, so a click in the
  // interesting place lands on three at once, and the layers are listed
  // heaviest first because the reader means the densest.
  deps.popups.register({
    target: 'smoke',
    layers: SMOKE_CLICK_ORDER,
    open: ({ feature, lngLat }) => {
      deps.popups.create(lngLat, smokePopupHtml(feature.properties as SmokeProps), { owner: 'smoke' })
    },
  })

  // Fetched once per toggle and never on a pan: the whole national analysis is
  // one small response, so unlike the fire overlay there is no viewport to
  // re-ask about. Best-effort: a failed fetch leaves the layers empty and never
  // disrupts the map or an analysis. With no pan to ask again, a failure is
  // asked again when the pod's Retry-After runs out or the browser comes back
  // online (`recovery.ts`), so an outage ends without a toggle (#580).
  let showing = false
  let abort: AbortController | null = null
  const recovery = overlayRecovery(load, { timed: true, online: deps.online })

  function load() {
    abort?.abort()
    const ac = new AbortController()
    abort = ac
    fetchSmoke(ac.signal)
      .then((fc) => {
        if (ac.signal.aborted) return
        setSource(map, 'smoke', fc)
        recovery.succeeded()
      })
      .catch((err) => {
        if (ac.signal.aborted || (err as Error).name === 'AbortError') return
        console.warn('Smoke overlay fetch failed', err)
        recovery.failed(retryAfterOf(err))
      })
  }

  return {
    update({ show }) {
      if (show === showing) return
      showing = show
      if (!show) {
        abort?.abort()
        abort = null
        recovery.stop()
        setSource(map, 'smoke', emptyFC)
        // A popup about a plume the map no longer draws goes with it.
        deps.popups.closeAll('smoke')
        return
      }
      load()
    },
    dispose() {
      abort?.abort()
      abort = null
      recovery.stop()
    },
  }
}
