/**
 * The basemap's credit as the map's corner says it (TJ, 2026-11-03).
 *
 * OpenFreeMap's style hands MapLibre one attribution string for its one
 * source, `OpenFreeMap © OpenMapTiles Data from OpenStreetMap`, and the
 * attribution control joins each SOURCE's string to the next with a pipe, so
 * the corner read `MapLibre | Open-Meteo.com | © Mapterhorn | OpenFreeMap ©
 * OpenMapTiles Data from OpenStreetMap`: three credits run together after
 * five parted by pipes. The style is rewritten as it is fetched, before the
 * map takes it (`transformStyle`), so that source says its three credits the
 * way the rest of the line does, each in the words its licence asks for:
 * OpenMapTiles asks for `© OpenMapTiles` to be shown, and OpenStreetMap's
 * guideline for `© OpenStreetMap contributors`, linked to its copyright page;
 * OpenFreeMap asks for a credit and no more. Nothing else in the style
 * changes, and a style with no such source comes back as it was.
 */
import type { StyleSpecification } from 'maplibre-gl'

const link = (href: string, text: string) =>
  `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`

/** The basemap source's attribution: three credits, parted as the control parts sources. */
export const BASEMAP_CREDIT = [
  link('https://openfreemap.org', 'OpenFreeMap'),
  link('https://www.openmaptiles.org/', '© OpenMapTiles'),
  link('https://www.openstreetmap.org/copyright', '© OpenStreetMap contributors'),
].join(' | ')

/** The host whose attribution is rewritten, wherever the style names it. */
const OPENFREEMAP = 'openfreemap.org'

/** The style with every OpenFreeMap source credited as `BASEMAP_CREDIT`; `setStyle`'s `transformStyle`. */
export function creditBasemap(_previous: StyleSpecification | undefined, next: StyleSpecification): StyleSpecification {
  const sources = Object.entries(next.sources ?? {})
  if (!sources.some(([, s]) => 'attribution' in s && s.attribution?.includes(OPENFREEMAP))) return next
  return {
    ...next,
    sources: Object.fromEntries(
      sources.map(([id, s]) => [
        id,
        'attribution' in s && s.attribution?.includes(OPENFREEMAP) ? { ...s, attribution: BASEMAP_CREDIT } : s,
      ]),
    ),
  }
}

/** The options every load of the basemap style passes to `setStyle`. */
export const BASEMAP_STYLE_OPTIONS = { transformStyle: creditBasemap } as const
