// Client-side Open-Meteo fetching: the browser spends its own free-tier
// quota (~10k calls/day per IP, CORS-open) instead of the server's, so
// organic traffic scales with visitors' IPs rather than the one egress IP
// every analysis used to share (#170). The arithmetic it runs on each answer
// is the vector-pinned port in `openMeteoAggregate.ts`, the per-location cache
// is in `forecastStore.ts`, and the failures it throws are in
// `openMeteoErrors.ts`; this module is the HTTP client and the pacing.

import {
  FALLBACK_WINDOW_LIMITS,
  HOUR_MS,
  archiveBoundaryMs,
  windowSource,
  type WindowLimits,
} from './forecastWindow'
import type { Transport } from './apiFetch'
import {
  NO_DATA,
  cacheGet,
  cacheKey,
  cachePut,
  enterForecastScratch,
  leaveForecastScratch,
  resetForecastCache,
} from './forecastStore'
import {
  CLOUD_VARIABLES,
  FT_TO_M,
  HOURLY_VARIABLES,
  aqiMetrics,
  aqiSeries,
  at,
  cloudMetrics,
  cloudSeries,
  joinHours,
  parseTs,
  roundOrNull,
  weatherMetrics,
  weatherSeries,
  type AqiAggregates,
  type AqiSeries,
  type CloudAggregates,
  type CloudSeries,
  type HourlyPayload,
  type WeatherAggregates,
  type WeatherSeries,
} from './openMeteoAggregate'
import {
  BAD_BODY_MESSAGE,
  OpenMeteoBadBody,
  OpenMeteoHttpError,
  OpenMeteoModelCoverage,
  OpenMeteoRateLimited,
  OpenMeteoUnreachable,
} from './openMeteoErrors'

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


// Test hook: budgets and cache are module state that must not leak between
// unit tests.
export function resetOpenMeteoState(): void {
  resetForecastCache()
  weatherBudget = new WeightedBudget(CLIENT_WEIGHT_PER_MINUTE)
  aqiBudget = new WeightedBudget(CLIENT_WEIGHT_PER_MINUTE)
  readerBudgets = null
}

// The reader's own budgets while the tutorial (#536) runs, or null. Its demo
// analysis spends a fresh pair and an empty cache, so a demo forecast can never
// answer a real analysis, and the demo never waits on quota the reader spent.
let readerBudgets: { weather: WeightedBudget; aqi: WeightedBudget } | null = null

/** Set the reader's budgets and forecasts aside until `leaveScratch`. */
export function enterScratch(): void {
  if (readerBudgets) return
  readerBudgets = { weather: weatherBudget, aqi: aqiBudget }
  weatherBudget = new WeightedBudget(CLIENT_WEIGHT_PER_MINUTE)
  aqiBudget = new WeightedBudget(CLIENT_WEIGHT_PER_MINUTE)
  enterForecastScratch()
}

/** Put the reader's budgets and forecasts back, and drop the demo's. */
export function leaveScratch(): void {
  if (!readerBudgets) return
  weatherBudget = readerBudgets.weather
  aqiBudget = readerBudgets.aqi
  readerBudgets = null
  leaveForecastScratch()
}

// Null means the network, for the reason `setApiTransport` gives.
let transport: Transport | null = null

/** Answer every Open-Meteo request from `next` until it is set back to null. */
export function setOpenMeteoTransport(next: Transport | null): void {
  transport = next
}

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
export type CloudResult = (CloudAggregates & { series: CloudSeries | null }) | null

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
    const res = await (transport ? transport(`${url}?${qs}`, { signal }) : fetch(`${url}?${qs}`, { signal }))
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

export type FetchCloudOptions = Pick<
  FetchWeatherOptions,
  'signal' | 'onPace' | 'model' | 'nowMs' | 'windowLimits' | 'terrainElevation'
>

// The cloud column (#117): the weather fetch's twin over the same endpoints,
// spans, pacer and cache, asking for the cloud variables alone. A request of
// its own rather than twelve more variables on the weather one, because the
// price of a request follows its variable count and only an analysis that
// ranks or bounds by a cloud metric needs these.
//
// Fails the way the weather fetch fails: it is only ever called because the
// reader asked for a cloud metric, and a ranking by cloud with no cloud in it
// is not a ranking.
export async function fetchCloud(
  destinations: readonly Coordinate[],
  startMs: number,
  endMs: number,
  {
    signal,
    onPace,
    model,
    nowMs = Date.now(),
    windowLimits = FALLBACK_WINDOW_LIMITS,
    terrainElevation = false,
  }: FetchCloudOptions,
): Promise<CloudResult[]> {
  if (destinations.length === 0) return []
  const source = windowSource(startMs, endMs, nowMs, windowLimits)
  const spans = fetchSpans(startMs, endMs, nowMs, windowLimits)

  const results: CloudResult[] = new Array(destinations.length).fill(null)
  const missIdx: number[] = []
  destinations.forEach((c, i) => {
    const hit = cacheGet(cacheKey('cloud', c, startMs, endMs, model, terrainElevation, source))
    if (hit === undefined) missIdx.push(i)
    else results[i] = hit === NO_DATA ? null : (hit as CloudResult)
  })
  const misses = missIdx.map((i) => destinations[i])
  if (misses.length === 0) return results

  const tasks = chunked(misses, BATCH_SIZE).map((chunk) => async (): Promise<CloudResult[]> => {
    const perSpan: HourlyPayload[][] = []
    for (const span of spans) {
      // Twelve variables at one model: factor 1.2, spent on the WEATHER
      // budget, because Open-Meteo meters per service and this is the weather
      // endpoint. Read off the list, for the reason the weather fetch reads its
      // own count off `HOURLY_VARIABLES`.
      await weatherBudget.acquire(
        callWeight(chunk.length, span.startMs, span.endMs, CLOUD_VARIABLES.length, 1),
        signal,
        onPace,
      )
      const data = await getJsonWithResume(
        span.archive ? ARCHIVE_URL : FORECAST_URL,
        {
          ...coordParams(chunk),
          ...(span.archive ? {} : { models: model }),
          hourly: CLOUD_VARIABLES.join(','),
          timeformat: 'unixtime',
          // No temperature_unit: the 2 m pair arrives in Celsius, the unit
          // Espy's rule is stated in.
          start_hour: utcHour(span.startMs),
          end_hour: utcHour(span.endMs),
          timezone: 'UTC',
        },
        signal,
        onPace,
      )
      const items = asItems(data)
      if (items.length !== chunk.length) throw new OpenMeteoBadBody(BAD_BODY_MESSAGE)
      perSpan.push(items)
    }
    return chunk.map((_c, j): CloudResult => {
      const item = joinHours(
        perSpan.map((items) => items[j]),
        CLOUD_VARIABLES,
      )
      const elevationFt =
        chunk[j].elevation_ft ??
        (terrainElevation && typeof item.elevation === 'number' ? item.elevation / FT_TO_M : null)
      const metrics = cloudMetrics(item, startMs, endMs, elevationFt)
      if (metrics === null) return null
      return { ...metrics, series: cloudSeries(item, startMs, endMs, elevationFt) }
    })
  })

  const fetched = (await pooled(tasks, MAX_CONCURRENT_BATCHES, signal)).flat()
  fetched.forEach((r, j) => {
    cachePut(cacheKey('cloud', misses[j], startMs, endMs, model, terrainElevation, source), r ?? NO_DATA)
    results[missIdx[j]] = r
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
