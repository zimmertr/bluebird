/**
 * The NIFC wildfire overlay: its source and layers, the hover popup with its
 * grace close, and the viewport fetch that runs while the overlay is on.
 *
 * One file owns what one toggle turns on and off, so the popup's timers and the
 * fetch's abort are torn down in the same place they are made. The layers are
 * added once, when the map loads, beneath the drawing UI and the result markers;
 * `update` only fills and empties them.
 */
import { Popup } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { emptyFC, setSource } from '../basemap'
import {
  COARSE_TOLERANCE_DEG,
  fetchWildfires,
  fireIdentity,
  nifcFireUrl,
  wildfirePopupHtml,
  type BBox,
  type FireDetail,
  type WildfireProps,
} from '../../utils/wildfires'

// How long the wildfire popup survives the cursor leaving its perimeter, so
// the cursor can cross the gap and land on the NIFC link inside it. The popup
// opens flush against the hover point, so the gap is a few pixels and this is
// mostly slack for a hand that overshoots. Long enough to be reachable without
// hurrying, short enough that a popup left behind by a cursor moving on feels
// dismissed rather than stuck.
export const FIRE_POPUP_GRACE_MS = 400

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
  deps: { restCursor: () => void },
): WildfireOverlay {
  // Added before draw/results so the red perimeters sit beneath the drawing UI
  // and result markers. Data is populated on demand by `update`; the layers
  // render nothing until then.
  map.addSource('wildfires', { type: 'geojson', data: emptyFC as FeatureCollection })
  map.addLayer({
    id: WILDFIRE_FILL_LAYER,
    type: 'fill',
    source: 'wildfires',
    paint: { 'fill-color': '#dc2626', 'fill-opacity': 0.3 },
  })
  map.addLayer({
    id: 'wildfire-outline',
    type: 'line',
    source: 'wildfires',
    paint: { 'line-color': '#b91c1c', 'line-width': 1.5, 'line-opacity': 0.9 },
  })

  let popup: Popup | null = null
  // Which fire the open popup describes, so a mousemove within that same fire
  // leaves it anchored where it is; and the pending close that gives the
  // cursor time to travel from the perimeter onto the popup.
  let hovered: string | null = null
  let closeTimer: ReturnType<typeof setTimeout> | null = null

  // Hover (desktop) surfaces the fire's stats. The popup carries a link to
  // NIFC's map, so it has to be reachable, and two things used to stop that: it
  // re-anchored on every mousemove, so moving toward it moved it (it opens
  // above the cursor, and the cursor comes up from below); and leaving the
  // perimeter removed it synchronously, which is exactly what reaching for it
  // does. So it re-anchors only when the cursor crosses into a *different* fire
  // (still tracking overlapping perimeters, the behavior the per-move update
  // existed for) and a leave schedules the close instead of doing it, which a
  // hover over the popup cancels.
  function closePopup() {
    closeTimer = null
    hovered = null
    popup?.remove()
    popup = null
  }
  function cancelClose() {
    if (closeTimer === null) return
    clearTimeout(closeTimer)
    closeTimer = null
  }
  function scheduleClose() {
    cancelClose()
    closeTimer = setTimeout(closePopup, FIRE_POPUP_GRACE_MS)
  }
  function showPopup(e: maplibregl.MapLayerMouseEvent) {
    const props = e.features?.[0]?.properties
    if (!props) return
    const key = fireIdentity(props as WildfireProps)
    // Same fire, already open: leave it exactly where it is so it can be moved
    // onto. A pending close means the cursor re-entered the perimeter without
    // ever reaching the popup; call that a stay.
    if (popup && key === hovered) {
      cancelClose()
      return
    }
    cancelClose()
    hovered = key
    const html = wildfirePopupHtml(props as WildfireProps, fireLinkAt(map, e.lngLat))
    if (popup) {
      popup.setLngLat(e.lngLat).setHTML(html)
    } else {
      popup = new Popup({ closeButton: false, maxWidth: '260px' })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map)
    }
    // MapLibre leaves the popup container pointer-events:none and its content
    // auto, so the content element is the one that can be hovered. setHTML
    // replaces that element's children, not the element, and addEventListener
    // dedupes an identical listener, so re-arming on every open is a no-op
    // after the first.
    const content = popup.getElement().querySelector('.maplibregl-popup-content')
    content?.addEventListener('mouseenter', cancelClose)
    content?.addEventListener('mouseleave', scheduleClose)
  }
  map.on('mouseenter', WILDFIRE_FILL_LAYER, (e) => {
    map.getCanvas().style.cursor = 'pointer'
    showPopup(e)
  })
  map.on('mousemove', WILDFIRE_FILL_LAYER, showPopup)
  map.on('mouseleave', WILDFIRE_FILL_LAYER, () => {
    deps.restCursor()
    scheduleClose()
  })

  // The fetch that runs while the overlay is on: perimeters for the current
  // viewport, re-fetched (debounced) as the reader pans and zooms.
  // Best-effort: a failed fetch just leaves the overlay empty and never
  // disrupts the map or an analysis.
  let showing = false
  let abort: AbortController | null = null
  let debounce: ReturnType<typeof setTimeout> | undefined

  async function refresh() {
    abort?.abort()
    const ac = new AbortController()
    abort = ac
    const b = map.getBounds()
    const bbox: BBox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
    const detail = fireDetailFor(b.getWest(), b.getEast(), map.getCanvas().clientWidth)
    try {
      const fc = await fetchWildfires(bbox, detail, ac.signal)
      if (!ac.signal.aborted) setSource(map, 'wildfires', fc)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.warn('Wildfire overlay fetch failed', err)
      }
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
      // Turning the overlay off outranks a pending grace close: cancel it, or
      // the timer fires later against a popup that is already gone.
      cancelClose()
      closePopup()
    },
    dispose() {
      stopFetching()
      cancelClose()
      popup = null
    },
  }
}
