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

// Thrown for any failure reaching Open-Meteo itself (network, CORS, HTTP,
// malformed counts). useAnalyze treats this class — and only this class — as
// "fall back to the server analysis".
export class OpenMeteoUnreachable extends Error {}

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
// order. The first rejection wins and the shared signal stops the rest.
async function pooled<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results = new Array<T>(tasks.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < tasks.length) {
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

async function getJson(
  url: string,
  params: Record<string, string>,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const qs = new URLSearchParams(params).toString()
  // Network-level failures (offline, DNS, a blocked CORS preflight) reject
  // the fetch promise with a TypeError rather than returning a response —
  // that is the primary "corporate network" case the server fallback exists
  // for, so it must map to OpenMeteoUnreachable exactly like an HTTP error.
  // Only a user cancel passes through untranslated.
  try {
    const res = await fetch(`${url}?${qs}`, { signal })
    if (!res.ok) {
      throw new OpenMeteoUnreachable(`Open-Meteo returned HTTP ${res.status}`)
    }
    return await res.json()
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
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
}

// Port of weather.fetch_weather_batch: any batch failure fails the whole
// fetch (the caller falls back to the server path), unlike best-effort AQI.
export async function fetchWeather(
  destinations: readonly Coordinate[],
  startMs: number,
  endMs: number,
  { signal, onProgress }: FetchWeatherOptions = {},
): Promise<WeatherResult[]> {
  if (destinations.length === 0) return []
  const chunks = chunked(destinations, BATCH_SIZE)
  let processed = 0

  const tasks = chunks.map((chunk) => async (): Promise<WeatherResult[]> => {
    const data = await getJson(
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
    )
    const items = asItems(data)
    if (items.length !== chunk.length) {
      throw new OpenMeteoUnreachable(
        `Open-Meteo returned ${items.length} results for ${chunk.length} locations`,
      )
    }
    const results = items.map((item): WeatherResult => {
      const metrics = weatherMetrics(item, startMs, endMs)
      if (metrics === null) return null
      return { ...metrics, series: weatherSeries(item, startMs, endMs) }
    })
    processed += chunk.length
    onProgress?.(processed, destinations.length)
    return results
  })

  const perChunk = await pooled(tasks, MAX_CONCURRENT_BATCHES)
  return perChunk.flat()
}

export interface FetchAqiOptions {
  signal?: AbortSignal
  // Injectable so tests can pin the ~5-day horizon clamp.
  nowMs?: number
}

// Port of air_quality.fetch_aqi_batch: best-effort by design. Any failure —
// network, HTTP, a miscounted response — degrades to nulls and never throws
// (an AbortError still propagates so cancel works).
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

  const chunks = chunked(destinations, BATCH_SIZE)
  const tasks = chunks.map((chunk) => async (): Promise<AqiResult[]> => {
    try {
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
      if (items.length !== chunk.length) return chunk.map(() => null)
      return items.map((item): AqiResult => {
        const metrics = aqiMetrics(item, startMs, endMs)
        if (metrics === null) return null
        return { ...metrics, series: aqiSeries(item, startMs, endMs) }
      })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e
      return chunk.map(() => null)
    }
  })

  const perChunk = await pooled(tasks, MAX_CONCURRENT_BATCHES)
  return perChunk.flat()
}
