// Place lookup for the map search box. Coordinate pairs are parsed locally and
// never touch the network; free-text names resolve through Nominatim, OSM's
// geocoder — keyless like every other API this app calls, and covering every
// named OSM feature (peaks, cities, lakes, rivers, trails…), not just the
// destination types Bluebird can analyze. Nominatim is reached via the
// backend's /api/geocode proxy so queries appear in server logs and the
// request carries the identifying User-Agent Nominatim's policy asks for
// (browsers can't set one). The row→Place mapping stays here.
//
// Nominatim usage policy (operations.osmfoundation.org/policies/nominatim):
// no autocomplete and ≤1 req/s — both satisfied by searching only on Enter.

export interface Place {
  label: string // short name for the pin and input ("Mount Whitney")
  description: string // full disambiguation line from Nominatim
  kind: string // OSM feature type — "peak", "city", "river"… ("" when unknown)
  lat: number
  lon: number
  bbox?: [number, number, number, number] // feature extent as [W, S, E, N]
  // From the OSM `ele` tag (via Nominatim extratags) — the same source the
  // analysis rows use, so a pinned peak shows its true summit elevation.
  // Absent for features without the tag (cities, coordinates…).
  elevationFt?: number
  // OSM object ref in the backend's osm_id format ("node/944865772"), so a
  // pinned place can link to the same exact object page as an analyzed row.
  // Absent for locally parsed coordinates.
  osmId?: string
}

// Searched features that should link like an analyzed peak row — Peakbagger
// covers volcanos too. `kind` has already had underscores humanized away.
const PEAK_KINDS = new Set(['peak', 'volcano'])

export function isPeakKind(kind: string): boolean {
  return PEAK_KINDS.has(kind)
}

// "36.57862, -118.29107" · "(36.57862, -118.29107)" · "36.57862 -118.29107"
const COORD_RE = /^\(?\s*(-?\d{1,2}(?:\.\d+)?)\s*(?:,|\s)\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?$/

export function parseCoordinates(input: string): { lat: number; lon: number } | null {
  const m = input.trim().match(COORD_RE)
  if (!m) return null
  const lat = parseFloat(m[1])
  const lon = parseFloat(m[2])
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

const MILES_PER_DEG_LAT = 69.05
const MILES_PER_DEG_LON_EQUATOR = 69.17

// Bounds guaranteeing at least `minDiameterMiles` of view around the place,
// grown to the feature's own bounding box when that's larger — so a peak gets
// the minimum view while a city, park, or river is framed whole.
export function boundsAround(
  place: Pick<Place, 'lat' | 'lon' | 'bbox'>,
  minDiameterMiles: number,
): [[number, number], [number, number]] {
  const dLat = minDiameterMiles / 2 / MILES_PER_DEG_LAT
  // cos(lat) clamped so polar coordinates can't blow the width up to infinity
  const latScale = Math.max(Math.cos((place.lat * Math.PI) / 180), 0.01)
  const dLon = minDiameterMiles / 2 / (MILES_PER_DEG_LON_EQUATOR * latScale)
  const [w, s, e, n] = place.bbox ?? [place.lon, place.lat, place.lon, place.lat]
  return [
    [Math.min(w, place.lon - dLon), Math.min(s, place.lat - dLat)],
    [Math.max(e, place.lon + dLon), Math.max(n, place.lat + dLat)],
  ]
}

// Bounds enveloping every point, with each axis grown (symmetrically, so the
// centroid stays put) to at least `minDiameterMiles` — a one-row CSV or a tight
// cluster frames a usable view instead of a max-zoom dive, while a spread-out
// list is simply shown whole. Longitude scaling and the polar cos() clamp match
// boundsAround. Returns null for an empty list. Assumes the points don't
// straddle the antimeridian; a list that does (Aleutians) merely over-zooms out.
export function boundsForPoints(
  points: { latitude: number; longitude: number }[],
  minDiameterMiles: number,
): [[number, number], [number, number]] | null {
  if (points.length === 0) return null
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const p of points) {
    if (p.longitude < w) w = p.longitude
    if (p.longitude > e) e = p.longitude
    if (p.latitude < s) s = p.latitude
    if (p.latitude > n) n = p.latitude
  }
  const minDLat = minDiameterMiles / MILES_PER_DEG_LAT
  const latScale = Math.max(Math.cos((((s + n) / 2) * Math.PI) / 180), 0.01)
  const minDLon = minDiameterMiles / (MILES_PER_DEG_LON_EQUATOR * latScale)
  if (n - s < minDLat) {
    const pad = (minDLat - (n - s)) / 2
    s -= pad
    n += pad
  }
  if (e - w < minDLon) {
    const pad = (minDLon - (e - w)) / 2
    w -= pad
    e += pad
  }
  return [
    [w, s],
    [e, n],
  ]
}

interface NominatimRow {
  name?: string
  display_name: string
  type?: string
  // Nominatim's own answer to "what kind of place", which is the useful
  // one for anywhere administered rather than mapped as a feature.
  addresstype?: string
  osm_type?: string // "node" | "way" | "relation"
  osm_id?: number
  lat: string
  lon: string
  boundingbox?: [string, string, string, string] // Nominatim order: [S, N, W, E]
  extratags?: Record<string, string> | null // raw OSM tags (extratags=1)
}

// OSM `ele` is meters; mirror osm.py's parsing (plain float × 3.28084,
// rounded) so a pinned peak and an Overpass row can't disagree.
function elevationFtFromEle(ele: string | undefined): number | undefined {
  if (!ele) return undefined
  const meters = Number(ele)
  return Number.isFinite(meters) ? Math.round(meters * 3.28084) : undefined
}

/**
 * What to call the thing a search found.
 *
 * Nominatim's `type` is the OSM tag value, which is the right word for a peak
 * or a lake and a bureaucratic one for anywhere people live: a town is a
 * `boundary`/`administrative` relation, so Issaquah came back as
 * "Administrative" once the results table started showing a Type column.
 * `addresstype` is the same row's answer to "what kind of place is this", and
 * for those rows it says "city". Preferred only where `type` is the unhelpful
 * one, so a peak stays a peak.
 */
const BUREAUCRATIC = new Set(['administrative', 'boundary'])

function kindOf(row: NominatimRow): string {
  const raw = (row.type ?? '').trim()
  const better = BUREAUCRATIC.has(raw) ? (row.addresstype ?? '').trim() : ''
  return (better || raw).replace(/_/g, ' ')
}

// Exported for tests — the [S,N,W,E]→[W,S,E,N] bbox reorder is easy to get wrong.
export function placeFromNominatimRow(row: NominatimRow): Place {
  const bb = row.boundingbox
  return {
    label: row.name || row.display_name.split(',')[0].trim(),
    description: row.display_name,
    kind: kindOf(row),
    lat: parseFloat(row.lat),
    lon: parseFloat(row.lon),
    bbox: bb
      ? [parseFloat(bb[2]), parseFloat(bb[0]), parseFloat(bb[3]), parseFloat(bb[1])]
      : undefined,
    elevationFt: elevationFtFromEle(row.extratags?.ele),
    osmId:
      row.osm_type && row.osm_id != null ? `${row.osm_type}/${row.osm_id}` : undefined,
  }
}

export async function searchPlaces(query: string, limit = 5): Promise<Place[]> {
  const url = `/api/geocode?limit=${limit}&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Geocode returned ${res.status}`)
  const rows: NominatimRow[] = await res.json()
  return rows.map(placeFromNominatimRow)
}
