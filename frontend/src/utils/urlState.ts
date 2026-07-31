// Serialize the full set of analysis inputs to/from the URL query string so a
// Bluebird session can be copied out of the address bar and reopened later.
// These functions are intentionally pure (no React, no DOM) so they're trivial
// to unit-test — App.tsx owns the thin glue that reads/writes location.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { AnalysisMode, GeoPolygon, DiscoveryType, SortBy } from '../types'
import { RANKING_KEYS } from '../metrics'
import { Place } from './geocode'

// Fields that fully describe an analysis. Results are deliberately excluded —
// they're re-fetched fresh so a shared link never replays stale forecasts.
export interface ShareableState {
  polygon: GeoPolygon | null
  destinationType: DiscoveryType
  startDatetime: string // datetime-local, e.g. "2026-07-04T10:30"
  endDatetime: string
  // Forecast-time mode. 'window' analyzes start–end above; 'at' analyzes the
  // single hour of atDatetime; 'now' samples the Analyze click time. Only the
  // selected mode's inputs go in the URL: a shared "now" link deliberately
  // omits timestamps so it re-samples at open time, and a window link omits
  // the unused atDatetime (and vice versa).
  mode: AnalysisMode
  atDatetime: string // datetime-local, only meaningful when mode === 'at'
  sortBy: SortBy
  sortDesc: boolean // false = lowest first (the historical behavior)
  minElevationFt: number | null
  maxElevationFt: number | null
  limit: number
  customCsv: string
  showWildfires: boolean // live NIFC map overlay; not part of the analysis request
  // Searched places pinned to the results table. Persisted so a refreshed or
  // shared link repopulates them (and refetches their forecasts). Only the
  // fields needed to recreate the pin and its identity link are stored.
  pins: Place[]
}

const DISCOVERY_TYPES: DiscoveryType[] = ['peak', 'trailhead', 'lake']

// Sort keys from before the metric × direction redesign, when aggregation
// variants were individually rankable. Old shared links fall back to their
// metric's representative key rather than being dropped.
const LEGACY_SORT_MAP: Record<string, SortBy> = {
  precip_max_in_hr: 'precip_total_in',
  wind_max_mph: 'wind_avg_mph',
  temp_min_f: 'temp_avg_f',
  temp_max_f: 'temp_avg_f',
  aqi_max: 'aqi_avg',
}

// Open-Meteo's forecast endpoint serves roughly the last ~90 days of history
// through ~16 days ahead. Outside that band a saved window returns no data.
export const PAST_LIMIT_DAYS = 90
export const FUTURE_LIMIT_DAYS = 16

// The air-quality endpoint's CAMS model only publishes ~5 days of forecast —
// well short of the 16-day weather horizon — so AQI needs its own warning.
export const AQI_LIMIT_DAYS = 5

const POLY_PRECISION = 5 // ~1 m; keeps the URL short without visible drift
const MS_PER_DAY = 86_400_000

// Control defaults — must mirror the initial useState values in App.tsx. Used to
// decide whether the user has changed anything worth persisting to the URL.
const DEFAULT_SORT: SortBy = 'precip_total_in'
const DEFAULT_TYPE: DiscoveryType = 'peak'
const DEFAULT_LIMIT = 200

// Hold a row count inside what the running service will accept. The ceiling is
// a deployment's answer, not this module's: /api/capabilities publishes it and
// useCapabilities carries it, so decodeState below deliberately has no opinion
// about how large a limit is too large (issue #191). Named rather than spelled
// inline so the restore path, the knob, and the capabilities sync cannot drift
// into three different ideas of the same clamp.
export function clampLimit(value: number, maxLimit: number): number {
  return Math.max(1, Math.min(maxLimit, value))
}

function round(n: number): number {
  const f = 10 ** POLY_PRECISION
  return Math.round(n * f) / f
}

// Encode a polygon's ring as "lng,lat;lng,lat;..." matching GeoJSON [lng,lat]
// order. The closing vertex (equal to the first) is dropped and re-added on
// decode, so it never bloats the URL.
function encodePolygon(polygon: GeoPolygon): string {
  const ring = polygon.coordinates[0] ?? []
  const pts = ring.slice()
  if (pts.length > 1) {
    const first = pts[0]
    const last = pts[pts.length - 1]
    if (first[0] === last[0] && first[1] === last[1]) pts.pop()
  }
  return pts.map(([lng, lat]) => `${round(lng)},${round(lat)}`).join(';')
}

function decodePolygon(raw: string): GeoPolygon | null {
  const pts: number[][] = []
  for (const pair of raw.split(';')) {
    const [lngStr, latStr] = pair.split(',')
    const lng = Number(lngStr)
    const lat = Number(latStr)
    if (
      lngStr === undefined ||
      latStr === undefined ||
      !Number.isFinite(lng) ||
      !Number.isFinite(lat)
    ) {
      return null
    }
    pts.push([lng, lat])
  }
  if (pts.length < 3) return null
  return { type: 'Polygon', coordinates: [[...pts, pts[0]]] }
}

// Encode pinned places as "lat,lon,kind,elev,osmId,label" per pin, ';'-joined.
// Each field is percent-encoded so a label containing ',' or ';' can't collide
// with the delimiters (URLSearchParams decodes the outer layer on read, then
// decodePins splits and unescapes each field). Coords are rounded like the
// polygon ring to keep the URL short. Missing elevation/osmId encode as empty.
function encodePins(places: Place[]): string {
  return places
    .map((p) => {
      const fields = [
        String(round(p.lon)),
        String(round(p.lat)),
        p.kind,
        p.elevationFt === undefined ? '' : String(p.elevationFt),
        p.osmId ?? '',
        p.label,
      ]
      return fields.map((f) => encodeURIComponent(f)).join(',')
    })
    .join(';')
}

// Parse the pins param back into Places. Tolerant like the rest of decodeState:
// an entry without a finite lon/lat is skipped rather than failing the whole
// list. `description`/`bbox` aren't persisted — a restored pin doesn't need the
// disambiguation line or the fly-to extent — so they come back empty/absent.
function decodePins(raw: string): Place[] {
  const out: Place[] = []
  for (const entry of raw.split(';')) {
    const parts = entry.split(',').map((f) => decodeURIComponent(f))
    if (parts.length < 6) continue
    const [lonStr, latStr, kind, elevStr, osmId, label] = parts
    const lon = Number(lonStr)
    const lat = Number(latStr)
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
    const elev = Number(elevStr)
    out.push({
      label: label || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
      description: '',
      kind,
      lat,
      lon,
      ...(elevStr !== '' && Number.isFinite(elev) ? { elevationFt: elev } : {}),
      ...(osmId ? { osmId } : {}),
    })
  }
  return out
}

// datetime-local strings only — reject anything Date can't parse so a garbled
// value doesn't silently become "Invalid Date" downstream.
function isValidDatetimeLocal(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
}

/**
 * Build a query string ("?"-less) capturing the shareable state. Returns "" when
 * the user hasn't provided anything worth persisting, so the address bar stays
 * clean on a pristine load.
 *
 * The forecast window is intentionally excluded from the "worth sharing" test:
 * both dates are pre-filled to "now", so treating a filled window as meaningful
 * would write timestamps into the URL (and rewrite them on every reload) before
 * the user has done anything. Once any other signal is present, the window
 * rides along and stays live.
 */
export function encodeState(state: ShareableState): string {
  const hasPolygon = state.polygon !== null && (state.polygon.coordinates[0]?.length ?? 0) >= 3
  const hasCustom = state.customCsv.trim() !== ''
  const hasConstraint = state.minElevationFt !== null || state.maxElevationFt !== null
  const hasPins = state.pins.length > 0
  const nonDefaultControls =
    state.sortBy !== DEFAULT_SORT ||
    state.sortDesc ||
    state.limit !== DEFAULT_LIMIT ||
    state.destinationType !== DEFAULT_TYPE ||
    state.showWildfires ||
    state.mode !== 'now'
  if (!hasPolygon && !hasCustom && !hasConstraint && !hasPins && !nonDefaultControls)
    return ''

  const p = new URLSearchParams()
  p.set('type', state.destinationType)
  p.set('sort', state.sortBy)
  if (state.sortDesc) p.set('desc', '1')
  p.set('limit', String(state.limit))
  // Always written, like type/sort/limit above, even at its default. Links used
  // to leave `mode` out for the then-default window mode and let the reader
  // infer it; that made every shared link hostage to the app's current default.
  // Spelling it out costs one param and makes the link self-describing.
  p.set('mode', state.mode)
  if (state.mode === 'at') {
    if (isValidDatetimeLocal(state.atDatetime)) p.set('at', state.atDatetime)
  } else if (state.mode === 'window') {
    if (isValidDatetimeLocal(state.startDatetime)) p.set('start', state.startDatetime)
    if (isValidDatetimeLocal(state.endDatetime)) p.set('end', state.endDatetime)
  }
  if (state.minElevationFt !== null) p.set('minel', String(state.minElevationFt))
  if (state.maxElevationFt !== null) p.set('maxel', String(state.maxElevationFt))
  if (hasPolygon && state.polygon) p.set('poly', encodePolygon(state.polygon))
  // A 100-row CSV is ~13 KB raw; compressing keeps the shared link ~1-2 KB (and off
  // Firefox's address-bar / ingress limits). Only this field is opaque — every other
  // param stays plain text and hand-editable. Written under a distinct `customz` key so
  // decode can tell it apart from legacy raw `custom=` links (see decodeState).
  if (hasCustom) p.set('customz', compressToEncodedURIComponent(state.customCsv))
  if (state.showWildfires) p.set('fires', '1')
  if (hasPins) p.set('pins', encodePins(state.pins))

  return p.toString()
}

/**
 * Parse a location.search string back into a partial state. Tolerant by design:
 * unknown or malformed values are dropped rather than throwing, so a user
 * pasting a truncated or hand-edited link still gets whatever survived. Returns
 * null when nothing usable was found.
 */
export function decodeState(search: string): Partial<ShareableState> | null {
  let params: URLSearchParams
  try {
    params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  } catch {
    return null
  }

  const out: Partial<ShareableState> = {}

  // Legacy links from when Custom (CSV) was a mode carry type=custom; the CSV
  // itself restores below via customz/custom, and the type picker just falls
  // back to its default.
  const type = params.get('type')
  if (type && DISCOVERY_TYPES.includes(type as DiscoveryType)) {
    out.destinationType = type as DiscoveryType
  }

  const sort = params.get('sort')
  if (sort && (RANKING_KEYS as readonly string[]).includes(sort)) out.sortBy = sort as SortBy
  else if (sort && sort in LEGACY_SORT_MAP) out.sortBy = LEGACY_SORT_MAP[sort]

  if (params.get('desc') === '1') out.sortDesc = true

  // Shape only, no ceiling: a link asking for more rows than this deployment
  // allows gets clamped down by the caller, never discarded. Dropping it here
  // is what made a shared `limit=500` open silently at the default instead of
  // at the maximum (issue #191), and the 200 that used to live here was a copy
  // of a cap that moved in #181.
  const limit = params.get('limit')
  if (limit !== null) {
    const n = Number(limit)
    if (Number.isInteger(n) && n >= 1) out.limit = n
  }

  const start = params.get('start')
  if (start && isValidDatetimeLocal(start)) out.startDatetime = start
  const end = params.get('end')
  if (end && isValidDatetimeLocal(end)) out.endDatetime = end

  const mode = params.get('mode')
  if (mode === 'now' || mode === 'at' || mode === 'window') out.mode = mode
  // Links minted while the multi-hour window was the default carry no `mode` at
  // all — the bare start/end pair was the window. Now that "now" is the default,
  // those links would silently restore as a current-conditions snapshot, so the
  // dates themselves stand in for the missing mode. Keyed off the *parsed*
  // dates above, not the raw params: a malformed date is dropped, and a dropped
  // date must not imply a mode.
  else if (out.startDatetime !== undefined || out.endDatetime !== undefined) out.mode = 'window'
  const at = params.get('at')
  if (at && isValidDatetimeLocal(at)) out.atDatetime = at

  const minel = params.get('minel')
  if (minel !== null) {
    const n = Number(minel)
    if (Number.isFinite(n)) out.minElevationFt = n
  }
  const maxel = params.get('maxel')
  if (maxel !== null) {
    const n = Number(maxel)
    if (Number.isFinite(n)) out.maxElevationFt = n
  }

  const poly = params.get('poly')
  if (poly) {
    const decoded = decodePolygon(poly)
    if (decoded) out.polygon = decoded
  }

  // Prefer the compressed field; fall back to the legacy raw `custom=` so links shared
  // before compression still open. decompress returns null on a garbled value — drop it.
  const customz = params.get('customz')
  if (customz) {
    const decoded = decompressFromEncodedURIComponent(customz)
    if (decoded) out.customCsv = decoded
  } else {
    const custom = params.get('custom')
    if (custom) out.customCsv = custom
  }

  if (params.get('fires') === '1') out.showWildfires = true

  const pins = params.get('pins')
  if (pins) {
    const decoded = decodePins(pins)
    if (decoded.length > 0) out.pins = decoded
  }

  return Object.keys(out).length > 0 ? out : null
}

/**
 * Classify a forecast window against Open-Meteo's servable range. `now` is
 * injected for deterministic testing. The whole window must fit inside the
 * servable band: Open-Meteo rejects requests whose dates fall outside it, so
 * even a partial overhang would fail upstream. Returns 'order' when the end
 * is before the start (the backend rejects this outright), 'equal' when the
 * window has zero length (the point-in-time modes own that case), 'past' when
 * the window starts before the history horizon, and 'future' when it ends
 * beyond the forecast horizon.
 */
export function classifyWindow(
  startDatetime: string,
  endDatetime: string,
  now: Date,
): 'ok' | 'order' | 'equal' | 'past' | 'future' {
  if (!isValidDatetimeLocal(startDatetime) || !isValidDatetimeLocal(endDatetime)) {
    return 'ok' // incomplete window — nothing to warn about yet
  }
  const start = new Date(startDatetime).getTime()
  const end = new Date(endDatetime).getTime()
  const earliest = now.getTime() - PAST_LIMIT_DAYS * MS_PER_DAY
  const latest = now.getTime() + FUTURE_LIMIT_DAYS * MS_PER_DAY

  // A reversed or zero-length window is a user error, not a horizon problem —
  // flag those first so the message is about the dates, not the servable
  // range. Equal gets its own status (not 'order') so the warning can point
  // at Current Conditions / Future Day/Time instead of "end must be after
  // start", which would read as pedantry when the fix is a different mode.
  if (end < start) return 'order'
  if (end === start) return 'equal'
  if (start < earliest) return 'past'
  if (end > latest) return 'future'
  return 'ok'
}

/**
 * Classify a single point-in-time moment ("Future Day/Time") against the same
 * servable range — the point-mode counterpart of classifyWindow, with no
 * ordering concept. Permissive about the recent past on purpose: Open-Meteo
 * serves history, so "what was it like at 6am" works even though the UI
 * labels the mode Future.
 */
export function classifyMoment(datetime: string, now: Date): 'ok' | 'past' | 'future' {
  if (!isValidDatetimeLocal(datetime)) {
    return 'ok' // nothing picked yet — nothing to warn about
  }
  const t = new Date(datetime).getTime()
  if (t < now.getTime() - PAST_LIMIT_DAYS * MS_PER_DAY) return 'past'
  if (t > now.getTime() + FUTURE_LIMIT_DAYS * MS_PER_DAY) return 'future'
  return 'ok'
}

/**
 * Window for a searched point's pinned forecast, as ISO instants. Uses the
 * panel's window when it's complete, ordered, and inside the servable range —
 * keeping the pinned row comparable with an analysis run from the same knobs.
 * Otherwise (fresh session with End unset, or an unusable window) it falls
 * back to the next hour from `now`: "conditions right now".
 */
export function resolveSearchWindow(
  startDatetime: string,
  endDatetime: string,
  now: Date,
): { start: string; end: string } {
  if (isValidDatetimeLocal(startDatetime) && isValidDatetimeLocal(endDatetime)) {
    const start = new Date(startDatetime)
    const end = new Date(endDatetime)
    // An equal window classifies as 'equal' (not 'ok') now that the point
    // modes own zero-length analyses, so it falls through to the "conditions
    // right now" default below — same hour the backend would have sampled.
    if (start < end && classifyWindow(startDatetime, endDatetime, now) === 'ok') {
      return { start: start.toISOString(), end: end.toISOString() }
    }
  }
  return {
    start: now.toISOString(),
    end: new Date(now.getTime() + 3_600_000).toISOString(),
  }
}

/**
 * Classify how much of a forecast window the ~5-day air-quality horizon covers.
 * 'full' means AQI data should span the whole window, 'partial' means only its
 * start, 'none' means the window begins beyond the horizon entirely. Purely
 * informational — analysis still runs, with missing AQI rendered as "—".
 */
export function classifyAqiCoverage(
  startDatetime: string,
  endDatetime: string,
  now: Date,
): 'full' | 'partial' | 'none' {
  if (!isValidDatetimeLocal(startDatetime) || !isValidDatetimeLocal(endDatetime)) {
    return 'full' // incomplete window — nothing to warn about yet
  }
  const start = new Date(startDatetime).getTime()
  const end = new Date(endDatetime).getTime()
  const horizon = now.getTime() + AQI_LIMIT_DAYS * MS_PER_DAY

  if (start > horizon) return 'none'
  if (end > horizon) return 'partial'
  return 'full'
}
