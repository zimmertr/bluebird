// Where a popup's coordinate pair links to: CalTopo, centred on the point.
//
// The link is the bare centring URL and nothing more, the coordinates and,
// where the map has one, its zoom. It names no base layer and no overlay, so
// whatever the reader's own CalTopo settings choose is what they land on (TJ,
// 2026-10-14, #712).
//
// CalTopo's grammar is undocumented, as Windy's is (`windy.ts`), and was
// measured against the live site on 2026-10-14 rather than read off a page:
//
// - A blank map takes its state from the hash: `map.html#ll=LAT,LON&z=Z`.
//   Opened at `#ll=46.85230,-121.76030&z=14`, the page centred its crosshair
//   on 46.85233, -121.76027, its zoom badge read Z14, and it then cleared the
//   hash. CalTopo's own training page writes the key as `lI`, which is a typo
//   on the page rather than the grammar.
// - CalTopo counts zoom on 256px tiles and MapLibre on 512px ones, so the same
//   view is one level apart. At Z14 CalTopo's scale bar drew 500 m across 77px,
//   6.5 m per pixel at 46.85° N, which is MapLibre's zoom 13. The link adds
//   one, so the reader lands on the view they were already looking at.
// - CalTopo draws whole levels, so a fractional zoom is rounded.

/** How far CalTopo's zoom stands above MapLibre's for one view (measured above). */
export const CALTOPO_ZOOM_OFFSET = 1

/** CalTopo's zoom for the view a MapLibre map is showing. */
export function caltopoZoom(mapZoom: number): number {
  return Math.round(mapZoom) + CALTOPO_ZOOM_OFFSET
}

/**
 * The CalTopo link for a point. Five decimals, as `destinationUrl` writes
 * them, so the link says the same digits the popup prints. Without a zoom the
 * link carries none and CalTopo opens at its own.
 */
export function caltopoUrl(latitude: number, longitude: number, mapZoom?: number): string {
  const zoom = mapZoom === undefined ? '' : `&z=${caltopoZoom(mapZoom)}`
  return `https://caltopo.com/map.html#ll=${latitude.toFixed(5)},${longitude.toFixed(5)}${zoom}`
}
