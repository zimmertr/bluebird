// Active US wildfire perimeters, read from Bluebird Forecast's own `GET /api/wildfires`
// rather than from NIFC directly.
//
// The browser used to query NIFC's ArcGIS feature service itself, which was
// tempting because that service is free, keyless, and CORS-open. The catch is
// that its quota belongs to NIFC's ArcGIS *organization* and is shared by every
// consumer of the public WFIGS dataset, so it empties and refills on traffic
// Bluebird Forecast has no part in. Fetches failed at random, which is what the
// "Wildfire check unavailable" label was reporting (issue #203). The backend now
// holds one national snapshot and serves it to everyone, so a refusal upstream
// no longer reaches a visitor.
//
// Coverage is still US-only: this is the authoritative national perimeter
// dataset (CC-BY 3.0), and outside the US an empty answer means "not covered",
// not "nothing burning".
import type { FeatureCollection, MultiPolygon } from 'geojson'
import { apiFetch, overlayFeatures, type OverlayFailure } from './apiFetch'
import { grouped, isFiniteNumber, roundTo } from './numbers'
import { hexToRgb } from './colors'

const WILDFIRES_URL = '/api/wildfires'

/**
 * The wildfire FeatureCollection plus the foreign members the API rides on it.
 *
 * `coverage` is what WFIGS can see: a coarse US outline, split at the
 * antimeridian so no ring wraps 180°. It is the server's statement, published
 * beside the data it qualifies, so the browser holds no copy of the boundary
 * (#256). Optional because an older server may not send it; a missing member
 * degrades to the old behavior of trusting an empty answer.
 */
export interface WildfireResponse extends FeatureCollection {
  coverage?: MultiPolygon
}

// NIFC's public "explore" map for this dataset. There's no per-incident detail
// page keyed by any field this layer exposes, so a clicked fire instead deep-
// links the authoritative live map centered on that exact spot — ArcGIS Hub
// reads `?location=lat,lon,zoom`. That's the closest genuinely fire-scoped
// destination NIFC offers.
const NIFC_EXPLORE_URL =
  'https://data-nifc.opendata.arcgis.com/datasets/nifc::wfigs-current-interagency-fire-perimeters/explore'

/**
 * Where the layer's own credit points: NIFC's open-data home rather than the
 * per-incident deep link above, because a legend credits the SOURCE where a
 * popup links the fire. Beside the other three overlays' hrefs in their own
 * modules (`IEM_HREF`, `HMS_HREF`, `NOHRSC_HREF`), so the legend reads every
 * credit from the module that owns the data (#454).
 */
export const NIFC_HREF = 'https://data-nifc.opendata.arcgis.com/'

/**
 * How a fire perimeter draws, and the one place that decides it (#365).
 *
 * Red, the one hue a fire can be: Tailwind's red-600 for the fill, one step
 * darker for the outline, the way the smoke and closure layers pair theirs.
 * It lives here rather than in `styles.ts` for `SMOKE_FILL`'s reason: these
 * are MapLibre paint values handed to the GL renderer, not Tailwind utilities,
 * and the legend reads the same constants so the picture and its key cannot
 * disagree.
 */
export const WILDFIRE_FILL = '#dc2626'
export const WILDFIRE_EDGE = '#b91c1c'
/** The fill's opacity on the map: enough to read as burned ground under labels. */
export const WILDFIRE_FILL_OPACITY = 0.3

/**
 * The legend's swatch: the fill at a step more opacity than the map gives it,
 * because a 14px chip on the legend's dark panel needs more ink than an acre
 * of map does to read as the same red. The closure swatch takes its alpha from
 * this one.
 */
export function wildfireSwatch(): { backgroundColor: string; borderColor: string } {
  const [r, g, b] = hexToRgb(WILDFIRE_FILL)
  return { backgroundColor: `rgba(${r},${g},${b},0.35)`, borderColor: WILDFIRE_EDGE }
}

/**
 * How close the NIFC map opens on a fire linked from a surface that has no map
 * of its own to ask. A clicked fire on Bluebird's own map passes the reader's
 * current zoom instead; a table cell and a marker popup have none, so they
 * share this one, which frames a whole fire without losing the country around
 * it.
 */
export const FIRE_LINK_ZOOM = 10

// Deep-link the NIFC explore map, centered on a clicked fire. Coords are
// rounded to ~1 m and zoom to 2 dp; order is lat,lon,zoom per the Hub param.
export function nifcFireUrl(lng: number, lat: number, zoom: number): string {
  const z = roundTo(zoom, 2)
  return `${NIFC_EXPLORE_URL}?location=${lat.toFixed(5)},${lng.toFixed(5)},${z}`
}

// [west, south, east, north] in EPSG:4326 — the map viewport we query within.
export type BBox = [number, number, number, number]

/**
 * Geometry fidelity.
 *
 * `coarse` is simplified to ~56 m, which is finer than a screen pixel at any
 * zoom that fits a whole fire and about a thirteenth of the bytes. The app
 * uses it for drawing AND for the proximity check: 56 m is 0.035 mi against a
 * 10-mile threshold displayed at 0.1 mi, so the simplification cannot change
 * an answer. `full` is the surveyed shape, kept on the API for callers who
 * need the real geometry.
 */
export type FireDetail = 'coarse' | 'full'

/**
 * How coarse the server's `coarse` copy actually is, in degrees (~56 m).
 *
 * Mirrors `COARSE_OFFSET_DEG` in `backend/app/services/nifc.py`; keep the pair
 * in sync. A caller needs the number to decide which copy to ask for: below
 * this, simplification would be visible on screen, and above it the two copies
 * are indistinguishable and the coarse one is a thirteenth of the bytes.
 */
export const COARSE_TOLERANCE_DEG = 0.0005

// Raw ArcGIS geoJSON feature properties, keyed by the OSM-style field names
// NIFC uses. All optional: NIFC leaves plenty of fields null on fresh incidents.
export interface WildfireProps {
  attr_IncidentName?: string | null
  poly_IncidentName?: string | null
  poly_GISAcres?: number | null
  attr_PercentContained?: number | null
  attr_ModifiedOnDateTime_dt?: number | null
  attr_FireDiscoveryDateTime?: number | null
}

/** Build the API URL for perimeters intersecting `bbox`. Pure, so it's testable. */
export function wildfireQueryUrl(bbox: BBox, detail: FireDetail): string {
  const params = new URLSearchParams({ bbox: bbox.join(','), detail })
  return `${WILDFIRES_URL}?${params.toString()}`
}

/** Is this failure one that retrying makes worse rather than better? */
export function isRateLimited(err: unknown): boolean {
  return (err as OverlayFailure | null)?.rateLimited === true
}

/**
 * Fetch active wildfire perimeters intersecting `bbox`.
 *
 * `signal` lets a stale in-flight request be aborted when the user pans again.
 * A 429 is this client outpacing its own address limit and a 503 is a server
 * that has never managed a fetch from NIFC; both are marked `rateLimited`
 * because in both cases the next thing to do is wait, not ask again.
 */
export async function fetchWildfires(
  bbox: BBox,
  detail: FireDetail,
  signal: AbortSignal,
): Promise<WildfireResponse> {
  const res = await apiFetch(wildfireQueryUrl(bbox, detail), { signal })
  const data = await overlayFeatures<WildfireResponse>(
    res,
    'Wildfire data unavailable. Try again later.',
    'Wildfire data could not be read.',
  )
  // The response also carries `fetched_at`, the age of the server's snapshot.
  // Nothing in the browser reads it: the cache serves an aged snapshot rather
  // than failing, so a visitor's answer no longer hinges on a fetch of their
  // own, and a freshness line on every fire would be noise about an internal
  // detail. It stays in the payload for API callers, who have no other way to
  // know how current an answer is (see docs/API.md). `coverage`, the other
  // foreign member, IS read: useFireProximity tests the analyzed points
  // against it so an empty answer outside the US stops reading as all-clear.
  return data
}

export function formatAcres(acres: number | null | undefined): string {
  if (!isFiniteNumber(acres)) return 'Size not reported'
  if (acres < 1) return '<1 acre'
  return `${grouped(Math.round(acres))} acres`
}

/** The Layers menu's row for the perimeters, which the legend names too. */
export const WILDFIRE_ROW_LABEL = 'Active wildfires'

/**
 * What a card's section opens on for one fire, `Active wildfire: Bolt Creek`:
 * the row's word in the singular, since a section names the one fire at the
 * point where the menu and the legend name the layer (TJ, 2026-11-03).
 */
export const WILDFIRE_SECTION_LABEL = 'Active wildfire'

/** What a card names NIFC as, in a fire section's fine print beside the survey's date. */
export const NIFC_SOURCE = 'NIFC'

/** What a screen reader hears for a fire's link out: the text link it replaced (#738). */
export const FIRE_LINK_LABEL = 'View on NIFC map'

/** A fire's name as NIFC files it under either field, or `Unnamed fire`. */
export function fireName(props: WildfireProps): string {
  return (props.attr_IncidentName || props.poly_IncidentName || '').trim() || 'Unnamed fire'
}
