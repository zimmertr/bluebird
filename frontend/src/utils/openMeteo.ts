// Client-side Open-Meteo fetching: the browser spends its own free-tier
// quota (~10k calls/day per IP, CORS-open) instead of the server's, so
// organic traffic scales with visitors' IPs rather than the one egress IP
// every analysis used to share (#170). The aggregation here is a deliberate
// PORT of backend weather.py / air_quality.py — the shared vectors in
// weather_vectors.json pin both implementations to identical outputs, and
// tests on both sides fail if either drifts. Change semantics there first,
// regenerate the vectors, and mirror the change here.

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
export const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality'

// Same batching the backend uses: 50 locations per request, at most 4
// requests in flight. One browser analyzing is exactly as polite to
// Open-Meteo as the server was.
const BATCH_SIZE = 50
const MAX_CONCURRENT_BATCHES = 4

// The CAMS air-quality model publishes ~5 days; requesting past that 400s.
const AQI_MAX_FORECAST_DAYS = 5

// Thrown only for failures that mean the browser genuinely cannot talk to
// Open-Meteo: network errors, DNS, a blocked CORS preflight, malformed
// responses. useAnalyze treats this class — and only this class — as "fall
// back to the server analysis", because a different network path can help
// with exactly these. It must NEVER cover HTTP 429: rate limiting means the
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
// is one call, times max(1, days/14) x max(1, vars/10). Mirror of
// backend/app/services/openmeteo_weight.py — keep them in sync.
export function callWeight(
  nLocations: number,
  startMs: number,
  endMs: number,
  nVariables: number,
): number {
  const days = Math.max(
    1,
    Math.floor((Date.parse(utcDate(endMs)) - Date.parse(utcDate(startMs))) / 86_400_000) + 1,
  )
  return nLocations * Math.max(1, days / 14) * Math.max(1, nVariables / 10)
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

function cacheKey(
  service: 'weather' | 'aqi',
  c: Coordinate,
  startMs: number,
  endMs: number,
): string {
  return `${service}|${c.latitude}|${c.longitude}|${startMs}|${endMs}`
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
  if (forecastCache.size > CACHE_MAX_ENTRIES) {
    for (const oldest of forecastCache.keys()) {
      forecastCache.delete(oldest)
      if (forecastCache.size <= CACHE_MAX_ENTRIES) break
    }
  }
}

// Test hook: budgets and cache are module state that must not leak between
// unit tests.
export function resetOpenMeteoState(): void {
  forecastCache.clear()
  weatherBudget = new WeightedBudget(CLIENT_WEIGHT_PER_MINUTE)
  aqiBudget = new WeightedBudget(CLIENT_WEIGHT_PER_MINUTE)
}

// ── Parity primitives ──────────────────────────────────────────────────────

// Python's round() is round-half-even; Math.round is round-half-up. The
// decimal shift below is exact for the boundary values that matter (x.25,
// x.5 — exactly representable doubles), and for everything else it agrees
// with Python except in astronomically rare double-representation edge
// cases the vectors deliberately avoid.
export function roundHalfEven(v: number, digits: number): number {
  if (!Number.isFinite(v)) return v
  const factor = 10 ** digits
  const shifted = v * factor
  const floor = Math.floor(shifted)
  const diff = shifted - floor
  let rounded: number
  if (diff > 0.5) rounded = floor + 1
  else if (diff < 0.5) rounded = floor
  else rounded = floor % 2 === 0 ? floor : floor + 1
  return rounded / factor
}

// Open-Meteo returns naive-UTC "YYYY-MM-DDTHH:MM" stamps (we request
// timezone=UTC). A bare `new Date(...)` would read those as LOCAL time, so
// re-stamp UTC before parsing — the exact counterpart of the backend's
// parse-then-treat-as-UTC (`_parse_ts` + `_epoch_ms`).
export function parseTs(s: unknown): number | null {
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
  precip_max_in_hr: number
  temp_min_f: number
  temp_max_f: number
  temp_avg_f: number
  wind_min_mph: number
  wind_max_mph: number
  wind_avg_mph: number
}

export interface WeatherSeries {
  times: number[]
  precip_in: (number | null)[]
  temp_f: (number | null)[]
  wind_mph: (number | null)[]
}

interface HourlyPayload {
  hourly?: {
    time?: unknown[]
    precipitation?: (number | null)[]
    temperature_2m?: (number | null)[]
    wind_speed_10m?: (number | null)[]
    us_aqi?: (number | null)[]
  }
}

// Port of weather._metrics: an hour missing ANY metric is dropped entirely,
// and the loop stops at the shortest array (Python zip semantics) — unlike
// the series below, which is times-driven. Malformed payloads degrade to
// null, never throw.
export function weatherMetrics(
  payload: HourlyPayload,
  startMs: number,
  endMs: number,
): WeatherAggregates | null {
  try {
    const hourly = payload?.hourly ?? {}
    const times = hourly.time ?? []
    const precip = hourly.precipitation ?? []
    const temp = hourly.temperature_2m ?? []
    const wind = hourly.wind_speed_10m ?? []

    const n = Math.min(times.length, precip.length, temp.length, wind.length)
    const rows: Array<[number, number, number]> = []
    for (let i = 0; i < n; i++) {
      const t = parseTs(times[i])
      if (t === null || t < startMs || t > endMs) continue
      const p = precip[i]
      const tf = temp[i]
      const w = wind[i]
      if (p == null || tf == null || w == null) continue
      rows.push([p, tf, w])
    }
    if (rows.length === 0) return null

    // Left-to-right sums in input order, matching Python's sum() exactly.
    let pSum = 0
    let tSum = 0
    let wSum = 0
    let pMax = -Infinity
    let tMin = Infinity
    let tMax = -Infinity
    let wMin = Infinity
    let wMax = -Infinity
    for (const [p, tf, w] of rows) {
      pSum += p
      tSum += tf
      wSum += w
      if (p > pMax) pMax = p
      if (tf < tMin) tMin = tf
      if (tf > tMax) tMax = tf
      if (w < wMin) wMin = w
      if (w > wMax) wMax = w
    }
    const len = rows.length
    return {
      precip_total_in: roundHalfEven(pSum, 4),
      precip_avg_in_hr: roundHalfEven(pSum / len, 4),
      precip_max_in_hr: roundHalfEven(pMax, 4),
      temp_min_f: roundHalfEven(tMin, 1),
      temp_max_f: roundHalfEven(tMax, 1),
      temp_avg_f: roundHalfEven(tSum / len, 1),
      wind_min_mph: roundHalfEven(wMin, 1),
      wind_max_mph: roundHalfEven(wMax, 1),
      wind_avg_mph: roundHalfEven(wSum / len, 1),
    }
  } catch {
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
): WeatherSeries | null {
  try {
    const hourly = payload?.hourly ?? {}
    const times = hourly.time ?? []
    const precip = hourly.precipitation ?? []
    const temp = hourly.temperature_2m ?? []
    const wind = hourly.wind_speed_10m ?? []

    const grid: number[] = []
    const pOut: (number | null)[] = []
    const tOut: (number | null)[] = []
    const wOut: (number | null)[] = []
    for (let i = 0; i < times.length; i++) {
      const t = parseTs(times[i])
      if (t === null || t < startMs || t > endMs) continue
      grid.push(t)
      pOut.push(roundOrNull(at(precip, i), 4))
      tOut.push(roundOrNull(at(temp, i), 1))
      wOut.push(roundOrNull(at(wind, i), 1))
    }
    if (grid.length === 0) return null
    return { times: grid, precip_in: pOut, temp_f: tOut, wind_mph: wOut }
  } catch {
    return null
  }
}

export interface AqiAggregates {
  aqi_avg: number
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
    let max = -Infinity
    for (const v of vals) {
      sum += v
      if (v > max) max = v
    }
    return {
      aqi_avg: roundHalfEven(sum / vals.length, 0),
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
  // the fact that makes the wait make sense; "the weather service has used up
  // its quota" described an outage the reader could only wait out, and invited
  // the reading that Bluebird was down. Naming Open-Meteo matters for the same
  // reason: it is the credit already docked beside the results, so the sentence
  // lands on something the reader can see rather than on an anonymous service.
  //
  // The advice to analyze a smaller area is gone. It is true of the minutely
  // bucket, which the pacer already absorbs without ever reaching this message;
  // against an exhausted daily quota a smaller area is still refused, so it
  // read as a remedy and was not one.
  const message =
    scope === 'hourly'
      ? 'You have reached your hourly Open-Meteo forecast quota. Please try again after the top of the hour.'
      : scope === 'daily' || scope === 'monthly'
      ? `You have reached your ${scope} Open-Meteo forecast quota. Please try again later.`
      : 'Open-Meteo is rate-limiting your connection. Bluebird pauses and resumes automatically; if this keeps failing, wait a minute and try again.'
  return new OpenMeteoRateLimited(message, scope, retryAfterS)
}

async function getJson(
  url: string,
  params: Record<string, string>,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const qs = new URLSearchParams(params).toString()
  // The error taxonomy the fallback decision hangs on (issue #180):
  // - fetch rejecting with a TypeError = network/DNS/CORS = genuinely
  //   unreachable from THIS browser; the server's different network path can
  //   help, so it maps to OpenMeteoUnreachable.
  // - HTTP 429 = reachable, quota spent = OpenMeteoRateLimited; a same-IP
  //   server retry cannot help and must never be triggered by it.
  // - any other HTTP status = reachable, failed = OpenMeteoHttpError; the
  //   server talks to the same upstream, so surface it honestly instead.
  // Only a user cancel passes through untranslated.
  try {
    const res = await fetch(`${url}?${qs}`, { signal })
    if (res.status === 429) throw await classify429(res)
    if (!res.ok) {
      throw new OpenMeteoHttpError(
        res.status >= 500
          ? `The weather service is having trouble on their end (HTTP ${res.status}). Try again shortly.`
          : `The weather service returned an unexpected response (HTTP ${res.status}).`,
        res.status,
      )
    }
    return await res.json()
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    if (e instanceof OpenMeteoRateLimited || e instanceof OpenMeteoHttpError) throw e
    if (e instanceof OpenMeteoUnreachable) throw e
    throw new OpenMeteoUnreachable(
      `Open-Meteo request failed: ${e instanceof Error ? e.message : String(e)}`,
    )
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
  // The pacer or a minutely resume is about to sleep this many seconds.
  onPace?: (seconds: number) => void
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
  { signal, onProgress, onPace }: FetchWeatherOptions = {},
): Promise<WeatherResult[]> {
  if (destinations.length === 0) return []

  const results: WeatherResult[] = new Array(destinations.length).fill(null)
  const missIdx: number[] = []
  destinations.forEach((c, i) => {
    const hit = cacheGet(cacheKey('weather', c, startMs, endMs))
    if (hit === undefined) missIdx.push(i)
    else results[i] = hit === NO_DATA ? null : (hit as WeatherResult)
  })
  const misses = missIdx.map((i) => destinations[i])
  let processed = destinations.length - misses.length
  if (processed > 0) onProgress?.(processed, destinations.length)
  if (misses.length === 0) return results

  const chunks = chunked(misses, BATCH_SIZE)

  const tasks = chunks.map((chunk) => async (): Promise<WeatherResult[]> => {
    await weatherBudget.acquire(
      callWeight(chunk.length, startMs, endMs, 3),
      signal,
      onPace,
    )
    const data = await getJsonWithResume(
      FORECAST_URL,
      {
        ...coordParams(chunk),
        hourly: 'precipitation,temperature_2m,wind_speed_10m',
        temperature_unit: 'fahrenheit',
        wind_speed_unit: 'mph',
        precipitation_unit: 'inch',
        start_date: utcDate(startMs),
        end_date: utcDate(endMs),
        timezone: 'UTC',
      },
      signal,
      onPace,
    )
    const items = asItems(data)
    if (items.length !== chunk.length) {
      throw new OpenMeteoUnreachable(
        `Open-Meteo returned ${items.length} results for ${chunk.length} locations`,
      )
    }
    const chunkResults = items.map((item): WeatherResult => {
      const metrics = weatherMetrics(item, startMs, endMs)
      if (metrics === null) return null
      return { ...metrics, series: weatherSeries(item, startMs, endMs) }
    })
    processed += chunk.length
    onProgress?.(processed, destinations.length)
    return chunkResults
  })

  const perChunk = await pooled(tasks, MAX_CONCURRENT_BATCHES, signal)
  const fetched = perChunk.flat()
  fetched.forEach((r, j) => {
    cachePut(cacheKey('weather', misses[j], startMs, endMs), r ?? NO_DATA)
  })
  missIdx.forEach((i, j) => {
    results[i] = fetched[j]
  })
  return results
}

export interface FetchAqiOptions {
  signal?: AbortSignal
  // Injectable so tests can pin the ~5-day horizon clamp.
  nowMs?: number
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
  { signal, nowMs = Date.now() }: FetchAqiOptions = {},
): Promise<AqiResult[]> {
  if (destinations.length === 0) return []

  // Clamp to the CAMS horizon; a window entirely beyond it skips the fetch.
  const endCap = utcDate(nowMs + AQI_MAX_FORECAST_DAYS * 86_400_000)
  const reqStart = utcDate(startMs)
  const reqEnd = utcDate(endMs) < endCap ? utcDate(endMs) : endCap
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
          start_date: reqStart,
          end_date: reqEnd,
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
