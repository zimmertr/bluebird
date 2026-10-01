/**
 * The basemap style's failure and its recovery (#580).
 *
 * Registered right after the map is built, before `load`, because a style
 * that fails never reaches `load` and `mountFeatures` would never run. A
 * failure reports itself to the panel, which shows `BASEMAP_FAILED_NOTE` below
 * Analyze, and the style is asked for again once per window `online` event
 * while the failure is open (`overlays/recovery.ts`, the overlays' own rule).
 * `diff: false` because there is no loaded style to diff against; MapLibre
 * builds a fresh one, and the map's first `load` then fires as it would have.
 * When the style arrives the note clears.
 */
import type * as maplibregl from 'maplibre-gl'
import { isStyleFailure } from '../utils/basemapFailure'
import { overlayRecovery } from './overlays/recovery'

export interface BasemapWatch {
  dispose(): void
}

export function watchBasemap(
  map: maplibregl.Map,
  deps: {
    style: string
    /** Whether the style is failing now; called with false once it loads. */
    onFailed: (failed: boolean) => void
    /** Where the browser's `online` is heard; the window when absent. */
    online?: EventTarget | null
  },
): BasemapWatch {
  let styleLoaded = false
  const recovery = overlayRecovery(() => map.setStyle(deps.style, { diff: false }), { online: deps.online })
  map.on('style.load', () => {
    styleLoaded = true
    recovery.succeeded()
    deps.onFailed(false)
  })
  map.on('error', (event) => {
    if (!isStyleFailure(event as { sourceId?: unknown }, styleLoaded)) return
    recovery.failed(null)
    deps.onFailed(true)
  })
  return { dispose: () => recovery.stop() }
}
