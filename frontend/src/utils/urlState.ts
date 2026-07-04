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
  minElevationFt: number | null
  maxElevationFt: number | null
  limit: number
  customCsv: string
}

const DESTINATION_TYPES: DestinationType[] = ['peak', 'trailhead', 'lake', 'custom']
const SORT_OPTIONS: SortBy[] = [
  'precip_total_in',
  'precip_max_in_hr',
  'wind_avg_mph',
  'wind_max_mph',
  'temp_avg_f',
]

// Open-Meteo's forecast endpoint serves roughly the last ~90 days of history
// through ~16 days ahead. Outside that band a saved window returns no data.
export const PAST_LIMIT_DAYS = 90
export const FUTURE_LIMIT_DAYS = 16

const POLY_PRECISION = 5 // ~1 m; keeps the URL short without visible drift
const MS_PER_DAY = 86_400_000

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
 * there's nothing worth sharing (no polygon and no custom CSV) so the address
 * bar stays clean until the user has done something meaningful.
 */
export function encodeState(state: ShareableState): string {
  const hasPolygon = state.polygon !== null && (state.polygon.coordinates[0]?.length ?? 0) >= 3
  const hasCustom = state.destinationType === 'custom' && state.customCsv.trim() !== ''
  if (!hasPolygon && !hasCustom) return ''

  const p = new URLSearchParams()
  p.set('type', state.destinationType)
  p.set('sort', state.sortBy)
  p.set('limit', String(state.limit))
  if (isValidDatetimeLocal(state.startDatetime)) p.set('start', state.startDatetime)
  if (isValidDatetimeLocal(state.endDatetime)) p.set('end', state.endDatetime)
  if (state.minElevationFt !== null) p.set('minel', String(state.minElevationFt))
  if (state.maxElevationFt !== null) p.set('maxel', String(state.maxElevationFt))
  if (hasPolygon && state.polygon) p.set('poly', encodePolygon(state.polygon))
  if (hasCustom) p.set('custom', state.customCsv)

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

  return Object.keys(out).length > 0 ? out : null
}

/**
 * Classify a forecast window against Open-Meteo's servable range. `now` is
 * injected for deterministic testing. Returns 'ok' when any part of the window
 * is servable, 'past' when it ends before the history horizon, and 'future'
 * when it starts beyond the forecast horizon.
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

  if (end < earliest) return 'past'
  if (start > latest) return 'future'
  return 'ok'
}
