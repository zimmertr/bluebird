// Client-side Open-Meteo fetching: the browser spends its own free-tier
// quota (~10k calls/day per IP, CORS-open) instead of the server's, so
// organic traffic scales with visitors' IPs rather than the one egress IP
// every analysis used to share (#170). The aggregation here is a deliberate
// PORT of backend weather.py / air_quality.py — the shared vectors in
// weather_vectors.json pin both implementations to identical outputs, and
// tests on both sides fail if either drifts. Change semantics there first,
// regenerate the vectors, and mirror the change here.

import {
  FALLBACK_WINDOW_LIMITS,
  HOUR_MS,
  archiveBoundaryMs,
  windowSource,
  type WindowLimits,
} from './forecastWindow'
import { buildSnapshot, loadSnapshot, readSnapshot, saveSnapshot } from './forecastStore'

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
// Where a window older than the forecast endpoint's retention goes (#123).
// `windowSource` in forecastWindow.ts is the one thing that decides which of the
// two a window belongs to, mirrored with the backend.
export const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'
export const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality'

// Same batching the backend uses: 50 locations per request, at most 4
// requests in flight. One browser analyzing is exactly as polite to
// Open-Meteo as the server was. Both numbers are measured on the backend
// (issue #182) and mirrored through `mirrored_constants.json`, which is why
// they are exported: `mirroredConstants.test.ts` reads them.
export const BATCH_SIZE = 50
export const MAX_CONCURRENT_BATCHES = 4

// The CAMS air-quality model publishes far less forecast than the weather
// endpoint does, and requesting past its horizon 400s. A FALLBACK for the
// moments before `/api/capabilities` answers with `limits.aqi_forecast_days`
// (#393), which is the same number the calendar dims its later days by — one
// deployment must not clamp the fetch at one horizon and draw another.
const FALLBACK_AQI_FORECAST_DAYS = 5

// Thrown only for failures that mean the browser genuinely cannot talk to
// Open-Meteo: network errors, DNS, a blocked CORS preflight, malformed
// responses. It buys no second path: the browser is the only analysis path
// (#240), so useAnalyze reports it like every other provider failure and the
// analysis fails with its own message rather than pointing a retry at the
// pod's shared quota. It must NEVER cover HTTP 429: rate limiting means the
// service is reachable and the quota is spent, and the 2026-07-29 incident
// (issue #180) was this class swallowing 429s and pointing the retry at a
// server sharing the same exhausted IP.
export class OpenMeteoUnreachable extends Error {}

// Thrown for HTTP 429: reachable, refusing volume. scope names which quota
// tripped (Open-Meteo's 429 body says "Minutely/Hourly/Daily API request
// limit exceeded"), which decides whether waiting can help.
export class OpenMeteoRateLimited extends Error {
  scope: 'minutely' | 'hourly' | 'daily' | 'monthly' | null
  retryAfterS: number
  constructor(message: string, scope: OpenMeteoRateLimited['scope'], retryAfterS: number) {
    super(message)
    this.scope = scope
    this.retryAfterS = retryAfterS
  }
}

// Thrown when a regional model is asked about a location outside its grid.
// Its own class rather than an OpenMeteoHttpError because the status alone
// does not identify it and the remedy is unlike any other failure here: not
// waiting, not a smaller area, but a different model. Measured 2026-08-01,
// `models=gfs_hrrr` at 46.5,8.0 answers HTTP 400 with
// {"error": true, "reason": "No data is available for this location"} — and a
// batch answers the same way if a SINGLE one of its 50 locations is outside,
// so this never identifies which destination was the problem.
// It carries no message: every catch site composes the sentence below from
// the model's own label, which this class does not have, so a message here
// could only ever be a fourth wording nobody reads (#391).
export class OpenMeteoModelCoverage extends Error {
  modelId: string
  constructor(modelId: string) {
    super()
    this.modelId = modelId
  }
}

// What that sentence says after the model's label. The label is the one part
// the two surfaces do not share, so everything after it is spelled here once.
// Mirror of `_coverage_message` in backend/app/services/weather.py.
export const COVERAGE_PHRASE = 'has no forecast coverage for this area.'

// The analysis path adds the remedy; the compare panel does not, because
// unticking the model in its picker is what removes those lines.
export const COVERAGE_MESSAGE_TAIL = `${COVERAGE_PHRASE} Switch to a different model and try again.`

// Thrown when a response ARRIVED and cannot be read: a body that declares a
// unit nothing can convert, for instance. Its own class because the transport
// worked, so `OpenMeteoUnreachable` would name the wrong fault and send the
// reader after a network problem they do not have. The message is the one the
// backend gives any unusable Open-Meteo body, so one provider fault is not
// described two ways across the two paths.
export class OpenMeteoBadBody extends Error {}

// What every unreadable body says, spelled once. A unit nothing can convert
// and a reply that answers a different number of locations than it was asked
// about are one fault to the reader, who can act on neither, so a second
// wording here would only describe that fault two ways (#431).
export const BAD_BODY_MESSAGE = 'Open-Meteo request failed. Try again later.'

// Any other HTTP status: reachable, failed. The server shares the same
// upstream, so a fallback would fail identically — surface it instead.
export class OpenMeteoHttpError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// ── Weighted-call pacing ───────────────────────────────────────────────────

// Open-Meteo bills weighted calls, not HTTP requests: one location in a batch
// is one call, times max(1, days/14) x max(1, vars x models/10). The model
// count multiplies the variable count because a request naming several models
// returns one series per variable per model, and Open-Meteo prices what comes
// back. Mirror of backend/app/services/openmeteo_weight.py — keep them in sync.
export function callWeight(
  nLocations: number,
  startMs: number,
  endMs: number,
  nVariables: number,
  nModels = 1,
): number {
  const days = Math.max(
    1,
    Math.floor((Date.parse(utcDate(endMs)) - Date.parse(utcDate(startMs))) / 86_400_000) + 1,
  )
  return nLocations * Math.max(1, days / 14) * Math.max(1, (nVariables * nModels) / 10)
}

// The visitor's own per-IP budget is 600 weighted calls/minute per service;
// 550 leaves margin for other tabs and clock skew. Spending is paced, not
// burst: a bucket holding one minute of budget refills continuously, callers
// deduct immediately and sleep off any deficit (negative tokens serialize
// concurrent batches fairly). This protects the visitor's own quota — the
// server-side budgets protect the deployment's.
const CLIENT_WEIGHT_PER_MINUTE = 550

class WeightedBudget {
  private tokens: number
  private updated: number
  constructor(private perMinute: number) {
    this.tokens = perMinute
    this.updated = performance.now()
  }
  private refill(now: number): void {
    const rate = this.perMinute / 60_000 // tokens per ms
    this.tokens = Math.min(this.perMinute, this.tokens + (now - this.updated) * rate)
    this.updated = now
  }
  /** Deduct `weight`, sleeping off any deficit. Reports waits via onWait. */
  async acquire(
    weight: number,
    signal?: AbortSignal,
    onWait?: (seconds: number) => void,
  ): Promise<void> {
    const now = performance.now()
    this.refill(now)
    const deficit = weight - this.tokens
    this.tokens -= weight
    if (deficit <= 0) return
    const waitMs = (deficit / this.perMinute) * 60_000
    if (waitMs > 3_000) onWait?.(Math.ceil(waitMs / 1000))
    await abortableSleep(waitMs, signal)
  }
}

// Module-level: the budget is the visitor's wall-clock quota, so it must
// survive across analyses, not reset per click.
let weatherBudget = new WeightedBudget(CLIENT_WEIGHT_PER_MINUTE)
let aqiBudget = new WeightedBudget(CLIENT_WEIGHT_PER_MINUTE)

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// ── Per-location result cache ──────────────────────────────────────────────

// Repeat clicks on an unchanged polygon and window cost zero upstream calls.
// Keys are exact coordinates on purpose: Open-Meteo interpolates per
// coordinate (including elevation downscaling), so a rounded key would serve
// one peak its neighbor's forecast and silently change displayed values.
// TTL sits under Open-Meteo's roughly hourly model-update cadence.
const CACHE_TTL_MS = 15 * 60_000
const CACHE_MAX_ENTRIES = 5_000
// "No data for this window" is a real cached answer, distinct from a miss.
const NO_DATA = 'NO_DATA'

type CacheEntry = { expires: number; value: WeatherResult | AqiResult | typeof NO_DATA }
const forecastCache = new Map<string, CacheEntry>()

// `model` is part of the key for the same reason the coordinates are: two
// models answering the same question disagree, which is the whole point of
// being able to choose one. Empty for air quality, which has a single model.
function cacheKey(
  service: 'weather' | 'aqi',
  c: Coordinate,
  startMs: number,
  endMs: number,
  model = '',
  terrainElevation = false,
  source = '',
): string {
  // Elevation joins the weather key for the reason the model does: the stored
  // aggregates were computed AT that elevation (issue #257), so the same
  // coordinates claimed at a different height are a different question. A
  // grid sample adjusting to the MODEL's terrain height is a third answer at
  // the same coordinates, distinct from both a claimed elevation and none —
  // without its own key, a destination with no elevation and the grid cell
  // over it would poison each other's entries.
  const elevation =
    service === 'weather' ? (c.elevation_ft ?? (terrainElevation ? 'model' : '')) : ''
  // `source` is which endpoint answered (#123). The archive carries no
  // pressure-level winds, so its rows hold the 10 m wind where the forecast
  // endpoint's hold wind at elevation, and the boundary between the two moves
  // with the clock — so an entry is only ever read back for the endpoint that
  // produced it. A window crossing the boundary keys on 'spanning', because its
  // joined series is a third answer at the same coordinates and window rather
  // than either half.
  return `${service}|${c.latitude}|${c.longitude}|${startMs}|${endMs}|${model}|${elevation}|${source}`
}

function cacheGet(key: string): CacheEntry['value'] | undefined {
  const entry = forecastCache.get(key)
  if (!entry) return undefined
  if (performance.now() >= entry.expires) {
    forecastCache.delete(key)
    return undefined
  }
  return entry.value
}

function cachePut(key: string, value: CacheEntry['value']): void {
  forecastCache.set(key, { expires: performance.now() + CACHE_TTL_MS, value })
  cacheDirty = true
  if (forecastCache.size > CACHE_MAX_ENTRIES) {
    for (const oldest of forecastCache.keys()) {
      forecastCache.delete(oldest)
      if (forecastCache.size <= CACHE_MAX_ENTRIES) break
    }
  }
}

// ── Surviving a reload ─────────────────────────────────────────────────────

// The cache above dies with the page, so a reload re-spends the visitor's own
// Open-Meteo quota on coordinates the browser already paid for (#337, finding
// 3). `utils/forecastStore.ts` mirrors what fits into `sessionStorage`: one
// entry measures about 10.5 KB, storage holds about 5 MB, so it is a budget of
// the newest entries rather than a mirror of all of them. Every decision and
// every measurement is in that file; this is the wiring.
//
// The write happens on the way out of the page rather than after each batch,
// because serializing the budget costs about 6 ms and nothing about an
// in-flight analysis needs it done sooner. `pagehide` is the event that
// survives the back/forward cache; `visibilitychange` covers a phone whose
// browser is backgrounded and then killed.
let cacheDirty = false

function persistForecastCache(): void {
  if (!cacheDirty) return
  cacheDirty = false
  saveSnapshot(buildSnapshot(forecastCache, performance.now(), Date.now()))
}

function hydrateForecastCache(): void {
  for (const [key, entry] of readSnapshot(loadSnapshot(), performance.now(), Date.now())) {
    forecastCache.set(key, entry as CacheEntry)
  }
}

if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
  hydrateForecastCache()
  window.addEventListener('pagehide', persistForecastCache)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistForecastCache()
  })
}

// Test hook: budgets and cache are module state that must not leak between
// unit tests.
export function resetOpenMeteoState(): void {
  cacheDirty = false
  forecastCache.clear()
  weatherBudget = new WeightedBudget(CLIENT_WEIGHT_PER_MINUTE)
  aqiBudget = new WeightedBudget(CLIENT_WEIGHT_PER_MINUTE)
}

// ── Parity primitives ──────────────────────────────────────────────────────

// Python's round() is round-half-even; Math.round is round-half-up. Scaling by
// 10**digits and breaking the tie on the scaled value is the obvious port and it
// is wrong: the multiply rounds to the nearest double and can MANUFACTURE a tie
// the true value never had. 20.15 is really 20.1499999999999985789, which Python
// rounds down to 20.1, but 20.15 * 10 rounds up to exactly 201.5, which a
// tie-break then sends to 20.2. Measured before this was fixed: the two
// implementations disagreed on 4.0% of realistic temperature averages and 3.3%
// of precipitation averages, because a real API returns decimal-clean values and
// those are precisely the ones that land on manufactured ties.
//
// So: scale for the fast path, but when the scaled value lands exactly on .5,
// confirm the tie against the double's own decimal expansion before breaking it.
export function roundHalfEven(v: number, digits: number): number {
  if (!Number.isFinite(v)) return v
  const factor = 10 ** digits
  const shifted = v * factor
  const floor = Math.floor(shifted)
  const diff = shifted - floor
  if (diff > 0.5) return (floor + 1) / factor
  if (diff < 0.5) return floor / factor
  return tieBreak(v, floor, digits) / factor
}

/**
 * Decide a scaled-value tie from the true decimal expansion of `v`.
 *
 * A double's exact decimal expansion terminates, and `toFixed` renders it
 * correctly rounded, so 25 places past the rounding position separates a real
 * tie (a "5" followed only by zeros) from a value that merely scaled into one.
 * Doubles at the magnitudes this app aggregates are spaced far wider than
 * 1e-25, so nothing but a genuine tie can present as one at that depth.
 *
 * The comparison runs on the magnitude and the direction is applied after,
 * because "round away from zero" is `floor` for a negative and `floor + 1` for
 * a positive.
 */
function tieBreak(v: number, floor: number, digits: number): number {
  const expansion = Math.abs(v).toFixed(Math.min(digits + 25, 100))
  const tail = expansion.slice(expansion.indexOf('.') + 1 + digits)
  const lead = tail.charCodeAt(0)
  // 53 is '5'. Above it the true value clears the halfway point; below it the
  // value never reached it; equal-and-then-nonzero clears it too.
  const cmp = lead > 53 ? 1 : lead < 53 ? -1 : /[1-9]/.test(tail.slice(1)) ? 1 : 0
  if (cmp > 0) return v < 0 ? floor : floor + 1
  if (cmp < 0) return v < 0 ? floor + 1 : floor
  return floor % 2 === 0 ? floor : floor + 1
}

// A stamp arrives in one of two shapes, and both are UTC.
//
// Every request here sends `timeformat=unixtime`, so the wire carries whole
// seconds: 1789430400 rather than "2026-09-15T00:00". That is 11 bytes instead
// of 18, and a multiply instead of a regex and a `Date.parse`. Measured
// 2026-09-14 over 540,000 stamps, which is a maximal 1,500-destination
// analysis of a 15-day window: 63 ms of parsing became 4 ms, and the response
// lost 11% of its raw bytes (2.9% after gzip, because repeated ISO text
// compresses well).
//
// The string arm stays, and is not legacy. `weather_vectors.json` is written
// by the backend's reference implementation and carries ISO stamps, so the
// vectors that pin this port to Python feed strings through this function.
// Open-Meteo returns naive-UTC "YYYY-MM-DDTHH:MM" there, and a bare
// `new Date(...)` would read it as LOCAL time, so the stamp is re-zoned before
// parsing — the exact counterpart of the backend's parse-then-treat-as-UTC
// (`_parse_ts` + `_epoch_ms`).
export function parseTs(s: unknown): number | null {
  if (typeof s === 'number') return Number.isFinite(s) ? s * 1000 : null
  if (typeof s !== 'string') return null
  const zoned = /(?:[Zz]|[+-]\d\d:?\d\d)$/.test(s) ? s : `${s}Z`
  const t = Date.parse(zoned)
  return Number.isNaN(t) ? null : t
}

function at<T>(arr: readonly T[], i: number): T | null {
  return i < arr.length ? (arr[i] ?? null) : null
}

function roundOrNull(v: number | null, digits: number): number | null {
  return v == null ? null : roundHalfEven(v, digits)
}

// ── Pure transforms (vector-pinned ports) ──────────────────────────────────

export interface WeatherAggregates {
  precip_total_in: number
  precip_avg_in_hr: number
  precip_min_in_hr: number
  precip_max_in_hr: number
  temp_min_f: number
  temp_max_f: number
  temp_avg_f: number
  wind_min_mph: number
  wind_max_mph: number
  wind_avg_mph: number
  // Nullable where every other aggregate is not: five of the eight models
  // publish no freezing level at all (issue #295), and a row from one of them
  // still carries a full set of the numbers above.
  freeze_min_ft: number | null
  freeze_max_ft: number | null
  freeze_avg_ft: number | null
}

export interface WeatherSeries {
  times: number[]
  precip_in: (number | null)[]
  temp_f: (number | null)[]
  wind_mph: (number | null)[]
  freeze_ft: (number | null)[]
  /**
   * Wind bearing per hour, for the map's playback arrows (#121).
   *
   * Optional and client-populated, the same shape `series_times` takes on
   * `DestinationResult`: the backend does not fetch direction, so a report that
   * came back through the SSE fallback carries none and the arrows simply do
   * not appear on that path. Filled by the fetch rather than by `weatherSeries`
   * below, which is pinned byte-for-byte against the backend by
   * `weather_vectors.json` and must keep producing exactly what Python does.
   */
  wind_dir_deg?: (number | null)[]
}

interface HourlyPayload {
  /**
   * The terrain elevation Open-Meteo resolved for the coordinate, in meters —
   * its ~90 m downscaling DEM, sent back on every forecast response. The
   * forecast grid reads it as each sample's own height (#288 review): a
   * lattice point has no destination elevation, but it stands on real ground.
   */
  elevation?: number
  /**
   * The unit Open-Meteo quoted each hourly variable in. Read in two places.
   * When two half-windows are joined (`joinHours`), the two hosts are sent the
   * same unit parameters, so a disagreement means one of them answered in
   * something else. And the freezing level's unit follows `precipitation_unit`,
   * so the value is feet under the `inch` every request here sends and meters
   * without it (port of `weather._freeze_unit`).
   */
  hourly_units?: Record<string, string>
  hourly?: {
    time?: unknown[]
    precipitation?: (number | null)[]
    temperature_2m?: (number | null)[]
    wind_speed_10m?: (number | null)[]
    wind_direction_10m?: (number | null)[]
    freezing_level_height?: (number | null)[]
    wind_speed_925hPa?: (number | null)[]
    wind_speed_850hPa?: (number | null)[]
    wind_speed_700hPa?: (number | null)[]
    wind_speed_600hPa?: (number | null)[]
    wind_speed_500hPa?: (number | null)[]
    temperature_925hPa?: (number | null)[]
    temperature_850hPa?: (number | null)[]
    temperature_700hPa?: (number | null)[]
    temperature_600hPa?: (number | null)[]
    temperature_500hPa?: (number | null)[]
    us_aqi?: (number | null)[]
  }
}

// Port of weather._WIND_LEVELS: the five free-air winds each hour also
// carries, and the ISA standard-atmosphere height of each level. The wind the
// table ranks on is wind at the destination's OWN elevation (issue #257) —
// `windAtElevation` interpolates between the two bracketing levels, floored
// at the friction-slowed 10 m value. Fixed heights rather than fetched
// geopotentials, for the reason weather.py records.
const WIND_LEVELS = [
  ['wind_speed_925hPa', 762],
  ['wind_speed_850hPa', 1457],
  ['wind_speed_700hPa', 3012],
  ['wind_speed_600hPa', 4206],
  ['wind_speed_500hPa', 5574],
] as const
// Port of weather._TEMP_LEVELS: the same five levels and the same ISA heights,
// read for the free-air TEMPERATURE each hour also carries (issue #443).
// `temperature_2m` stands 2 m over the model's smoothed terrain, which under a
// summit is a valley floor that radiates away on a clear night, so the table
// reported a summit below freezing while its own freezing level sat thousands
// of feet higher. `tempAtElevation` reads the free air instead.
//
// A separate table from WIND_LEVELS rather than one list of heights: the two
// interpolations differ in the one place that matters (the wind is floored at
// its 10 m value, the temperature is not), and a shared table would suggest
// they are the same rule.
const TEMP_LEVELS = [
  ['temperature_925hPa', 762],
  ['temperature_850hPa', 1457],
  ['temperature_700hPa', 3012],
  ['temperature_600hPa', 4206],
  ['temperature_500hPa', 5574],
] as const
const FT_TO_M = 0.3048

// Port of weather._FREEZING_LEVEL: the height where the free-air temperature
// crosses freezing, clamped to 0 when the whole column is below freezing.
// Three of the eight models publish it (issue #295). Its unit follows
// `precipitation_unit`, so every request here gets FEET and a request without
// that parameter gets meters — read off the response, never assumed, because
// the factor between them is 3.28 and a freezing level 3.28 times too high is
// a plausible-looking altitude rather than an obvious fault.
const FREEZING_LEVEL = 'freezing_level_height'

// The hourly variables every weather request asks for. Spelled once because it
// is three things: what a request asks for, which arrays a joined half-window
// has to keep parallel (`joinHours`), and the count the weighted-call
// accounting is priced on — which is why the list is exported and why
// `mirroredConstants.test.ts` measures it against the backend's N_VARIABLES.
export const HOURLY_VARIABLES = [
  'precipitation',
  'temperature_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  FREEZING_LEVEL,
  ...WIND_LEVELS.map(([name]) => name),
  ...TEMP_LEVELS.map(([name]) => name),
] as const

/** One leg of a fetch: which endpoint answers, and the hours it answers for. */
interface FetchSpan {
  archive: boolean
  startMs: number
  endMs: number
}

/**
 * The one or two requests a window takes (#123).
 *
 * A forecast or archive window is one request. A window spanning the archive
 * boundary is two, and this is the only place that split is computed, so the
 * weighted spend and the requests themselves can never describe different
 * halves.
 *
 * The halves are disjoint: the archive answers through the hour BEFORE the seam
 * and the forecast endpoint from the seam on, because both bounds are inclusive
 * and an hour arriving twice would be counted twice in a total. Unlike the
 * backend's `_fetch_spans`, neither half can come out empty here: a window is
 * already epoch milliseconds by the time it reaches this module, so the
 * classification and the split measure the same instants rather than one reading
 * a caller's wall clock.
 */
export function fetchSpans(
  startMs: number,
  endMs: number,
  nowMs: number = Date.now(),
  limits: WindowLimits = FALLBACK_WINDOW_LIMITS,
): FetchSpan[] {
  const source = windowSource(startMs, endMs, nowMs, limits)
  if (source !== 'spanning') {
    return [{ archive: source === 'archive', startMs, endMs }]
  }
  const seam = archiveBoundaryMs(nowMs, limits)
  return [
    { archive: true, startMs, endMs: seam - HOUR_MS },
    { archive: false, startMs: seam, endMs },
  ]
}

// What the archive endpoint writes in `hourly_units` for a variable it does not
// serve. The column beside it is all nulls, so the unit carries no information.
const UNIT_UNSERVED = 'undefined'

// Port of weather._units_agree: no variable declared in two different real
// units. A unit is compared only where both hosts declare one; the archive
// answers "undefined" for the pressure-level winds it does not serve
// (measured 2026-09-13) where the forecast endpoint says "mp/h".
function unitsAgree(declared: readonly Record<string, string>[]): boolean {
  const keys = new Set(declared.flatMap((d) => Object.keys(d)))
  for (const key of keys) {
    const seen = new Set(
      declared.filter((d) => key in d && d[key] !== UNIT_UNSERVED).map((d) => d[key]),
    )
    if (seen.size > 1) return false
  }
  return true
}

/**
 * One location's half-windows as a single hourly payload.
 *
 * The aggregation below is pinned byte-for-byte against the backend by the
 * shared vectors, so a spanning window is made to look like every other window
 * BEFORE it reaches `weatherMetrics`: the halves are concatenated in time order
 * (the spans are disjoint and ordered, so appending them IS time order) and each
 * array is padded to the stamp count, which keeps them parallel for the
 * index-addressed reads the aggregation does.
 *
 * Two payloads are dropped rather than mixed. Disagreeing `hourly_units` means
 * one host answered in units the other did not, and a total of inches and
 * millimetres is a number with no meaning; a repeated stamp would count one hour
 * twice. Both degrade to no metrics for that location, which is what every
 * payload this module cannot read does. A unit is compared only where both
 * hosts declare one (`unitsAgree`).
 *
 * Mirror of `_join_hours` in `backend/app/services/weather.py`.
 */
// Port of weather._join_units: the joined payload's `hourly_units`, each
// variable's SERVED unit. The halves agree wherever both serve a variable
// (`unitsAgree`), so the only choice is between a real unit and the archive's
// "undefined", and the real one wins: the freezing level's reader converts by
// the declared unit, and a joined window that kept the archive's "undefined"
// over the forecast half's "ft" would refuse the very numbers it carries.
function joinUnits(declared: readonly Record<string, string>[]): Record<string, string> {
  const joined: Record<string, string> = {}
  for (const units of declared) {
    for (const [key, unit] of Object.entries(units)) {
      if ((joined[key] ?? UNIT_UNSERVED) === UNIT_UNSERVED) joined[key] = unit
    }
  }
  return joined
}

export function joinHours(parts: readonly HourlyPayload[]): HourlyPayload {
  if (parts.length === 1) return parts[0]
  const declared = parts.map((p) => p?.hourly_units ?? {})
  if (!unitsAgree(declared)) return {}
  const joined: Record<string, unknown[]> = { time: [] }
  for (const name of HOURLY_VARIABLES) joined[name] = []
  const seen = new Set<unknown>()
  for (const part of parts) {
    const hourly = (part?.hourly ?? {}) as Record<string, unknown[] | undefined>
    const times = hourly.time ?? []
    for (let i = 0; i < times.length; i++) {
      if (seen.has(times[i])) continue
      seen.add(times[i])
      joined.time.push(times[i])
      for (const name of HOURLY_VARIABLES) {
        joined[name].push(at(hourly[name] ?? [], i))
      }
    }
  }
  return {
    ...parts[0],
    hourly_units: joinUnits(declared),
    hourly: joined as NonNullable<HourlyPayload['hourly']>,
  }
}

// Port of weather._wind_at_elevation — line-for-line, because it feeds the
// vector-pinned aggregates. Every gap degrades to the 10 m wind: no
// elevation, an elevation under the lowest level (a valley destination IS
// sheltered), or a null at a needed level.
export function windAtElevation(
  w10: number,
  elevationFt: number | null | undefined,
  levels: readonly (number | null)[],
): number {
  if (elevationFt == null) return w10
  const elevM = elevationFt * FT_TO_M
  if (elevM <= WIND_LEVELS[0][1]) return w10
  let free: number | null = null
  if (elevM >= WIND_LEVELS[WIND_LEVELS.length - 1][1]) {
    free = levels[levels.length - 1] ?? null
  } else {
    for (let k = 0; k < WIND_LEVELS.length - 1; k++) {
      const hiH = WIND_LEVELS[k + 1][1]
      if (elevM < hiH) {
        const loH = WIND_LEVELS[k][1]
        const loV = levels[k]
        const hiV = levels[k + 1]
        if (loV != null && hiV != null) {
          free = loV + (hiV - loV) * ((elevM - loH) / (hiH - loH))
        }
        break
      }
    }
  }
  if (free == null) return w10
  return Math.max(w10, free)
}

// Port of weather._temp_at_elevation — line-for-line, because it feeds the
// vector-pinned aggregates. Every gap degrades to `temperature_2m`: no
// elevation, an elevation under the lowest level (a valley destination IS its
// own surface layer), a null at a needed level, or an archive window, whose
// levels come back null.
//
// Unlike `windAtElevation` there is no floor. A summit can be colder than the
// free air on a calm clear night and warmer than it under an inversion, so
// clamping in either direction would report a number no model produced.
export function tempAtElevation(
  t2m: number,
  elevationFt: number | null | undefined,
  levels: readonly (number | null)[],
): number {
  if (elevationFt == null) return t2m
  const elevM = elevationFt * FT_TO_M
  if (elevM <= TEMP_LEVELS[0][1]) return t2m
  let free: number | null = null
  if (elevM >= TEMP_LEVELS[TEMP_LEVELS.length - 1][1]) {
    free = levels[levels.length - 1] ?? null
  } else {
    for (let k = 0; k < TEMP_LEVELS.length - 1; k++) {
      const hiH = TEMP_LEVELS[k + 1][1]
      if (elevM < hiH) {
        const loH = TEMP_LEVELS[k][1]
        const loV = levels[k]
        const hiV = levels[k + 1]
        if (loV != null && hiV != null) {
          free = loV + (hiV - loV) * ((elevM - loH) / (hiH - loH))
        }
        break
      }
    }
  }
  if (free == null) return t2m
  return free
}

function levelArrays(hourly: NonNullable<HourlyPayload['hourly']>): (number | null)[][] {
  return WIND_LEVELS.map(([name]) => hourly[name] ?? [])
}

function tempLevelArrays(hourly: NonNullable<HourlyPayload['hourly']>): (number | null)[][] {
  return TEMP_LEVELS.map(([name]) => hourly[name] ?? [])
}

// Port of weather._freeze_unit.
function freezeUnit(payload: HourlyPayload): string | null {
  return payload?.hourly_units?.[FREEZING_LEVEL] ?? null
}

// Port of weather._freeze_to_ft: one reading in feet, per the unit the
// response declared. A unit that is neither documented one leaves the number
// unreadable, and assuming either would ship a reading 3.28 times out, so an
// unknown or missing unit fails the batch the way any unusable body does.
function freezeToFeet(v: number, unit: string | null): number {
  if (unit === 'ft') return v
  if (unit === 'm') return v / FT_TO_M
  throw new OpenMeteoBadBody(BAD_BODY_MESSAGE)
}

// Port of weather._freeze_ft_in_window: every in-window hour that HAS a
// freezing level, in feet. Read against its own pair of arrays rather than
// inside the metrics loop below, because an hour dropped for a null freezing
// level would take that hour's precipitation, temperature and wind with it —
// and five of the eight models answer a column of nulls.
function freezeFtInWindow(
  hourly: NonNullable<HourlyPayload['hourly']>,
  startMs: number,
  endMs: number,
  unit: string | null,
): number[] {
  const times = hourly.time ?? []
  const freeze = hourly[FREEZING_LEVEL] ?? []
  const out: number[] = []
  const n = Math.min(times.length, freeze.length)
  for (let i = 0; i < n; i++) {
    const v = freeze[i]
    if (v == null) continue
    const t = parseTs(times[i])
    if (t === null || t < startMs || t > endMs) continue
    out.push(freezeToFeet(v, unit))
  }
  return out
}

// Port of weather._metrics: an hour missing ANY metric is dropped entirely,
// and the loop stops at the shortest array (Python zip semantics) — unlike
// the series below, which is times-driven. Malformed payloads degrade to
// null; only an unreadable freezing level unit throws.
export function weatherMetrics(
  payload: HourlyPayload,
  startMs: number,
  endMs: number,
  elevationFt: number | null = null,
): WeatherAggregates | null {
  try {
    const hourly = payload?.hourly ?? {}
    const times = hourly.time ?? []
    const precip = hourly.precipitation ?? []
    const temp = hourly.temperature_2m ?? []
    const wind = hourly.wind_speed_10m ?? []
    const levels = levelArrays(hourly)
    const tLevels = tempLevelArrays(hourly)

    // min over the four core arrays keeps the pre-#257 hour-dropping
    // semantics: a missing or short LEVEL array can never drop an hour, only
    // send its wind back to the 10 m value and its temperature back to the
    // 2 m value.
    const n = Math.min(times.length, precip.length, temp.length, wind.length)
    const rows: Array<[number, number, number]> = []
    for (let i = 0; i < n; i++) {
      const t = parseTs(times[i])
      if (t === null || t < startMs || t > endMs) continue
      const p = precip[i]
      const tf = temp[i]
      const w = wind[i]
      if (p == null || tf == null || w == null) continue
      const wAdj = windAtElevation(w, elevationFt, levels.map((arr) => at(arr, i)))
      const tAdj = tempAtElevation(tf, elevationFt, tLevels.map((arr) => at(arr, i)))
      rows.push([p, tAdj, wAdj])
    }
    if (rows.length === 0) return null
    const fVals = freezeFtInWindow(hourly, startMs, endMs, freezeUnit(payload))

    // Left-to-right sums in input order, matching Python's sum() exactly.
    let pSum = 0
    let tSum = 0
    let wSum = 0
    let pMin = Infinity
    let pMax = -Infinity
    let tMin = Infinity
    let tMax = -Infinity
    let wMin = Infinity
    let wMax = -Infinity
    for (const [p, tf, w] of rows) {
      pSum += p
      tSum += tf
      wSum += w
      if (p < pMin) pMin = p
      if (p > pMax) pMax = p
      if (tf < tMin) tMin = tf
      if (tf > tMax) tMax = tf
      if (w < wMin) wMin = w
      if (w > wMax) wMax = w
    }
    // Its own left-to-right pass, for the same reason Python reduces it in a
    // separate comprehension: the hours it reduces are not the hours above.
    let fSum = 0
    let fMin = Infinity
    let fMax = -Infinity
    for (const f of fVals) {
      fSum += f
      if (f < fMin) fMin = f
      if (f > fMax) fMax = f
    }

    const len = rows.length
    return {
      precip_total_in: roundHalfEven(pSum, 4),
      precip_avg_in_hr: roundHalfEven(pSum / len, 4),
      // Near-zero for any window with one dry hour, and kept anyway: every
      // aggregate column is rankable (#291), so the set stays complete.
      precip_min_in_hr: roundHalfEven(pMin, 4),
      precip_max_in_hr: roundHalfEven(pMax, 4),
      temp_min_f: roundHalfEven(tMin, 1),
      temp_max_f: roundHalfEven(tMax, 1),
      temp_avg_f: roundHalfEven(tSum / len, 1),
      wind_min_mph: roundHalfEven(wMin, 1),
      wind_max_mph: roundHalfEven(wMax, 1),
      wind_avg_mph: roundHalfEven(wSum / len, 1),
      // Whole feet: the models resolve this to hundreds of meters, so a
      // decimal would be precision the number does not carry.
      freeze_min_ft: fVals.length === 0 ? null : roundHalfEven(fMin, 0),
      freeze_max_ft: fVals.length === 0 ? null : roundHalfEven(fMax, 0),
      freeze_avg_ft: fVals.length === 0 ? null : roundHalfEven(fSum / fVals.length, 0),
    }
  } catch (e) {
    // A unit nothing can read is not one bad hour to skip past: every number
    // in the column would have to be invented, so it passes the degrade and
    // fails the analysis. Mirrors the `except UpstreamError: raise` the
    // backend's `_metrics` puts ahead of its own degrade.
    if (e instanceof OpenMeteoBadBody) throw e
    return null
  }
}

// Port of weather._series: times-driven (every in-window hour survives),
// with metric arrays padded by null when shorter — NOT zip semantics. The
// asymmetry with weatherMetrics is the backend's, preserved on purpose.
export function weatherSeries(
  payload: HourlyPayload,
  startMs: number,
  endMs: number,
  elevationFt: number | null = null,
): WeatherSeries | null {
  try {
    const hourly = payload?.hourly ?? {}
    const times = hourly.time ?? []
    const precip = hourly.precipitation ?? []
    const temp = hourly.temperature_2m ?? []
    const wind = hourly.wind_speed_10m ?? []
    const freeze = hourly[FREEZING_LEVEL] ?? []
    const fUnit = freezeUnit(payload)
    const levels = levelArrays(hourly)
    const tLevels = tempLevelArrays(hourly)

    const grid: number[] = []
    const pOut: (number | null)[] = []
    const tOut: (number | null)[] = []
    const wOut: (number | null)[] = []
    const fOut: (number | null)[] = []
    for (let i = 0; i < times.length; i++) {
      const t = parseTs(times[i])
      if (t === null || t < startMs || t > endMs) continue
      grid.push(t)
      pOut.push(roundOrNull(at(precip, i), 4))
      const t2m = at(temp, i)
      const tAdj =
        t2m == null ? null : tempAtElevation(t2m, elevationFt, tLevels.map((arr) => at(arr, i)))
      tOut.push(roundOrNull(tAdj, 1))
      const w10 = at(wind, i)
      const wAdj =
        w10 == null
          ? null
          : windAtElevation(w10, elevationFt, levels.map((arr) => at(arr, i)))
      wOut.push(roundOrNull(wAdj, 1))
      const fRaw = at(freeze, i)
      fOut.push(roundOrNull(fRaw === null ? null : freezeToFeet(fRaw, fUnit), 0))
    }
    if (grid.length === 0) return null
    return { times: grid, precip_in: pOut, temp_f: tOut, wind_mph: wOut, freeze_ft: fOut }
  } catch (e) {
    // The one failure this function does not absorb, for the reason
    // `weatherMetrics` does not absorb it either.
    if (e instanceof OpenMeteoBadBody) throw e
    return null
  }
}

/**
 * Wind bearing per hour, on the same grid `weatherSeries` builds.
 *
 * A second pass over the same payload rather than a fourth array inside
 * `weatherSeries`, because that function is the port half of a two-language
 * contract: `weather_vectors.json` compares its output to Python's field for
 * field, and the backend has no reason to fetch direction — nothing it computes
 * uses it. Adding a field there would be a semantic change to the shared
 * aggregation for the sake of a browser-only picture.
 *
 * The window filter is repeated verbatim for the same reason it is repeated at
 * all: the arrays must line up index for index, so the only safe way to build
 * the second one is with the first one's own predicate.
 *
 * Bearings are degrees clockwise from north, as Open-Meteo sends them, and are
 * the direction the wind blows FROM. Which way the arrow points is the map's
 * decision, not this function's.
 */
export function windDirectionSeries(
  payload: HourlyPayload,
  startMs: number,
  endMs: number,
): (number | null)[] | null {
  try {
    const hourly = payload?.hourly ?? {}
    const times = hourly.time ?? []
    const direction = hourly.wind_direction_10m
    if (!direction) return null
    const out: (number | null)[] = []
    for (let i = 0; i < times.length; i++) {
      const t = parseTs(times[i])
      if (t === null || t < startMs || t > endMs) continue
      out.push(roundOrNull(at(direction, i), 0))
    }
    return out.length > 0 ? out : null
  } catch {
    return null
  }
}

export interface AqiAggregates {
  aqi_avg: number
  aqi_min: number
  aqi_max: number
}

export interface AqiSeries {
  times: number[]
  aqi: (number | null)[]
}

// Port of air_quality._metrics. US AQI is an integer index by definition —
// and Python's integer round() is still half-even (80.5 → 80), which
// Math.round would get wrong.
export function aqiMetrics(
  payload: HourlyPayload,
  startMs: number,
  endMs: number,
): AqiAggregates | null {
  try {
    const hourly = payload?.hourly ?? {}
    const times = hourly.time ?? []
    const aqi = hourly.us_aqi ?? []

    const n = Math.min(times.length, aqi.length)
    const vals: number[] = []
    for (let i = 0; i < n; i++) {
      const v = aqi[i]
      if (v == null) continue
      const t = parseTs(times[i])
      if (t === null || t < startMs || t > endMs) continue
      vals.push(v)
    }
    if (vals.length === 0) return null
    let sum = 0
    let min = Infinity
    let max = -Infinity
    for (const v of vals) {
      sum += v
      if (v < min) min = v
      if (v > max) max = v
    }
    return {
      aqi_avg: roundHalfEven(sum / vals.length, 0),
      aqi_min: roundHalfEven(min, 0),
      aqi_max: roundHalfEven(max, 0),
    }
  } catch {
    return null
  }
}

// Port of air_quality._series: times-driven with null padding, like the
// weather series.
export function aqiSeries(
  payload: HourlyPayload,
  startMs: number,
  endMs: number,
): AqiSeries | null {
  try {
    const hourly = payload?.hourly ?? {}
    const times = hourly.time ?? []
    const aqi = hourly.us_aqi ?? []

    const grid: number[] = []
    const out: (number | null)[] = []
    for (let i = 0; i < times.length; i++) {
      const t = parseTs(times[i])
      if (t === null || t < startMs || t > endMs) continue
      grid.push(t)
      const v = at(aqi, i)
      out.push(v == null ? null : roundHalfEven(v, 0))
    }
    if (grid.length === 0) return null
    return { times: grid, aqi: out }
  } catch {
    return null
  }
}

// ── Fetch orchestration ────────────────────────────────────────────────────

export interface Coordinate {
  latitude: number
  longitude: number
  /**
   * The destination's own elevation, when known. Present on analysis
   * candidates and absent on forecast-grid lattice points, which is exactly
   * the split that decides the wind: with an elevation the aggregates report
   * wind at that height (issue #257), without one they report the 10 m wind.
   */
  elevation_ft?: number | null
}

export type WeatherResult = (WeatherAggregates & { series: WeatherSeries | null }) | null
export type AqiResult = (AqiAggregates & { series: AqiSeries | null }) | null

function chunked<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

// Run `tasks` with at most `limit` in flight, resolving to results in input
// order. Workers check the signal before pulling each task, so an abort (or
// a failure that aborts the shared controller upstream) actually stops the
// queue — the pre-#180 version's comment claimed this while the workers
// churned every remaining task, which is what kept burning quota after the
// first 429 during the incident.
async function pooled<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
  signal?: AbortSignal,
): Promise<T[]> {
  const results = new Array<T>(tasks.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < tasks.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const index = next++
      results[index] = await tasks[index]()
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, () => worker()),
  )
  return results
}

function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

// The window's ends in the `start_hour`/`end_hour` shape (issue #212). Asking
// for hours instead of whole days is what keeps a narrow window from fetching
// the calendar days around it and discarding the overhang, which on this path
// is memory in the visitor's browser: measured 2026-08-23 over 50 locations, a
// point sample fell from 97.3 KB to 32.8 KB and a six-hour window to 46.9 KB.
// Both hosts accept the form and its accepted range is the date form's, so
// nothing new can 400. Flooring cannot drop an hour the aggregation keeps:
// every stamp it keeps sits on the hour inside `start <= ts <= end`, so it
// also sits inside the floored bounds, and at most one extra hour arrives at
// the head for the same inclusive filter to drop. Port of `hour_param` in
// backend/app/services/weather.py.
function utcHour(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 13)}:00`
}

// Open-Meteo's 429 body names the tripped quota: {"reason": "Minutely API
// request limit exceeded..."}. Best-effort parse; an unreadable body still
// classifies as a rate limit, just without a scope.
async function classify429(res: Response): Promise<OpenMeteoRateLimited> {
  let scope: OpenMeteoRateLimited['scope'] = null
  try {
    const body = (await res.json()) as { reason?: string }
    const match = /\b(minutely|hourly|daily|monthly)\b/i.exec(body.reason ?? '')
    if (match) scope = match[1].toLowerCase() as NonNullable<OpenMeteoRateLimited['scope']>
  } catch {
    // body unreadable; scope stays null
  }
  const floors: Record<string, number> = { minutely: 60, hourly: 900, daily: 3600, monthly: 3600 }
  let retryAfterS = floors[scope ?? ''] ?? 60
  // Optional-chained: a real Response always has headers, but keeping this
  // tolerant costs nothing and minimal fetch stubs in tests omit them.
  const header = res.headers?.get?.('Retry-After')
  if (header && Number.isFinite(Number(header))) retryAfterS = Math.max(1, Math.ceil(Number(header)))
  // Whose quota it is, named. These fetches leave the reader's own browser
  // against the reader's own address, so "your quota" is literally true and is
  // the fact that makes the wait make sense; "Open-Meteo has used up
  // its quota" described an outage the reader could only wait out, and invited
  // the reading that Bluebird Forecast was down. Naming Open-Meteo matters for the same
  // reason: it is the credit already docked beside the results, so the sentence
  // lands on something the reader can see rather than on an anonymous service.
  //
  // The smaller-area advice is gone. It was true of the minutely bucket,
  // which the pacer already absorbs without reaching this message; against an
  // exhausted daily quota narrowing the search still fails, so it read as a
  // remedy and was not one.
  const message =
    scope === 'hourly' || scope === 'daily' || scope === 'monthly'
      ? 'Open-Meteo quota reached. Try again later.'
      : 'Open-Meteo is rate-limiting. Try again later.'
  return new OpenMeteoRateLimited(message, scope, retryAfterS)
}

// Does this 400 body say a regional model has nothing here? Best-effort by
// construction: an unreadable or unexpected body falls through to the generic
// HTTP error rather than throwing from inside error handling.
async function isOutOfDomain(res: Response): Promise<boolean> {
  try {
    const body = (await res.clone().json()) as { reason?: unknown }
    return (
      typeof body?.reason === 'string' &&
      /no data is available for this location/i.test(body.reason)
    )
  } catch {
    return false
  }
}

async function getJson(
  url: string,
  params: Record<string, string>,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const qs = new URLSearchParams(params).toString()
  // The error taxonomy (issue #180). Every arm surfaces now that #240 has
  // removed the server reroute, but they stay separate because the message
  // each one owes the reader is different:
  // - fetch rejecting with a TypeError = network/DNS/CORS = unreachable from
  //   THIS browser, which is the one cause the reader can act on.
  // - HTTP 429 = reachable, quota spent = OpenMeteoRateLimited, whose scope
  //   decides whether waiting can help.
  // - any other HTTP status = reachable, failed = OpenMeteoHttpError.
  // Only a user cancel passes through untranslated.
  try {
    const res = await fetch(`${url}?${qs}`, { signal })
    if (res.status === 429) throw await classify429(res)
    if (res.status === 400 && (await isOutOfDomain(res))) {
      // Names the remedy, not the model: the batch 400s on one bad location
      // out of fifty and never says which, and the picker is on screen anyway.
      const modelId = params.models || 'unknown'
      throw new OpenMeteoModelCoverage(modelId)
    }
    if (!res.ok) {
      throw new OpenMeteoHttpError(
        `Open-Meteo error (HTTP ${res.status}). Try again later.`,
        res.status,
      )
    }
    return await res.json()
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    if (e instanceof OpenMeteoRateLimited || e instanceof OpenMeteoHttpError) throw e
    if (e instanceof OpenMeteoModelCoverage) throw e
    if (e instanceof OpenMeteoUnreachable) throw e
    throw new OpenMeteoUnreachable('Cannot reach Open-Meteo. Try again later.')
  }
}

function coordParams(chunk: readonly Coordinate[]): Record<string, string> {
  return {
    latitude: chunk.map((d) => String(d.latitude)).join(','),
    longitude: chunk.map((d) => String(d.longitude)).join(','),
  }
}

// Single location → object, multiple → array; normalize like the backend.
function asItems(data: unknown): HourlyPayload[] {
  return (Array.isArray(data) ? data : [data]) as HourlyPayload[]
}

export interface FetchWeatherOptions {
  signal?: AbortSignal
  onProgress?: (processed: number, total: number) => void
  /**
   * Every batch that has landed so far, as soon as it lands (#337, finding 2).
   *
   * `results` is the full-length array and `settled` says which of its entries
   * are answers rather than holes: a `null` result means "no forecast for this
   * location", which is a different thing from "not fetched yet", and a caller
   * that could not tell them apart would rank a hole as a missing forecast.
   * Both arrays are copies, so a caller may hold them.
   */
  onPartial?: (results: WeatherResult[], settled: boolean[]) => void
  // The pacer or a minutely resume is about to sleep this many seconds.
  onPace?: (seconds: number) => void
  // Which model answers. Named on every FORECAST request rather than defaulted
  // here: omitting `models=` there takes Open-Meteo's `best_match` blend, which
  // chooses per location and never reports its choice, so two adjacent peaks in
  // one response could come from two different models with nothing saying so.
  // An archive window ignores this and sends no `models=` at all (#123), for the
  // reason given at the fetch below.
  model: string
  /**
   * Injectable clock, so a test can pin which side of the archive boundary a
   * window falls on. The boundary is the only thing here that reads the clock.
   */
  nowMs?: number
  /**
   * Where this deployment puts the archive boundary, from `/api/capabilities`.
   * Omitted means the compiled fallback, which is what the app runs on before
   * that fetch answers (#393).
   */
  windowLimits?: WindowLimits
  /**
   * For coordinates carrying no `elevation_ft` of their own, adjust wind to
   * the TERRAIN elevation Open-Meteo reports for the coordinate (its ~90 m
   * DEM, on every response) instead of falling back to the 10 m wind. The
   * forecast grid's option (#288 review): its lattice points are not
   * destinations, but each stands on real ground, and painting a volcano's
   * flank with valley-calm wind under a red summit marker was the confusion
   * this resolves. A coordinate WITH `elevation_ft` keeps it — a destination's
   * claimed height beats the DEM's cell average.
   */
  terrainElevation?: boolean
}

// getJson plus one automatic resume for a minutely 429: that quota refills
// within the minute, so a single narrated wait usually completes the batch
// instead of failing the analysis. Hourly/daily limits rethrow immediately —
// no wait we are willing to impose can help those.
async function getJsonWithResume(
  url: string,
  params: Record<string, string>,
  signal: AbortSignal | undefined,
  onPace?: (seconds: number) => void,
): Promise<unknown> {
  try {
    return await getJson(url, params, signal)
  } catch (e) {
    if (!(e instanceof OpenMeteoRateLimited) || e.scope !== 'minutely') throw e
    onPace?.(e.retryAfterS)
    await abortableSleep(e.retryAfterS * 1000, signal)
    return await getJson(url, params, signal)
  }
}

// Port of weather.fetch_weather_batch: cache first, then paced fetches for
// the misses; any batch failure fails the whole fetch, unlike best-effort
// AQI. What the failure MEANS is the caller's decision, via the error class.
export async function fetchWeather(
  destinations: readonly Coordinate[],
  startMs: number,
  endMs: number,
  {
    signal,
    onProgress,
    onPartial,
    onPace,
    model,
    nowMs = Date.now(),
    windowLimits = FALLBACK_WINDOW_LIMITS,
    terrainElevation = false,
  }: FetchWeatherOptions,
): Promise<WeatherResult[]> {
  if (destinations.length === 0) return []

  // Which endpoint answers, decided once for the whole fetch so the URLs, the
  // `models=` decision and the cache key cannot disagree. A window crossing the
  // archive boundary is two requests per batch, joined per location before the
  // aggregation runs; `source` is part of the cache key, so its joined series is
  // a third answer at the same coordinates rather than either half.
  const source = windowSource(startMs, endMs, nowMs, windowLimits)
  const spans = fetchSpans(startMs, endMs, nowMs, windowLimits)

  const results: WeatherResult[] = new Array(destinations.length).fill(null)
  // Which entries of `results` are answers. A cache hit is settled the moment
  // it is read; a miss becomes settled when its batch lands.
  const settled: boolean[] = new Array(destinations.length).fill(false)
  const missIdx: number[] = []
  destinations.forEach((c, i) => {
    const hit = cacheGet(
      cacheKey('weather', c, startMs, endMs, model, terrainElevation, source),
    )
    if (hit === undefined) missIdx.push(i)
    else {
      results[i] = hit === NO_DATA ? null : (hit as WeatherResult)
      settled[i] = true
    }
  })
  const misses = missIdx.map((i) => destinations[i])
  let processed = destinations.length - misses.length
  if (processed > 0) onProgress?.(processed, destinations.length)
  if (misses.length === 0) return results

  const chunks = chunked(misses, BATCH_SIZE)
  // Where each chunk's rows belong in `results`. The chunks are contiguous
  // slices of `misses`, and `missIdx` is what maps a miss back to its
  // destination, so this is the one place the two are lined up.
  const chunkStart: number[] = []
  for (let i = 0, at = 0; i < chunks.length; i++) {
    chunkStart.push(at)
    at += chunks[i].length
  }

  const tasks = chunks.map((chunk, chunkIndex) => async (): Promise<WeatherResult[]> => {
    const perSpan: HourlyPayload[][] = []
    for (const span of spans) {
      // Fifteen variables, not the backend's fourteen: the browser also asks
      // for wind direction, which only the map's playback arrows use. The count
      // is read off the list rather than written again, because the two must
      // move together and the weight is what a drift would silently get wrong.
      // At fifteen the factor is 1.5 — max(1, vars x models/10) — where every
      // set before the level temperatures (#443) rode inside the floor of 1.
      // The model count is spelled here rather than defaulted, because this is
      // where `models=` is built: a request naming more than one model returns
      // a series per model and costs that multiple.
      //
      // One acquire per SPAN, each priced on its own hours: two requests are two
      // answers, so a spanning window spends twice, and pricing it on the whole
      // window would bill the archive half's months for the forecast half too.
      await weatherBudget.acquire(
        callWeight(chunk.length, span.startMs, span.endMs, HOURLY_VARIABLES.length, 1),
        signal,
        onPace,
      )
      const data = await getJsonWithResume(
        span.archive ? ARCHIVE_URL : FORECAST_URL,
        {
          ...coordParams(chunk),
          // The model is named on the forecast endpoint and NEVER on the archive.
          // The archive's default is a reanalysis — one dataset at every location,
          // so nothing varies row to row the way `best_match` would — and it
          // accepts an unknown `models=` with a 200 and plausible data (measured
          // 2026-09-12), so forwarding the picker's model there would be answered
          // silently by something else.
          ...(span.archive ? {} : { models: model }),
          hourly: HOURLY_VARIABLES.join(','),
          // Whole seconds rather than ISO text. See `parseTs` for the
          // measurement and for why the string arm stays.
          timeformat: 'unixtime',
          temperature_unit: 'fahrenheit',
          wind_speed_unit: 'mph',
          precipitation_unit: 'inch',
          start_hour: utcHour(span.startMs),
          end_hour: utcHour(span.endMs),
          timezone: 'UTC',
        },
        signal,
        onPace,
      )
      const items = asItems(data)
      if (items.length !== chunk.length) {
        // The counts go to the console because they are the only instrument
        // anyone has for a fault that reproduces in the wild, and they stay
        // off screen because a reader cannot act on them. The batch is
        // unusable either way: the rows no longer line up with the
        // coordinates that asked for them.
        console.warn(
          `[bluebird-forecast] Open-Meteo returned ${items.length} results for ${chunk.length} locations`,
        )
        throw new OpenMeteoBadBody(BAD_BODY_MESSAGE)
      }
      perSpan.push(items)
    }
    const chunkResults = chunk.map((_c, j): WeatherResult => {
      const item = joinHours(perSpan.map((items) => items[j]))
      const elevationFt =
        chunk[j].elevation_ft ??
        (terrainElevation && typeof item.elevation === 'number'
          ? item.elevation / FT_TO_M
          : null)
      const metrics = weatherMetrics(item, startMs, endMs, elevationFt)
      if (metrics === null) return null
      const series = weatherSeries(item, startMs, endMs, elevationFt)
      const bearings = series && windDirectionSeries(item, startMs, endMs)
      return {
        ...metrics,
        series: series && (bearings ? { ...series, wind_dir_deg: bearings } : series),
      }
    })
    processed += chunk.length
    onProgress?.(processed, destinations.length)
    // Land this batch in the full-length array before announcing it, so the
    // caller sees rows rather than a count (#337, finding 2). The same writes
    // used to happen after every batch had returned; doing them here is the
    // whole change, because each index is written exactly once either way.
    if (onPartial) {
      chunkResults.forEach((r, j) => {
        const at = missIdx[chunkStart[chunkIndex] + j]
        results[at] = r
        settled[at] = true
      })
      onPartial([...results], [...settled])
    }
    return chunkResults
  })

  const perChunk = await pooled(tasks, MAX_CONCURRENT_BATCHES, signal)
  const fetched = perChunk.flat()
  fetched.forEach((r, j) => {
    cachePut(
      cacheKey('weather', misses[j], startMs, endMs, model, terrainElevation, source),
      r ?? NO_DATA,
    )
  })
  missIdx.forEach((i, j) => {
    results[i] = fetched[j]
  })
  return results
}

export interface FetchAqiOptions {
  signal?: AbortSignal
  // Injectable so tests can pin the horizon clamp.
  nowMs?: number
  // How far ahead air quality reaches, from /api/capabilities. Omitted means
  // the compiled fallback, which is the pre-fetch state (#393).
  aqiForecastDays?: number
}

// Port of air_quality.fetch_aqi_batch: best-effort by design. Any failure —
// network, HTTP, a miscounted response — degrades to nulls and never throws
// (an AbortError still propagates so cancel works). The first rate limit
// short-circuits every remaining batch: once the AQI quota is spent, more
// requests only burn budget to learn the same thing (the incident's zombie
// AQI batches drained the next minute's budget exactly that way). AQI never
// waits out a minutely limit either — it is supplementary, and delaying the
// ranked results a minute for a display column would invert its priority.
export async function fetchAqi(
  destinations: readonly Coordinate[],
  startMs: number,
  endMs: number,
  {
    signal,
    nowMs = Date.now(),
    aqiForecastDays = FALLBACK_AQI_FORECAST_DAYS,
  }: FetchAqiOptions = {},
): Promise<AqiResult[]> {
  if (destinations.length === 0) return []

  // Clamp to the CAMS horizon; a window entirely beyond it skips the fetch.
  // The cap ends at 23:00 on the day the horizon names, which is where the
  // whole-day request this replaced already ended, so the clamp keeps its old
  // reach exactly. Both bounds are ISO hour strings, so the lexical
  // comparisons below order them the same way the dates did.
  const endCap = `${utcDate(nowMs + aqiForecastDays * 86_400_000)}T23:00`
  const reqStart = utcHour(startMs)
  const reqEnd = utcHour(endMs) < endCap ? utcHour(endMs) : endCap
  if (reqStart > reqEnd) return destinations.map(() => null)

  const results: AqiResult[] = new Array(destinations.length).fill(null)
  const missIdx: number[] = []
  destinations.forEach((c, i) => {
    const hit = cacheGet(cacheKey('aqi', c, startMs, endMs))
    if (hit === undefined) missIdx.push(i)
    else results[i] = hit === NO_DATA ? null : (hit as AqiResult)
  })
  const misses = missIdx.map((i) => destinations[i])
  if (misses.length === 0) return results

  let rateLimited = false
  const chunks = chunked(misses, BATCH_SIZE)
  const tasks = chunks.map((chunk) => async (): Promise<{
    rows: AqiResult[]
    cacheable: boolean
  }> => {
    if (rateLimited) return { rows: chunk.map(() => null), cacheable: false }
    try {
      await aqiBudget.acquire(callWeight(chunk.length, startMs, endMs, 1), signal)
      const data = await getJson(
        AIR_QUALITY_URL,
        {
          ...coordParams(chunk),
          hourly: 'us_aqi',
          timeformat: 'unixtime',
          start_hour: reqStart,
          end_hour: reqEnd,
          timezone: 'UTC',
        },
        signal,
      )
      const items = asItems(data)
      if (items.length !== chunk.length) {
        return { rows: chunk.map(() => null), cacheable: false }
      }
      return {
        rows: items.map((item): AqiResult => {
          const metrics = aqiMetrics(item, startMs, endMs)
          if (metrics === null) return null
          return { ...metrics, series: aqiSeries(item, startMs, endMs) }
        }),
        cacheable: true,
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      if (e instanceof OpenMeteoRateLimited) rateLimited = true
      return { rows: chunk.map(() => null), cacheable: false }
    }
  })

  const perChunk = await pooled(tasks, MAX_CONCURRENT_BATCHES, signal)
  let offset = 0
  for (const { rows, cacheable } of perChunk) {
    rows.forEach((r, k) => {
      const missPosition = offset + k
      // Only real answers are cached; a failed or skipped chunk's nulls mean
      // "unknown", and freezing an outage into the TTL would hide AQI for 15
      // minutes after the quota recovers.
      if (cacheable) {
        cachePut(cacheKey('aqi', misses[missPosition], startMs, endMs), r ?? NO_DATA)
      }
      results[missIdx[missPosition]] = r
    })
    offset += rows.length
  }
  return results
}
