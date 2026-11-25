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
 * Since record 0348 it is also asked for again on its own, after each of
 * `STYLE_RETRY_S`, because a style host that failed for a few seconds came
 * back to a map that stayed blank until the reader's connection dropped and
 * returned, which on a steady connection is never.
 * Past `FALLBACK_AFTER_RETRIES` failed retries the map stops asking and takes
 * the fallback style for the rest of the visit, so `load` fires and the ring
 * tool mounts; the failure stays reported, because a reload is what brings
 * Liberty back. It is not swapped back in live, because that would replace
 * the style under every layer the app has added since.
 * The reload carries the credit rewrite every load of the style does
 * (`utils/basemapCredit.ts`), or the recovered map would credit the basemap
 * in the style's own words. When the style arrives the note clears.
 */
import type * as maplibregl from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import { BASEMAP_STYLE_OPTIONS } from '../utils/basemapCredit'
import { isStyleFailure } from '../utils/basemapFailure'
import { overlayRecovery } from './overlays/recovery'

/**
 * The waits before the style is asked for again on its own, the last one
 * repeating while it keeps failing. They grow so a host coming back is not met
 * by every open tab at once, and the first is short because a reader is
 * looking at a blank map.
 */
export const STYLE_RETRY_S = [5, 15, 30, 60] as const

/**
 * How many timed retries fail before the fallback style mounts: the first two,
 * so a reader waits about 20 s, not the minutes the later waits add up to,
 * before they can draw.
 */
export const FALLBACK_AFTER_RETRIES = 2

export interface BasemapWatch {
  dispose(): void
}

export function watchBasemap(
  map: maplibregl.Map,
  deps: {
    style: string
    /** The style taken for the rest of the visit once the retries run out. */
    fallback: StyleSpecification
    /** Whether the style is failing now; called with false once it loads. */
    onFailed: (failed: boolean) => void
    /** Where the browser's `online` is heard; the window when absent. */
    online?: EventTarget | null
    /**
     * The first load or the first failure, whichever comes first, told once:
     * the map loading is one of the reliability targets (record 0339).
     */
    onFirstOutcome?: (ok: boolean) => void
  },
): BasemapWatch {
  let styleLoaded = false
  let fellBack = false
  let told = false
  const tell = (ok: boolean) => {
    if (told) return
    told = true
    deps.onFirstOutcome?.(ok)
  }
  const reload = () => {
    // The failed style is dropped before the reload is asked for, because
    // MapLibre holds a `transformStyle` reload until the style it replaces
    // has loaded (`Map._updateStyle`, 6.15.0), which a style that failed
    // never does; with no style to replace it loads at once. The drop
    // releases the map's workers and the reload takes them again, which
    // costs nothing on a map that has drawn nothing.
    map.setStyle(null)
    map.setStyle(deps.style, { diff: false, ...BASEMAP_STYLE_OPTIONS })
  }
  const recovery = overlayRecovery(reload, { online: deps.online })
  // A timer of its own rather than `overlayRecovery`'s timed mode, which holds
  // an `online` back until its wait runs out: that wait is a pod's
  // Retry-After there, and here it is only ours, so a reconnect still asks at
  // once.
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  map.on('style.load', () => {
    styleLoaded = true
    // The fallback loading is not Liberty arriving: the failure stands.
    if (fellBack) return
    attempt = 0
    clearTimer()
    tell(true)
    recovery.succeeded()
    deps.onFailed(false)
  })
  map.on('error', (event) => {
    if (fellBack || !isStyleFailure(event as { sourceId?: unknown }, styleLoaded)) return
    tell(false)
    deps.onFailed(true)
    if (attempt >= FALLBACK_AFTER_RETRIES) {
      fellBack = true
      clearTimer()
      recovery.stop()
      map.setStyle(null)
      map.setStyle(deps.fallback, { diff: false })
      return
    }
    recovery.failed(null)
    if (timer === null) {
      const waitS = STYLE_RETRY_S[Math.min(attempt, STYLE_RETRY_S.length - 1)]
      attempt++
      timer = setTimeout(() => {
        timer = null
        reload()
      }, waitS * 1000)
    }
  })
  return {
    dispose: () => {
      clearTimer()
      recovery.stop()
    },
  }
}
