/**
 * The satellite fire detections (#799): their source and starburst layer, the
 * viewport fetch that runs while the layer is on, and the minute timer that
 * moves each detection into its next age band.
 *
 * One file owns what one switch turns on and off, so the fetch's abort and the
 * timer are torn down in the same place they are made. The layer is added
 * once, when the map loads, over the fire perimeters and the closures and
 * under the drawn ring and the result markers (`features.ts`): a detection is
 * a point, and a point over an area it falls in reads where an area over the
 * point would tint it. `update` only fills and empties it.
 *
 * Each detection is a 12-point starburst, as CalTopo draws them: one SDF
 * image (`starburstSdf`) registered under `FIRE_STAR_IMAGE`, painted per band
 * through `icon-color` and edged with a dark halo, so one image serves all
 * three bands. Overlap is allowed, so a cluster stays a cluster, and the stars
 * take no room from the map's labels.
 *
 * No popup: a click on a detection opens nothing.
 */
import type * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { emptyFC, setSource } from '../basemap'
import { overlayRecovery, retryAfterOf } from './recovery'
import { FIRE_REFETCH_DEBOUNCE_MS } from './wildfires'
import {
  FIRE_ACTIVITY_COLOR,
  FIRE_ACTIVITY_HALO_WIDTH,
  FIRE_ACTIVITY_ICON_SIZE,
  FIRE_ACTIVITY_MINZOOM,
  FIRE_ACTIVITY_RECOLOR_MS,
  FIRE_ACTIVITY_SORT_KEY,
  FIRE_ACTIVITY_STROKE,
  FIRE_STAR_PIXEL_RATIO,
  fetchFireActivity,
  starburstSdf,
  withAgeBands,
} from '../../utils/fireActivity'
import type { FireActivityResponse } from '../../types'
import type { BBox } from '../../utils/wildfires'
import { isAbort } from '../../utils/abort'

export const FIRE_ACTIVITY_SOURCE = 'fire-activity'
export const FIRE_ACTIVITY_LAYER = 'fire-activity-points'
/** The starburst's image in the map's sprite, an SDF the layer tints per band. */
export const FIRE_STAR_IMAGE = 'fire-activity-star'

/**
 * The view as the box the route takes, read as the wildfire overlay reads it.
 * One function, so the one line that turns the map's bounds into a box can be
 * swapped for a flat-box helper without touching the fetch.
 */
export function fireActivityBox(map: maplibregl.Map): BBox {
  const b = map.getBounds()
  return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
}

export interface FireActivityOverlay {
  update(next: { show: boolean }): void
  dispose(): void
}

export function mountFireActivity(
  map: maplibregl.Map,
  deps: {
    /** Where the browser's `online` is heard; the window when absent. */
    online?: EventTarget | null
    /** The clock the bands are read against; `Date.now` when absent. */
    now?: () => number
  } = {},
): FireActivityOverlay {
  const now = deps.now ?? Date.now
  map.addSource(FIRE_ACTIVITY_SOURCE, { type: 'geojson', data: emptyFC as FeatureCollection })
  // Registered before the layer names it; MapLibre draws nothing for an
  // unknown icon and only warns.
  if (!map.hasImage(FIRE_STAR_IMAGE)) {
    map.addImage(FIRE_STAR_IMAGE, starburstSdf(), { sdf: true, pixelRatio: FIRE_STAR_PIXEL_RATIO })
  }
  map.addLayer({
    id: FIRE_ACTIVITY_LAYER,
    type: 'symbol',
    source: FIRE_ACTIVITY_SOURCE,
    minzoom: FIRE_ACTIVITY_MINZOOM,
    layout: {
      'icon-image': FIRE_STAR_IMAGE,
      'icon-size': FIRE_ACTIVITY_ICON_SIZE,
      // Every detection draws, so a cluster reads as a cluster, and none
      // hides a peak's or a town's name beneath it.
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      // Newer over older where stars overlap.
      'symbol-sort-key': FIRE_ACTIVITY_SORT_KEY,
    },
    paint: {
      'icon-color': FIRE_ACTIVITY_COLOR,
      'icon-halo-color': FIRE_ACTIVITY_STROKE,
      'icon-halo-width': FIRE_ACTIVITY_HALO_WIDTH,
    },
  })

  let showing = false
  let abort: AbortController | null = null
  let debounce: ReturnType<typeof setTimeout> | undefined
  let recolor: ReturnType<typeof setInterval> | undefined
  // The last answer, and the bands it was last drawn in, so the minute timer
  // repaints only when a detection crossed into its next band.
  let held: FireActivityResponse | null = null
  let drawnBands: string | null = null
  // A failed fetch is asked again when the browser comes back online, and no
  // sooner than the pod's Retry-After (`recovery.ts`, #580). No timer: a pan
  // already asks again.
  const recovery = overlayRecovery(() => void refresh(), { online: deps.online })

  function draw() {
    if (held === null) return
    const { data, bands } = withAgeBands(held, now())
    if (bands === drawnBands) return
    drawnBands = bands
    setSource(map, FIRE_ACTIVITY_SOURCE, data)
  }

  async function refresh() {
    // Below the floor the layer draws nothing, so a fetch would buy points no
    // one sees, over the widest box the route answers. What is held stays,
    // for the zoom back in.
    if (map.getZoom() < FIRE_ACTIVITY_MINZOOM) return
    abort?.abort()
    const ac = new AbortController()
    abort = ac
    try {
      const fc = await fetchFireActivity(fireActivityBox(map), ac.signal)
      if (ac.signal.aborted) return
      held = fc
      drawnBands = null
      draw()
      recovery.succeeded()
    } catch (err) {
      if (ac.signal.aborted || isAbort(err)) return
      console.warn('Fire activity overlay fetch failed', err)
      recovery.failed(retryAfterOf(err))
    }
  }
  function onMoveEnd() {
    clearTimeout(debounce)
    debounce = setTimeout(refresh, FIRE_REFETCH_DEBOUNCE_MS)
  }
  function stop() {
    clearTimeout(debounce)
    clearInterval(recolor)
    recolor = undefined
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
        void refresh()
        map.on('moveend', onMoveEnd)
        // The bands move with the clock, not with the data: a detection seen
        // 11 hours 59 minutes ago is orange a minute later, with no fetch.
        recolor = setInterval(draw, FIRE_ACTIVITY_RECOLOR_MS)
        return
      }
      stop()
      held = null
      drawnBands = null
      setSource(map, FIRE_ACTIVITY_SOURCE, emptyFC)
    },
    dispose() {
      stop()
    },
  }
}
