/**
 * The Forest Service closure overlays (#550): one module for both layers, the
 * closed ground (`area`) and the closed trails, roads and sites (`trail`),
 * each mounted once by `mountFeatures` and switched by its own toggle.
 *
 * One module rather than two because the two differ only in what they draw:
 * the viewport fetch re-asked on a settled pan is the wildfire overlay's, and
 * one copy of it per kind would be two places for the same timing bug. Like
 * the fire overlay, the layers are added once when the map loads and `update`
 * only fills and empties them, so the fetch's abort and the kind's popups are
 * torn down in the one place they are made.
 */
import type * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { emptyFC, setSource } from '../basemap'
import { FIRE_REFETCH_DEBOUNCE_MS, fireDetailFor } from './wildfires'
import {
  CLOSURE_COLOR,
  CLOSURE_EDGE,
  closurePopupHtml,
  fetchClosures,
  type ClosureKind,
  type ClosureProps,
} from '../../utils/closures'
import type { BBox } from '../../utils/wildfires'
import { MARKER_STROKE } from '../mapStyles'
import type { MapPopups } from '../mapPopups'
import { overlayRecovery, retryAfterOf } from './recovery'

/** Each kind's source id. */
export const CLOSURE_SOURCES: Record<ClosureKind, string> = {
  area: 'closures-area',
  trail: 'closures-trail',
}

export const CLOSURE_AREA_FILL_LAYER = 'closure-area-fill'
export const CLOSURE_TRAIL_LINE_LAYER = 'closure-trail-line'
export const CLOSURE_TRAIL_SITE_LAYER = 'closure-trail-site'

/**
 * How far from a closed trail or site a click still lands on it, in screen
 * pixels: about the reach of the 2.5px line's own width again on each side
 * and a finger's error beyond it.
 */
export const CLOSURE_TRAIL_SLOP_PX = 6

export interface ClosureOverlay {
  update(next: { show: boolean }): void
  dispose(): void
}

/**
 * The layers one kind draws, lowest first, and which of them answer a click,
 * in the order a click that lands on two of them reads them.
 *
 * The area is the fire perimeter's treatment in the closure hue: a light fill
 * under a firm edge. The trail kind carries lines and points in one source, so
 * each layer filters to its geometry: a dashed line, because a closed trail is
 * still a trail and a solid one would read as a road on the basemap, and a
 * white-rimmed dot for a closed trailhead or site, which has no length to dash.
 */
function layersFor(kind: ClosureKind, source: string): { specs: maplibregl.LayerSpecification[]; clickable: string[] } {
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
      clickable: [CLOSURE_AREA_FILL_LAYER],
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
          'circle-stroke-color': MARKER_STROKE,
          'circle-stroke-width': 1.5,
        },
      },
    ],
    // A site before the line it sits on: the dot is the smaller target.
    clickable: [CLOSURE_TRAIL_SITE_LAYER, CLOSURE_TRAIL_LINE_LAYER],
  }
}

export function mountClosures(
  map: maplibregl.Map,
  kind: ClosureKind,
  // `online` is where the browser's `online` is heard; the window when absent.
  deps: { popups: MapPopups; online?: EventTarget | null },
): ClosureOverlay {
  // Added right after the fire overlay, so a closure is drawn over the fire
  // that caused it and under the drawing UI and the result markers. Data is
  // populated on demand by `update`; the layers render nothing until then.
  const source = CLOSURE_SOURCES[kind]
  map.addSource(source, { type: 'geojson', data: emptyFC as FeatureCollection })
  const { specs, clickable } = layersFor(kind, source)
  for (const spec of specs) map.addLayer(spec)

  // A click on a closure describes the order, the way a click on a marker
  // describes the destination; it used to open on hover, over the
  // destinations inside the closure (TJ, 2026-10-08). A closed trail is a
  // 2.5px line, so it answers a click within a few pixels of it, where an
  // exact hit was what a hover forgave and a finger rarely lands.
  const target = kind === 'area' ? 'closure-area' : 'closure-trail'
  deps.popups.register({
    target,
    layers: clickable,
    ...(kind === 'trail' && { slopPx: CLOSURE_TRAIL_SLOP_PX }),
    open: ({ feature, lngLat }) => {
      deps.popups.create(lngLat, closurePopupHtml(feature.properties as ClosureProps), { owner: target })
    },
  })

  // The fetch that runs while the overlay is on: this kind's closures for the
  // current viewport, re-fetched (debounced) as the reader pans and zooms.
  // Best-effort: a failed fetch leaves the overlay empty and never disrupts
  // the map or an analysis.
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
    // The same coarse-or-full choice as the fire perimeters, because the pod
    // simplifies both at the same tolerance.
    const detail = fireDetailFor(b.getWest(), b.getEast(), map.getCanvas().clientWidth)
    try {
      const fc = await fetchClosures(bbox, kind, detail, ac.signal)
      if (ac.signal.aborted) return
      setSource(map, source, fc)
      recovery.succeeded()
    } catch (err) {
      if (ac.signal.aborted || (err as Error).name === 'AbortError') return
      console.warn('Closure overlay fetch failed', err)
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
      setSource(map, source, emptyFC)
      // A popup about a closure the map no longer draws goes with it.
      deps.popups.closeAll(target)
    },
    dispose() {
      stopFetching()
    },
  }
}
