// Place lookup for the map search box. Coordinate pairs are parsed locally and
// never touch the network; free-text names resolve through Nominatim, OSM's
// geocoder — keyless like every other API this app calls, and covering every
// named OSM feature (peaks, cities, lakes, rivers, trails…), not just the
// destination types Bluebird Forecast can analyze. Nominatim is reached via the
// backend's /api/geocode proxy so queries appear in server logs and the
// request carries the identifying User-Agent Nominatim's policy asks for
// (browsers can't set one). The row→Place mapping stays here.
//
// Nominatim usage policy (operations.osmfoundation.org/policies/nominatim):
// no autocomplete and ≤1 req/s — both satisfied by searching only on Enter.

import { apiFetch } from './apiFetch'

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

/**
 * The row type a searched or clicked place stands for. The geocoder's own
 * word for the thing, so the table's Type column says what a place is: a
 * searched city reads "City" rather than "Custom", which is a statement about
 * how it got here rather than about what it is. Peaks normalize (OSM says
 * "volcano" for several) because the Peakbagger link and the terrain-height
 * fallback key on that one value. "custom" stays the answer for a place with
 * no kind, which a pasted coordinate genuinely is.
 */
export function placeType(kind: string): string {
  return isPeakKind(kind) ? 'peak' : kind || 'custom'
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
  // The OSM key the row was matched on (`natural`, `place`, `boundary`,
  // `highway`, `landuse`…), which is what says whether a row is a place at
  // all. jsonv2 calls it `category`; the older `json` format said `class`.
  category?: string
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

// OSM `ele` is meters; mirror osm/query.py's parsing (plain float × 3.28084,
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
 *
 * `yes` is the other unhelpful one: OSM's bare "this is one" value, as in
 * `building=yes`, which names no kind at all and showed in the Type column as
 * the word "yes".
 */
const UNHELPFUL = new Set(['administrative', 'boundary', 'yes'])

function kindOf(row: NominatimRow): string {
  const raw = (row.type ?? '').trim()
  const better = UNHELPFUL.has(raw) ? (row.addresstype ?? '').trim() : ''
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

/**
 * The rows a search never lists (#711). A road (`highway`) and a zoning
 * polygon (`landuse`: a residential subdivision, farmland, an industrial
 * estate) each carry a name a reader may type, and neither is a place a
 * reader can stand at. They matter once the view is sent, because the box
 * lets low-scoring rows in: from the app's opening view, `Springfield`
 * answered two `landuse=residential` subdivisions ahead of Springfield,
 * Oregon, and a misspelled `Mt Ranier` answered ten streets that carry the
 * same misspelling (measured 2026-10-16). Dropped rather than sorted last,
 * the maintainer's call on 2026-10-16.
 */
export const NOT_A_PLACE = new Set(['highway', 'landuse'])

/**
 * The map the reader is looking at, as a search sends it: the view's bounds,
 * which bias what Nominatim answers, and its centre, which orders the answer.
 */
export interface SearchView {
  west: number
  south: number
  east: number
  north: number
  lat: number
  lon: number
}

/**
 * The view's bounds as the `viewbox` the pod forwards: rounded OUTWARD to
 * whole degrees and brought inside the globe. Whole degrees because the pod
 * holds an answer per query, limit and box, so a box spelled from the exact
 * view would make every pan a miss (how often a whole-degree one hits was not
 * measured); outward so the box never excludes a corner of what the reader
 * can see. A zoom-14 view a few kilometres wide becomes a one-degree box,
 * which still prefers what is near.
 *
 * MapLibre does not wrap longitude: a view dragged across the antimeridian
 * reports a west past -180 or an east past 180, and one wider than the world
 * a span over 360 (`viewBoxes` in `layerCoverage.ts` meets the same). The
 * west edge is shifted into range by whole turns and the east carried with
 * it. A box that still crosses the antimeridian, or spans the world, becomes
 * the globe in longitude: Nominatim's two-corner box cannot say "across 180",
 * and the whole globe prefers everything, the same as no box. Without this a
 * search from a view over Japan reached by dragging west sent a west of -230,
 * which the pod refused, and every search failed until the reader panned back.
 */
export function viewboxParam(view: Pick<SearchView, 'west' | 'south' | 'east' | 'north'>): string {
  const south = Math.max(-90, Math.floor(view.south))
  const north = Math.min(90, Math.ceil(view.north))
  const turns = Math.floor((view.west + 180) / 360) * 360
  const west = Math.floor(view.west - turns)
  const east = Math.ceil(view.east - turns)
  if (east > 180) return `-180,${south},180,${north}`
  return `${west},${south},${east},${north}`
}

const EARTH_RADIUS_KM = 6371

/** Great-circle distance, which a list spanning continents needs. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/** A row that is a place: not a `NOT_A_PLACE` kind, and somewhere on the globe. */
export function isPlaceRow(row: NominatimRow): boolean {
  return (
    !NOT_A_PLACE.has(row.category ?? '') &&
    Number.isFinite(parseFloat(row.lat)) &&
    Number.isFinite(parseFloat(row.lon))
  )
}

/**
 * The places a search shows, in the order it shows them: the rows that are
 * places, nearest the origin first. Nominatim's own order inside a box is its
 * importance score, and every rural peak and lake carries the same floor
 * score, so from the opening view `Pyramid Peak` in King County stood eighth
 * of ten box-biased rows and `Mirror Lake` in Kittitas County seventh
 * (measured 2026-10-16). Sorted here, by distance from the map's centre, the
 * nearest namesake stood first in every audited query. Nothing reads where
 * the reader is: the centre is the map's, which a press of the locate button
 * has already moved to them.
 */
export function rankPlaces(rows: NominatimRow[], origin: { lat: number; lon: number }): Place[] {
  return rows
    .filter(isPlaceRow)
    .map((row) => placeFromNominatimRow(row))
    .map((place) => ({ place, km: distanceKm(origin, place) }))
    .sort((a, b) => a.km - b.km)
    .map((entry) => entry.place)
}

/**
 * How many places one search asks for: the most `GET /api/geocode` accepts
 * (`le=10` on its `limit`, `routes/geocode.py`), which is a comment's mirror
 * and the root guide's table row 35. Nominatim's usage policy bounds how often
 * a client asks (one request a second, no autocomplete), not how many rows an
 * answer carries, and its API takes up to 40; ten is the pod's ceiling and
 * what a list a few options tall can show with a scroll (#696). It was 5,
 * which hid the place a reader meant behind four namesakes often enough to
 * matter.
 */
export const SEARCH_LIMIT = 10

/**
 * Ask the pod's Nominatim proxy about a place.
 *
 * `signal` before `limit`, because the caller that has a signal is the search
 * box and no caller has ever needed another limit. With a `view` the request
 * carries the view's box and the answer comes back ranked by distance from
 * its centre (`rankPlaces`); without one, which is a search before the map
 * exists, it keeps Nominatim's order. The non-places are dropped either way.
 */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  limit = SEARCH_LIMIT,
  view?: SearchView | null,
): Promise<Place[]> {
  const box = view ? `&viewbox=${viewboxParam(view)}` : ''
  const url = `/api/geocode?limit=${limit}&q=${encodeURIComponent(query)}${box}`
  const res = await apiFetch(url, { headers: { Accept: 'application/json' }, signal })
  if (!res.ok) throw new Error('Place search unavailable. Try again later.')
  const rows: NominatimRow[] = await res.json()
  return view ? rankPlaces(rows, view) : rows.filter(isPlaceRow).map(placeFromNominatimRow)
}
