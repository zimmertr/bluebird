/**
 * Whether the basemap style failed to load, and what the panel says while it
 * cannot (#580).
 *
 * Without this a style that never arrived (OpenFreeMap down, a blocked host, a
 * connection lost at page load) left a blank map with nothing on screen saying
 * so: MapLibre reports the failure as an `error` event, and nothing listened.
 * Plain data, so the one decision here runs under node; the listening is
 * `map/basemapWatch.ts`.
 */

/** The note under Analyze while the style cannot load (approved by TJ, 2026-10-01). */
export const BASEMAP_FAILED_NOTE = 'The map could not load. Try again later.'

/**
 * Is this MapLibre `error` event the style itself failing?
 *
 * Only an error before the style has ever loaded, and one that names no
 * source, is. Sources, tiles, sprites and glyphs are all asked for after the
 * style's JSON has arrived (MapLibre fires `style.load` first), so a failure in
 * any of them is a gap in a map that drew, not a map that never could.
 */
export function isStyleFailure(event: { sourceId?: unknown }, styleLoaded: boolean): boolean {
  return !styleLoaded && event.sourceId === undefined
}
