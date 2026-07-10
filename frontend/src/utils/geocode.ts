// Place lookup for the map search box. Coordinate pairs are parsed locally and
// never touch the network; free-text names resolve through Nominatim, OSM's
// geocoder — keyless like every other API this app calls, and covering every
// named OSM feature (peaks, cities, lakes, rivers, trails…), not just the
// destination types Bluebird can analyze.
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

interface NominatimRow {
  name?: string
  display_name: string
  type?: string
  lat: string
  lon: string
  boundingbox?: [string, string, string, string] // Nominatim order: [S, N, W, E]
}

// Exported for tests — the [S,N,W,E]→[W,S,E,N] bbox reorder is easy to get wrong.
export function placeFromNominatimRow(row: NominatimRow): Place {
  const bb = row.boundingbox
  return {
    label: row.name || row.display_name.split(',')[0].trim(),
    description: row.display_name,
    kind: (row.type ?? '').replace(/_/g, ' '),
    lat: parseFloat(row.lat),
    lon: parseFloat(row.lon),
    bbox: bb
      ? [parseFloat(bb[2]), parseFloat(bb[0]), parseFloat(bb[3]), parseFloat(bb[1])]
      : undefined,
  }
}

export async function searchPlaces(query: string, limit = 5): Promise<Place[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=${limit}&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Nominatim returned ${res.status}`)
  const rows: NominatimRow[] = await res.json()
  return rows.map(placeFromNominatimRow)
}
