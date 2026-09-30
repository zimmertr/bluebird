/**
 * The Forest Service closure overlays (#550): one module for both layers, the
 * closed ground (`area`) and the closed trails, roads and sites (`trail`),
 * each mounted once by `mountFeatures` and switched by its own toggle.
 *
 * One module rather than two because the two differ only in what they draw:
 * the hover popup with its grace close and the viewport fetch re-asked on a
 * settled pan are the wildfire overlay's, and one copy of that machinery per
 * kind would be two places for the same timing bug. Like the fire overlay, the
 * layers are added once when the map loads and `update` only fills and empties
 * them, so the popup's timer and the fetch's abort are torn down in the one
 * place they are made.
 */
import { Popup } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { emptyFC, setSource } from '../basemap'
import { FIRE_POPUP_GRACE_MS, FIRE_REFETCH_DEBOUNCE_MS, fireDetailFor } from './wildfires'
import {
  CLOSURE_COLOR,
  CLOSURE_EDGE,
  closureIdentity,
  closurePopupHtml,
  fetchClosures,
  type ClosureKind,
  type ClosureProps,
} from '../../utils/closures'
import type { BBox } from '../../utils/wildfires'

/** Each kind's source id. */
export const CLOSURE_SOURCES: Record<ClosureKind, string> = {
  area: 'closures-area',
  trail: 'closures-trail',
}

export const CLOSURE_AREA_FILL_LAYER = 'closure-area-fill'
export const CLOSURE_TRAIL_LINE_LAYER = 'closure-trail-line'
export const CLOSURE_TRAIL_SITE_LAYER = 'closure-trail-site'

export interface ClosureOverlay {
  update(next: { show: boolean }): void
  dispose(): void
}

/**
 * The layers one kind draws, lowest first, and which of them answer a hover.
 *
 * The area is the fire perimeter's treatment in the closure hue: a light fill
 * under a firm edge. The trail kind carries lines and points in one source, so
 * each layer filters to its geometry: a dashed line, because a closed trail is
 * still a trail and a solid one would read as a road on the basemap, and a
 * white-rimmed dot for a closed trailhead or site, which has no length to dash.
 */
function layersFor(kind: ClosureKind, source: string): { specs: maplibregl.LayerSpecification[]; hover: string[] } {
  if (kind === 'area') {
    return {
      specs: [
        {
          id: CLOSURE_AREA_FILL_LAYER,
          type: 'fill',
          source,
          paint: { 'fill-color': CLOSURE_COLOR, 'fill-opacity': 0.2 },
        },
        {
          id: 'closure-area-outline',
          type: 'line',
          source,
          paint: { 'line-color': CLOSURE_EDGE, 'line-width': 1.5, 'line-opacity': 0.9 },
        },
      ],
      hover: [CLOSURE_AREA_FILL_LAYER],
    }
  }
  return {
    specs: [
      {
        id: CLOSURE_TRAIL_LINE_LAYER,
        type: 'line',
        source,
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-color': CLOSURE_COLOR,
          'line-width': 2.5,
          'line-dasharray': [2, 1.5],
          'line-opacity': 0.9,
        },
      },
      {
        id: CLOSURE_TRAIL_SITE_LAYER,
        type: 'circle',
        source,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 4.5,
          'circle-color': CLOSURE_COLOR,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
        },
      },
    ],
    hover: [CLOSURE_TRAIL_LINE_LAYER, CLOSURE_TRAIL_SITE_LAYER],
  }
}

export function mountClosures(
  map: maplibregl.Map,
  kind: ClosureKind,
  deps: { restCursor: () => void },
): ClosureOverlay {
  // Added right after the fire overlay, so a closure is drawn over the fire
  // that caused it and under the drawing UI and the result markers. Data is
  // populated on demand by `update`; the layers render nothing until then.
  const source = CLOSURE_SOURCES[kind]
  map.addSource(source, { type: 'geojson', data: emptyFC as FeatureCollection })
  const { specs, hover } = layersFor(kind, source)
  for (const spec of specs) map.addLayer(spec)

  let popup: Popup | null = null
  // Which closure the open popup describes, and the pending close that gives
  // the cursor time to reach the order's link inside it. The same approach as
  // the fire popup, for the same reason: re-anchoring on every move would
  // move the popup away from a cursor travelling toward it.
  let hovered: string | null = null
  let closeTimer: ReturnType<typeof setTimeout> | null = null

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
    const feature = e.features?.[0]
    const props = feature?.properties
    if (!props) return
    // Keyed by layer as well as by id: the trail kind's lines and sites can
    // come from two of the service's layers, whose ids are unique within a
    // layer but not across them, and a line and a site sharing a number must
    // not read as one closure.
    const key = `${feature.layer?.id ?? ''}:${closureIdentity(props as ClosureProps)}`
    if (popup && key === hovered) {
      cancelClose()
      return
    }
    cancelClose()
    hovered = key
    const html = closurePopupHtml(props as ClosureProps)
    if (popup) {
      popup.setLngLat(e.lngLat).setHTML(html)
    } else {
      popup = new Popup({ closeButton: false, maxWidth: '260px' })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map)
    }
    // The content element is the one that can be hovered (MapLibre leaves the
    // container pointer-events:none); an identical listener dedupes, so
    // re-arming on every open is a no-op after the first.
    const content = popup.getElement().querySelector('.maplibregl-popup-content')
    content?.addEventListener('mouseenter', cancelClose)
    content?.addEventListener('mouseleave', scheduleClose)
  }
  for (const layer of hover) {
    map.on('mouseenter', layer, (e) => {
      map.getCanvas().style.cursor = 'pointer'
      showPopup(e)
    })
    map.on('mousemove', layer, showPopup)
    map.on('mouseleave', layer, () => {
      deps.restCursor()
      scheduleClose()
    })
  }

  // The fetch that runs while the overlay is on: this kind's closures for the
  // current viewport, re-fetched (debounced) as the reader pans and zooms.
  // Best-effort: a failed fetch leaves the overlay empty and never disrupts
  // the map or an analysis.
  let showing = false
  let abort: AbortController | null = null
  let debounce: ReturnType<typeof setTimeout> | undefined

  async function refresh() {
    abort?.abort()
    const ac = new AbortController()
    abort = ac
    const b = map.getBounds()
    const bbox: BBox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
    // The same coarse-or-full choice as the fire perimeters, because the pod
    // simplifies both at the same tolerance.
    const detail = fireDetailFor(b.getWest(), b.getEast(), map.getCanvas().clientWidth)
    try {
      const fc = await fetchClosures(bbox, kind, detail, ac.signal)
      if (!ac.signal.aborted) setSource(map, source, fc)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.warn('Closure overlay fetch failed', err)
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
      setSource(map, source, emptyFC)
      // Turning the overlay off outranks a pending grace close.
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
