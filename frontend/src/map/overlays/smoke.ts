/**
 * The NOAA HMS smoke overlay: its source, the three density fills and the
 * outline, the cursor over a plume, the click popup, and the fetch that runs
 * while the overlay is on.
 *
 * The layers are added once, when the map loads, first of the three polygon
 * overlays: under the fire perimeters and over the radar tiles, which insert
 * themselves beneath the first fill here. That chain is the one the data
 * implies: rain is a measurement of the sky, smoke is a shape drawn over the
 * ground, and a fire is the thing you are steering away from.
 */
import { Popup } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { emptyFC, setSource } from '../basemap'
import type { MapController } from '../controller'
import { popupOptions, type PopupBoard } from '../popups'
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
  /** The popup a click on a plume opens; which plume is the click rule's call. */
  openPopup(props: SmokeProps, at: maplibregl.LngLatLike, pinned: boolean): void
  dispose(): void
}

export function mountSmoke(
  map: maplibregl.Map,
  deps: {
    controller: MapController
    restCursor: () => void
    popups: PopupBoard
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

  // A plume is clickable, so it takes the pointer, except in draw mode, where
  // a click places a vertex and the crosshair has to stay.
  for (const layer of SMOKE_CLICK_ORDER) {
    map.on('mouseenter', layer, () => {
      if (!deps.controller.inputs.drawing) map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', layer, deps.restCursor)
  }

  // Fetched once per toggle and never on a pan: the whole national analysis is
  // one small response, so unlike the fire overlay there is no viewport to
  // re-ask about. Best-effort: a failed fetch leaves the layers empty and never
  // disrupts the map or an analysis.
  let abort: AbortController | null = null

  return {
    update({ show }) {
      if (show === (abort !== null)) return
      if (!show) {
        abort?.abort()
        abort = null
        setSource(map, 'smoke', emptyFC)
        return
      }
      const ac = new AbortController()
      abort = ac
      fetchSmoke(ac.signal)
        .then((fc) => {
          if (!ac.signal.aborted) setSource(map, 'smoke', fc)
        })
        .catch((err) => {
          if ((err as Error).name !== 'AbortError') {
            console.warn('Smoke overlay fetch failed', err)
          }
        })
    },
    // Click rather than hover, which is the one place the two polygon overlays
    // deliberately behave differently. A fire is a small shape you point at; a
    // plume routinely covers three states, so a hover popup would open the
    // moment the cursor entered the map and follow it around. Clicking says
    // which plume you meant.
    openPopup(props, at, pinned) {
      if (!pinned) deps.popups.closeAll()
      const popup = new Popup({ ...popupOptions(map), closeOnClick: false })
        .setLngLat(at)
        .setHTML(smokePopupHtml(props))
        .addTo(map)
      deps.popups.track(popup)
    },
    dispose() {
      abort?.abort()
      abort = null
    },
  }
}
