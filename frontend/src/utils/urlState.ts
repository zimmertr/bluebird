// Serialize the full set of analysis inputs to/from the URL query string so a
// Bluebird session can be copied out of the address bar and reopened later.
// These functions are intentionally pure (no React, no DOM) so they're trivial
// to unit-test — App.tsx owns the thin glue that reads/writes location.
import { GeoPolygon, DestinationType, SortBy } from '../types'

// Fields that fully describe an analysis. Results are deliberately excluded —
// they're re-fetched fresh so a shared link never replays stale forecasts.
export interface ShareableState {
  polygon: GeoPolygon | null
  destinationType: DestinationType
  startDatetime: string // datetime-local, e.g. "2026-07-04T10:30"
  endDatetime: string
  sortBy: SortBy
  sortDesc: boolean // false = lowest first (the historical behavior)
  minElevationFt: number | null
  maxElevationFt: number | null
  limit: number
  customCsv: string
  showWildfires: boolean // live NIFC map overlay; not part of the analysis request
}

const DESTINATION_TYPES: DestinationType[] = ['peak', 'trailhead', 'lake', 'custom']
const SORT_OPTIONS: SortBy[] = ['precip_total_in', 'wind_avg_mph', 'temp_avg_f', 'aqi_avg']

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
const DEFAULT_TYPE: DestinationType = 'peak'
const DEFAULT_LIMIT = 10

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
 * A lone Start date is intentionally excluded from the "worth sharing" test: it's
 * pre-filled to "now", so treating it as meaningful would write a timestamp into
 * the URL (and rewrite it on every reload) before the user has done anything.
 * Once any other signal is present, Start rides along and stays live.
 */
export function encodeState(state: ShareableState): string {
  const hasPolygon = state.polygon !== null && (state.polygon.coordinates[0]?.length ?? 0) >= 3
  const hasCustom = state.destinationType === 'custom' && state.customCsv.trim() !== ''
  const hasWindow = isValidDatetimeLocal(state.endDatetime)
  const hasConstraint = state.minElevationFt !== null || state.maxElevationFt !== null
  const nonDefaultControls =
    state.sortBy !== DEFAULT_SORT ||
    state.sortDesc ||
    state.limit !== DEFAULT_LIMIT ||
    state.destinationType !== DEFAULT_TYPE ||
    state.showWildfires
  if (!hasPolygon && !hasCustom && !hasWindow && !hasConstraint && !nonDefaultControls) return ''

  const p = new URLSearchParams()
  p.set('type', state.destinationType)
  p.set('sort', state.sortBy)
  if (state.sortDesc) p.set('desc', '1')
  p.set('limit', String(state.limit))
  if (isValidDatetimeLocal(state.startDatetime)) p.set('start', state.startDatetime)
  if (isValidDatetimeLocal(state.endDatetime)) p.set('end', state.endDatetime)
  if (state.minElevationFt !== null) p.set('minel', String(state.minElevationFt))
  if (state.maxElevationFt !== null) p.set('maxel', String(state.maxElevationFt))
  if (hasPolygon && state.polygon) p.set('poly', encodePolygon(state.polygon))
  if (hasCustom) p.set('custom', state.customCsv)
  if (state.showWildfires) p.set('fires', '1')

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

  const type = params.get('type')
  if (type && DESTINATION_TYPES.includes(type as DestinationType)) {
    out.destinationType = type as DestinationType
  }

  const sort = params.get('sort')
  if (sort && SORT_OPTIONS.includes(sort as SortBy)) out.sortBy = sort as SortBy
  else if (sort && sort in LEGACY_SORT_MAP) out.sortBy = LEGACY_SORT_MAP[sort]

  if (params.get('desc') === '1') out.sortDesc = true

  const limit = params.get('limit')
  if (limit !== null) {
    const n = Number(limit)
    if (Number.isInteger(n) && n >= 1 && n <= 200) out.limit = n
  }

  const start = params.get('start')
  if (start && isValidDatetimeLocal(start)) out.startDatetime = start
  const end = params.get('end')
  if (end && isValidDatetimeLocal(end)) out.endDatetime = end

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

  const custom = params.get('custom')
  if (custom) out.customCsv = custom

  if (params.get('fires') === '1') out.showWildfires = true

  return Object.keys(out).length > 0 ? out : null
}

/**
 * Classify a forecast window against Open-Meteo's servable range. `now` is
 * injected for deterministic testing. The whole window must fit inside the
 * servable band: Open-Meteo rejects requests whose dates fall outside it, so
 * even a partial overhang would fail upstream. Returns 'past' when the window
 * starts before the history horizon and 'future' when it ends beyond the
 * forecast horizon.
 */
export function classifyWindow(
  startDatetime: string,
  endDatetime: string,
  now: Date,
): 'ok' | 'past' | 'future' {
  if (!isValidDatetimeLocal(startDatetime) || !isValidDatetimeLocal(endDatetime)) {
    return 'ok' // incomplete window — nothing to warn about yet
  }
  const start = new Date(startDatetime).getTime()
  const end = new Date(endDatetime).getTime()
  const earliest = now.getTime() - PAST_LIMIT_DAYS * MS_PER_DAY
  const latest = now.getTime() + FUTURE_LIMIT_DAYS * MS_PER_DAY

  if (start < earliest) return 'past'
  if (end > latest) return 'future'
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
