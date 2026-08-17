// Active US wildfire perimeters, read from Bluebird's own `GET /api/wildfires`
// rather than from NIFC directly.
//
// The browser used to query NIFC's ArcGIS feature service itself, which was
// tempting because that service is free, keyless, and CORS-open. The catch is
// that its quota belongs to NIFC's ArcGIS *organization* and is shared by every
// consumer of the public WFIGS dataset, so it empties and refills on traffic
// Bluebird has no part in. Fetches failed at random, which is what the
// "Wildfire check unavailable" label was reporting (issue #203). The backend now
// holds one national snapshot and serves it to everyone, so a refusal upstream
// no longer reaches a visitor.
//
// Coverage is still US-only: this is the authoritative national perimeter
// dataset (CC-BY 3.0), and outside the US an empty answer means "not covered",
// not "nothing burning".
import type { FeatureCollection, MultiPolygon } from 'geojson'

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

// Deep-link the NIFC explore map, centered on a clicked/hovered fire. Coords are
// rounded to ~1 m and zoom to 2 dp; order is lat,lon,zoom per the Hub param.
export function nifcFireUrl(lng: number, lat: number, zoom: number): string {
  const z = Math.round(zoom * 100) / 100
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
 * 25-mile threshold displayed at 0.1 mi, so the simplification cannot change
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

/**
 * Which incident a hovered perimeter is, for telling "the cursor moved inside
 * the same fire" from "the cursor crossed into a different one".
 *
 * Identity, not display: it exists so the hover popup can stay anchored while
 * you move toward it and still re-anchor when you cross into a neighbour.
 * Composed of the fields NIFC actually populates rather than an object id,
 * because the properties reaching this point come off a vector tile, where the
 * feature id is not stable across tile boundaries — a fire spanning two tiles
 * would otherwise read as two fires and the popup would jump mid-approach.
 *
 * Named apart from `fireKey` in fireProximity.ts, which keys a *destination* by
 * coordinate. Two different questions, and one name for both invites using
 * whichever is imported.
 */
export function fireIdentity(props: WildfireProps): string {
  const name = (props.attr_IncidentName || props.poly_IncidentName || '').trim()
  return `${name}|${props.poly_GISAcres ?? ''}|${props.attr_ModifiedOnDateTime_dt ?? ''}`
}

/** Build the API URL for perimeters intersecting `bbox`. Pure, so it's testable. */
export function wildfireQueryUrl(bbox: BBox, detail: FireDetail): string {
  const params = new URLSearchParams({ bbox: bbox.join(','), detail })
  return `${WILDFIRES_URL}?${params.toString()}`
}

/** Is this failure one that retrying makes worse rather than better? */
export function isRateLimited(err: unknown): boolean {
  return (err as { rateLimited?: boolean } | null)?.rateLimited === true
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
  const res = await fetch(wildfireQueryUrl(bbox, detail), { signal })
  if (!res.ok) {
    const err = new Error('Wildfire data unavailable. Try again later.') as Error & {
      rateLimited?: boolean
    }
    err.rateLimited = res.status === 429 || res.status === 503
    throw err
  }
  const data = await res.json()
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('Wildfire data could not be read.')
  }
  // The response also carries `fetched_at`, the age of the server's snapshot.
  // Nothing in the browser reads it: the cache serves an aged snapshot rather
  // than failing, so a visitor's answer no longer hinges on a fetch of their
  // own, and a freshness line on every fire would be noise about an internal
  // detail. It stays in the payload for API callers, who have no other way to
  // know how current an answer is (see docs/API.md). `coverage`, the other
  // foreign member, IS read: useFireProximity tests the analyzed points
  // against it so an empty answer outside the US stops reading as all-clear.
  return data as WildfireResponse
}

export function formatAcres(acres: number | null | undefined): string {
  if (acres == null || !Number.isFinite(acres)) return 'Size not reported'
  if (acres < 1) return '<1 acre'
  return `${Math.round(acres).toLocaleString()} acres`
}

export function formatContainment(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return 'Containment not reported'
  return `${Math.round(pct)}% contained`
}

/**
 * Epoch-ms → localized "Last updated: <date>, <time>", or null to omit it.
 *
 * This is NIFC's own timestamp for when the incident's perimeter was last
 * redrawn: a fact about the fire, not about Bluebird. Measured across one
 * national snapshot it ranged from minutes to two weeks old. It sits inside a
 * popup titled with the incident and credited to NIFC, which is what makes
 * "Last updated" read as the fire's date rather than the app's.
 *
 * Kept timezone-tolerant (falls back to a bare ISO date) so it never throws.
 */
export function formatRevised(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  try {
    return `Last updated: ${d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
  } catch {
    return `Last updated: ${d.toISOString().slice(0, 10)}`
  }
}

/**
 * Popup markup for a hovered/tapped wildfire perimeter.
 *
 * Inline styles mirror the results-marker popup in MapView so the two read
 * consistently; this is markup handed to MapLibre's `setHTML`, which the
 * stylesheet-scanned design system in styles.ts cannot reach.
 *
 * Ordered by what the reader came for: which fire, how big and how contained,
 * where to go for more. The date sits last, small and italic, because it
 * qualifies everything above it rather than being another fact in the list —
 * and because it is the one line that is about NIFC's survey rather than about
 * the fire.
 */
export function wildfirePopupHtml(props: WildfireProps, nifcUrl: string): string {
  const name = (props.attr_IncidentName || props.poly_IncidentName || '').trim() || 'Unnamed fire'
  const revised = formatRevised(props.attr_ModifiedOnDateTime_dt)
  return `<div style="font-family:sans-serif;font-size:13px;line-height:1.5">
      <strong>🔥 ${escapeHtml(name)}</strong>
      <br>${formatAcres(props.poly_GISAcres)} · ${formatContainment(props.attr_PercentContained)}
      <br><a href="${nifcUrl}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;text-decoration:none">View on NIFC map ↗</a>
      ${revised ? `<br><span style="color:#94a3b8;font-size:11px;font-style:italic">${escapeHtml(revised)}</span>` : ''}
    </div>`
}

// Incident names are third-party data rendered via setHTML — escape them.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
