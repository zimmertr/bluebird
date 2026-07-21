// Active US wildfire perimeters, fetched straight from the browser against
// NIFC's WFIGS "Interagency Perimeters — Current" ArcGIS feature service. It's
// free, keyless, and CORS-open (Access-Control-Allow-Origin: *), so — like the
// app's other data sources — no backend proxy or API key is involved.
//
// Coverage is US-only: this is the authoritative national wildfire perimeter
// dataset (updated ~every 5 min, CC-BY 3.0). Outside the US a query simply
// returns no features, which the map renders as an empty (invisible) overlay.
import type { FeatureCollection } from 'geojson'

// NIFC WFIGS Interagency Fire Perimeters, "Current" view, layer 0. The service
// already scopes this layer to incidents not yet declared contained/controlled/
// out, so no extra recency filter is needed here.
const NIFC_QUERY_URL =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/' +
  'WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query'

// The `attr_` fields come from the joined IRWIN incident record; the `poly_`
// fields describe the perimeter polygon itself. We request both names for the
// values that live in either place and coalesce at render time.
const OUT_FIELDS = [
  'attr_IncidentName',
  'poly_IncidentName',
  'poly_GISAcres',
  'attr_PercentContained',
  'attr_ModifiedOnDateTime_dt',
  'attr_FireDiscoveryDateTime',
].join(',')

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

// Raw ArcGIS geoJSON feature properties, keyed by the OSM-style field names
// above. All optional: NIFC leaves plenty of fields null on fresh incidents.
export interface WildfireProps {
  attr_IncidentName?: string | null
  poly_IncidentName?: string | null
  poly_GISAcres?: number | null
  attr_PercentContained?: number | null
  attr_ModifiedOnDateTime_dt?: number | null
  attr_FireDiscoveryDateTime?: number | null
}

/**
 * Build the ArcGIS REST query URL for wildfire perimeters intersecting `bbox`.
 * `simplifyTol` (degrees) maps to maxAllowableOffset so zoomed-out queries return
 * generalized geometry instead of full-resolution perimeters — a big payload win
 * when the whole country is in view. Pure/deterministic so it's unit-testable.
 */
export function wildfireQueryUrl(bbox: BBox, simplifyTol?: number): string {
  const [w, s, e, n] = bbox
  const params = new URLSearchParams({
    where: "attr_IncidentTypeCategory='WF'", // wildfires only (exclude prescribed burns)
    geometry: `${w},${s},${e},${n}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: OUT_FIELDS,
    returnGeometry: 'true',
    outSR: '4326',
    geometryPrecision: '5', // ~1 m; trims coordinate noise from the payload
    f: 'geojson',
  })
  if (simplifyTol && simplifyTol > 0) params.set('maxAllowableOffset', String(simplifyTol))
  return `${NIFC_QUERY_URL}?${params.toString()}`
}

/**
 * Fetch active wildfire perimeters intersecting `bbox` as a GeoJSON
 * FeatureCollection. `signal` lets a stale in-flight request be aborted when the
 * user pans again. ArcGIS can return HTTP 200 with an `{error}` body, so the
 * shape is validated before it's handed to MapLibre.
 */
export async function fetchWildfires(
  bbox: BBox,
  simplifyTol: number | undefined,
  signal: AbortSignal,
): Promise<FeatureCollection> {
  const res = await fetch(wildfireQueryUrl(bbox, simplifyTol), { signal })
  if (!res.ok) throw new Error(`NIFC request failed: ${res.status}`)
  const data = await res.json()
  if (!data || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
    throw new Error('Unexpected NIFC response shape')
  }
  return data as FeatureCollection
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

// Epoch-ms → localized "Updated <date>, <time>" line, or null to omit it. Kept
// timezone-tolerant (falls back to a bare ISO date) so it never throws.
export function formatUpdated(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  try {
    return `Updated ${d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
  } catch {
    return `Updated ${d.toISOString().slice(0, 10)}`
  }
}

/**
 * Popup markup for a hovered/tapped wildfire perimeter. Inline styles mirror the
 * results-marker popup in MapView so the two read consistently. Takes the raw
 * ArcGIS properties bag and degrades one line at a time as fields go missing.
 */
export function wildfirePopupHtml(props: WildfireProps, nifcUrl: string): string {
  const name =
    (props.attr_IncidentName || props.poly_IncidentName || '').trim() || 'Unnamed fire'
  const updated = formatUpdated(props.attr_ModifiedOnDateTime_dt)
  return `<div style="font-family:sans-serif;font-size:13px;line-height:1.5">
      <strong>🔥 ${escapeHtml(name)}</strong>
      <br>${formatAcres(props.poly_GISAcres)} · ${formatContainment(props.attr_PercentContained)}
      ${updated ? `<br><span style="color:#94a3b8">${escapeHtml(updated)}</span>` : ''}
      <br><a href="${nifcUrl}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;text-decoration:none">View on NIFC map ↗</a>
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
