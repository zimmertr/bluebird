// Serialize the full set of analysis inputs to/from the URL query string so a
// Bluebird session can be copied out of the address bar and reopened later.
// These functions are intentionally pure (no React, no DOM) so they're trivial
// to unit-test — App.tsx owns the thin glue that reads/writes location.
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { GeoPolygon, DiscoveryType, SortBy } from '../types'
import { RANKING_KEYS } from '../metrics'
import { Constraints, NO_CONSTRAINTS, hasConstraints } from './clientAnalyze'
import { GRID_REACH_DEFAULT_FRAC, isGridStyle, type GridStyle } from './forecastGrid'
import {
  DAY_END,
  DAY_START,
  ForecastSelection,
  aqiHorizon,
  bandEnd,
  bandStart,
  isDayKey,
  isTimeOfDay,
  orderDays,
} from './calendar'
import { Place } from './geocode'

// Fields that fully describe an analysis. Results are deliberately excluded —
// they're re-fetched fresh so a shared link never replays stale forecasts.
export interface ShareableState {
  polygon: GeoPolygon | null
  // A set, not a value: the polygon can look for several kinds at once, and
  // an empty set means it looks for nothing.
  destinationTypes: DiscoveryType[]
  includeUnnamedPeaks: boolean
  // What the analysis asks about: the current hour, or a day/day-range with an
  // optional narrowing to a span of hours (#166). One value where there used to
  // be four — a mode plus three parallel sets of timestamps, two of them always
  // dormant — which is most of why the panel section shrank.
  selection: ForecastSelection
  // Which weather model answered. Part of the shared state because it is part
  // of what the numbers mean: the same window over the same peaks gives
  // different answers under different models, so a link that dropped it would
  // reopen showing something other than what was shared.
  forecastModel: string
  sortBy: SortBy
  sortDesc: boolean // false = lowest first (the historical behavior)
  minElevationFt: number | null
  maxElevationFt: number | null
  // The forecast bounds, as one value rather than eight fields, because every
  // surface that touches them treats them as a set (present.ts filters by the
  // whole shape, the panel clears the whole shape).
  constraints: Constraints
  limit: number
  customCsv: string
  // The four live map overlays. Persisted so a shared link reproduces the
  // picture, and deliberately not part of the analysis request: an overlay is
  // drawn beside the ranking, never fed into it. That holds for the forecast
  // grid too, even though it is the one whose toggle costs upstream calls —
  // what it spends on is a picture, and the ranking never reads it.
  showWildfires: boolean
  showRadar: boolean
  showSmoke: boolean
  showGrid: boolean
  // Which of the grid's two drawings. Rides the SAME param as the toggle
  // (`grid=blocks`, `grid=smooth`) rather than taking a second one: it is one
  // control's state, and two params for it would let a link say the layer is
  // off while still carrying a style for it.
  gridStyle: GridStyle
  // The grid's coverage slider position, in [0, 1] of the bar — the
  // kilometres derive from the model's pitch, so the POSITION is what a link
  // must carry to mean the same thing under any model. Its own param
  // (`reach=75`, in percent), written only while the layer is on AND the
  // value is not the default — a link stays as short as what it changed.
  gridReachFrac: number
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

// The forecast bounds' query params, spelled out rather than abbreviated the
// way `minel`/`maxel` were: eight terse keys would be eight guesses in the
// address bar, and readability is what the URL convention buys (#210). The
// param name reads as the control's label, not as the result field it compares
// — `maxaqi` is the AQI ceiling, and which aggregate it reads is the app's
// answer, not something a link should have to encode.
const CONSTRAINT_PARAMS = [
  ['minprecip', 'minPrecipTotalIn'],
  ['maxprecip', 'maxPrecipTotalIn'],
  ['mintemp', 'minTempF'],
  ['maxtemp', 'maxTempF'],
  ['minwind', 'minWindMph'],
  ['maxwind', 'maxWindMph'],
  ['minaqi', 'minAqi'],
  ['maxaqi', 'maxAqi'],
] as const satisfies readonly (readonly [string, keyof Constraints])[]

const POLY_PRECISION = 5 // ~1 m; keeps the URL short without visible drift

// Control defaults — must mirror the initial useState values in App.tsx. Used to
// decide whether the user has changed anything worth persisting to the URL.
const DEFAULT_SORT: SortBy = 'precip_total_in'
// Nothing is checked by default. Discovery is the expensive input and the
// one that needs a polygon, so a fresh session asks for none of it until the
// user says otherwise.
const DEFAULT_TYPES: DiscoveryType[] = []
// Exported because the panel now shows it as a PLACEHOLDER rather than a
// value, so three files needed the same number and two of them were spelling
// it themselves.
export const DEFAULT_LIMIT = 200

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
 * A day selection is user intent and counts as such: someone had to click a day
 * to make one. That is the change the calendar brings to this gate, and it makes
 * it simpler rather than more complicated. The old window was two pre-filled
 * timestamps nobody had chosen, so a filled window could not be read as a
 * signal — treating it as one would have written dates into the address bar,
 * and rewritten them on every reload, before the user did anything at all. The
 * calendar's default is the When toggle's Current arm, which carries no dates
 * to write.
 */
// `defaultForecastModel` is passed in rather than named here because the
// default is the deployment's, published by /api/capabilities. Compiling a copy
// into this module would be the mirrored-constant problem issue #152 exists to
// stop, and it is only needed to answer one question: has the user moved off
// the default, and does this state therefore deserve a URL at all.
export function encodeState(state: ShareableState, defaultForecastModel: string): string {
  const hasPolygon = state.polygon !== null && (state.polygon.coordinates[0]?.length ?? 0) >= 3
  const hasCustom = state.customCsv.trim() !== ''
  const hasConstraint =
    state.minElevationFt !== null ||
    state.maxElevationFt !== null ||
    hasConstraints(state.constraints)
  const hasPins = state.pins.length > 0
  const nonDefaultControls =
    state.sortBy !== DEFAULT_SORT ||
    state.sortDesc ||
    state.limit !== DEFAULT_LIMIT ||
    state.destinationTypes.length !== DEFAULT_TYPES.length ||
    state.includeUnnamedPeaks ||
    state.showWildfires ||
    state.showRadar ||
    state.showSmoke ||
    state.showGrid ||
    state.selection.kind !== 'now' ||
    state.forecastModel !== defaultForecastModel
  if (!hasPolygon && !hasCustom && !hasConstraint && !hasPins && !nonDefaultControls)
    return ''

  const p = new URLSearchParams()
  // Comma-joined and left unencoded: the param stays something you can read
  // and edit in the address bar, which is the convention every readable
  // field here follows.
  if (state.destinationTypes.length > 0) p.set('type', state.destinationTypes.join(','))
  p.set('sort', state.sortBy)
  if (state.sortDesc) p.set('desc', '1')
  p.set('limit', String(state.limit))
  // Always written once the link exists at all, for the same reason `mode` is:
  // the model is part of what the numbers mean, so a link that left it to the
  // reader's default would show something other than what was shared the moment
  // that default moved. The id is Open-Meteo's own (`ecmwf_ifs025`,
  // `gfs_hrrr`), which keeps the param as hand-editable as the rest.
  p.set('model', state.forecastModel)
  // Always written, like type/sort/limit above, even at its default. Links used
  // to leave `mode` out for the then-default window mode and let the reader
  // infer it; that made every shared link hostage to the app's current default.
  // Spelling it out costs one param and makes the link self-describing — which
  // is also why it survives the calendar even though `d1` alone would imply a
  // day selection: a reader should not have to know that.
  p.set('mode', state.selection.kind)
  if (state.selection.kind === 'days') {
    const { startDate, endDate, hours } = state.selection
    // A dateless Dates arm writes mode=days alone: the link reopens on the
    // empty calendar rather than inventing a day the user never picked.
    if (startDate !== null) p.set('d1', startDate)
    // Omitted for a single day, so the common link stays as short as the shape
    // it describes.
    if (endDate !== null && endDate !== startDate) p.set('d2', endDate)
    // Written whenever the narrow-hours control is open, defaults included: the
    // pair is the control's state, not only its effect, and a link that dropped
    // 00:00/23:59 would reopen with the disclosure closed.
    if (hours) {
      p.set('h1', hours.start)
      p.set('h2', hours.end)
    }
  }
  if (state.minElevationFt !== null) p.set('minel', String(state.minElevationFt))
  if (state.maxElevationFt !== null) p.set('maxel', String(state.maxElevationFt))
  for (const [param, key] of CONSTRAINT_PARAMS) {
    const value = state.constraints[key]
    if (value !== null) p.set(param, String(value))
  }
  if (hasPolygon && state.polygon) p.set('poly', encodePolygon(state.polygon))
  // A 100-row CSV is ~13 KB raw; compressing keeps the shared link ~1-2 KB (and off
  // Firefox's address-bar / ingress limits). Only this field is opaque — every other
  // param stays plain text and hand-editable. Written under a distinct `customz` key so
  // decode can tell it apart from legacy raw `custom=` links (see decodeState).
  if (hasCustom) p.set('customz', compressToEncodedURIComponent(state.customCsv))
  if (state.showWildfires) p.set('fires', '1')
  if (state.showRadar) p.set('radar', '1')
  if (state.showSmoke) p.set('smoke', '1')
  // The value names the style rather than being a bare `1`, which keeps the
  // link hand-editable and self-describing: `grid=smooth` says what it will
  // draw. One param rather than two, because a layer that is off has no style
  // to carry and a link should not be able to say otherwise.
  if (state.showGrid) {
    p.set('grid', state.gridStyle)
    if (state.gridReachFrac !== GRID_REACH_DEFAULT_FRAC) {
      p.set('reach', String(Math.round(state.gridReachFrac * 100)))
    }
  }
  if (state.includeUnnamedPeaks) p.set('unnamed', '1')
  if (hasPins) p.set('pins', encodePins(state.pins))

  return p.toString()
}

/**
 * Read the forecast selection out of a query string, translating the three
 * pre-calendar shapes forward.
 *
 * The old readers are kept rather than replaced, the same way `custom` survives
 * alongside `customz`: every link ever shared carries one of them, and a link
 * that silently restored as the wrong window would be worse than one that
 * failed. What each translates to:
 *
 * - `mode=now` is unchanged, and the only shape that already fit.
 * - `mode=at&at=<moment>` becomes that single day narrowed to that one hour.
 *   Equal hours are how a point sample travels: the backend floors them to the
 *   hour containing the moment, which is exactly what `at` meant.
 * - `mode=window&start&end` becomes the day range the window spanned, keeping
 *   its times as the narrow-hours refinement rather than rounding them away. A
 *   window that already ran midnight to 23:59 restores as plain whole days.
 * - A bare `start`/`end` pair with no `mode` at all predates `mode` being
 *   written; it read as a window then and still does. One timestamp alone
 *   carries no span, so it restores as that whole day rather than a guess.
 */
function decodeSelection(params: URLSearchParams): ForecastSelection | undefined {
  const mode = params.get('mode')
  if (mode === 'now') return { kind: 'now' }

  const d1 = params.get('d1')
  if (d1 && isDayKey(d1)) {
    const d2 = params.get('d2')
    const days = orderDays(d1, d2 && isDayKey(d2) ? d2 : d1)
    const h1 = params.get('h1')
    const h2 = params.get('h2')
    // Both or neither: one hour without the other describes no window, and
    // filling the missing end from a default would invent a span.
    const narrowed = h1 !== null && h2 !== null && isTimeOfDay(h1) && isTimeOfDay(h2)
    return { kind: 'days', ...days, ...(narrowed ? { hours: { start: h1, end: h2 } } : {}) }
  }

  // mode=days with no valid d1: the empty Dates arm, hours refinement kept.
  if (mode === 'days') {
    const h1 = params.get('h1')
    const h2 = params.get('h2')
    const narrowed = h1 !== null && h2 !== null && isTimeOfDay(h1) && isTimeOfDay(h2)
    return {
      kind: 'days',
      startDate: null,
      endDate: null,
      ...(narrowed ? { hours: { start: h1, end: h2 } } : {}),
    }
  }

  const at = params.get('at')
  if (mode === 'at' && at && isValidDatetimeLocal(at)) {
    const [date, time] = at.split('T')
    return { kind: 'days', startDate: date, endDate: date, hours: { start: time, end: time } }
  }

  const start = params.get('start')
  const end = params.get('end')
  const from = start && isValidDatetimeLocal(start) ? start : null
  const to = end && isValidDatetimeLocal(end) ? end : null
  if (from === null && to === null) return undefined
  const [startDate, startTime] = (from ?? (to as string)).split('T')
  const [endDate, endTime] = (to ?? (from as string)).split('T')
  const days = orderDays(startDate, endDate)
  const wholeDays =
    (from === null || to === null) || (startTime === DAY_START && endTime === DAY_END)
  return {
    kind: 'days',
    ...days,
    ...(wholeDays ? {} : { hours: { start: startTime, end: endTime } }),
  }
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

  // `type=peak,lake`. Unknown names are dropped rather than failing the whole
  // link — an old `type=custom` link, or a type a future deployment stopped
  // publishing, restores as "no types checked" and the rest of the link still
  // works.
  const type = params.get('type')
  if (type) {
    const types = type
      .split(',')
      .map((t) => t.trim())
      .filter((t): t is DiscoveryType => DISCOVERY_TYPES.includes(t as DiscoveryType))
    if (types.length > 0) out.destinationTypes = [...new Set(types)]
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

  const selection = decodeSelection(params)
  if (selection) out.selection = selection

  // Shape only, no membership check: the accepted set is the deployment's, from
  // /api/capabilities, and this module has no access to it. A link naming a
  // model this deployment does not offer is settled by the caller, which has
  // the list. Absent is the interesting case and it means one thing — every
  // link shared before the picker existed was computed under Open-Meteo's
  // `best_match` blend, and inherits the current default instead, which is a
  // release note rather than a migration.
  const model = params.get('model')
  if (model && /^[a-z0-9_]+$/.test(model)) out.forecastModel = model

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

  // Written only when at least one bound survived, so a link carrying none
  // leaves `constraints` undefined and App keeps its own default rather than
  // being handed an all-null object that means the same thing.
  const constraints = { ...NO_CONSTRAINTS }
  for (const [param, key] of CONSTRAINT_PARAMS) {
    const raw = params.get(param)
    if (raw === null) continue
    const n = Number(raw)
    if (Number.isFinite(n)) constraints[key] = n
  }
  if (hasConstraints(constraints)) out.constraints = constraints

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
  if (params.get('radar') === '1') out.showRadar = true
  if (params.get('smoke') === '1') out.showSmoke = true
  const grid = params.get('grid')
  if (grid !== null && isGridStyle(grid)) {
    out.showGrid = true
    out.gridStyle = grid
    // Clamped to the bar rather than trusted: the param is hand-editable,
    // and a position outside it would draw a control that cannot show the
    // value it is applying. Presence checked before Number, because
    // Number(null) is 0 — a legal position here.
    const reachParam = params.get('reach')
    if (reachParam !== null) {
      const reach = Number(reachParam)
      if (Number.isFinite(reach)) {
        out.gridReachFrac = Math.min(100, Math.max(0, reach)) / 100
      }
    }
  }
  if (params.get('unnamed') === '1') out.includeUnnamedPeaks = true

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
 * even a partial overhang would fail upstream. Returns 'order' when the end is
 * before the start, 'past' when the window starts before the history horizon,
 * and 'future' when it ends beyond the forecast horizon.
 *
 * Bounded by whole days rather than by an instant `now + N * 24h`, because that
 * is the granularity of everything it is standing in for: the API takes
 * `start_date`/`end_date`, and the calendar offers whole days. Measuring from the
 * instant made the last day of the band unusable — a window ending at its 23:59
 * always overshot `now + 15 days` unless you happened to be looking at 23:59 —
 * so the calendar's own far edge failed the check that is supposed to guard it.
 *
 * The calendar cannot produce an out-of-band day — those cells are drawn
 * disabled — so the horizon cases now only reach a user through a shared or
 * hand-edited link, which is precisely why they still have to be caught. 'order'
 * is reachable directly: it is a narrow-hours pair set end-before-start on a
 * single day.
 *
 * A zero-length window is no longer a status of its own. It used to be, because
 * two of the three pickers owned zero-length analyses and the warning's job was
 * to send the user to one of them. Under the calendar, equal narrow hours *are*
 * the way to ask for a single hour, so flagging them would refuse the thing the
 * control is for.
 */
export function classifyWindow(
  startDatetime: string,
  endDatetime: string,
  now: Date,
  forecastHours: number,
): 'ok' | 'order' | 'past' | 'future' {
  if (!isValidDatetimeLocal(startDatetime) || !isValidDatetimeLocal(endDatetime)) {
    return 'ok' // incomplete window — nothing to warn about yet
  }
  const start = new Date(startDatetime).getTime()
  const end = new Date(endDatetime).getTime()
  const earliest = Date.parse(`${bandStart(now)}T${DAY_START}`)
  // Reads the same band the calendar draws, so a window the grid shows as
  // unpickable and a window this calls 'future' can never be different sets —
  // which is why the model's reach has to reach this function rather than only
  // the grid.
  const latest = Date.parse(`${bandEnd(now, forecastHours)}T${DAY_END}`)

  // A reversed window is a user error, not a horizon problem — flag it first so
  // the message is about the hours the user just set, not the servable range.
  if (end < start) return 'order'
  if (start < earliest) return 'past'
  if (end > latest) return 'future'
  return 'ok'
}

/**
 * Classify how much of a forecast window the ~5-day air-quality horizon covers.
 * 'full' means AQI data should span the whole window, 'partial' means only its
 * start, 'none' means the window begins beyond the horizon entirely. Purely
 * informational — analysis still runs, with missing AQI rendered as "—".
 *
 * Whole days again, and for a second reason beyond matching the API: the backend
 * clamps its own request to `min(end.date(), today + 5 days)`
 * (`air_quality.py`), so coverage really does run to the end of the horizon day.
 * Measuring from an instant called a window ending that evening 'partial' while
 * the calendar drew the same day as fully covered, and one of the two had to be
 * wrong.
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
  const horizon = Date.parse(`${aqiHorizon(now)}T${DAY_END}`)

  if (start > horizon) return 'none'
  if (end > horizon) return 'partial'
  return 'full'
}
