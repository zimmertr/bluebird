// The tutorial's closed world (#536): an answer to every request the demo app
// makes, so while the tutorial runs nothing leaves the browser for the pod,
// Open-Meteo, Nominatim or NIFC.
//
// Requests are matched on their endpoint and their parsed parameters, never on
// an exact URL, because the demo asks for whatever hours, bbox and batch its
// state leads to: the window is the reader's tomorrow, the fire overlay asks
// for the map's view, and the analysis batches what it found. Anything unknown
// is a 404, which each caller already handles as an unavailable service.
import type { DestinationsRequest, DiscoveredDestination } from '../types'
import type { Transport } from '../utils/apiFetch'
import { type DemoData, type RecordedHours, aqiAt, exampleFire, exampleSmoke } from './scenario'

// Long enough for a spinner and the progress card to be seen, short enough to
// keep the demo moving.
const API_DELAY_MS = 250
const WEATHER_DELAY_MS = 700

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function wait(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'))
    if (signal?.aborted) return abort()
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      abort()
    }, { once: true })
  })
}

function inRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function nearest<T extends { latitude: number; longitude: number }>(
  rows: readonly T[],
  lat: number,
  lon: number,
): T {
  let best = rows[0]
  let bestD = Infinity
  for (const row of rows) {
    const d = (row.latitude - lat) ** 2 + (row.longitude - lon) ** 2
    if (d < bestD) {
      best = row
      bestD = d
    }
  }
  return best
}

// Within about a kilometre, a coordinate is the pool peak it names: a search
// result, a map label and a pasted line each spell the same summit slightly
// differently.
const SAME_PLACE_DEG2 = 0.01 ** 2

/** `POST /api/destinations`, both the ring's discovery and the resolve of named rows. */
function destinations(demo: DemoData, body: DestinationsRequest): unknown {
  let rows: DiscoveredDestination[] = []
  if (body.polygon && body.destination_types.includes('peak')) {
    const ring = body.polygon.coordinates[0]
    rows = demo.pool.filter((d) => inRing(d.longitude, d.latitude, ring))
  }
  for (const c of body.custom_destinations ?? []) {
    const match = nearest(demo.pool, c.latitude, c.longitude)
    const same = (match.latitude - c.latitude) ** 2 + (match.longitude - c.longitude) ** 2 < SAME_PLACE_DEG2
    rows.push({
      ...(same ? match : { type: 'custom', elevation_ft: c.elevation_ft ?? null, osm_id: null, snow_depth_in: null }),
      name: c.name,
      latitude: c.latitude,
      longitude: c.longitude,
    } as DiscoveredDestination)
  }
  return {
    destinations: rows,
    total: rows.length,
    total_found: rows.length,
    truncated: false,
    snow_analysis_date: demo.snowAnalysisDate,
  }
}

/** Answers for the pod's own API. */
export function apiTransport(demo: DemoData, nowMs: number): Transport {
  return async (input, init) => {
    const url = new URL(input, 'https://demo.invalid')
    await wait(API_DELAY_MS, init?.signal)
    switch (url.pathname) {
      case '/api/capabilities':
        return json(demo.capabilities)
      case '/api/config':
        return json({})
      case '/api/geocode':
        return json(demo.geocode)
      case '/api/destinations':
        return json(destinations(demo, JSON.parse(String(init?.body ?? '{}')) as DestinationsRequest))
      case '/api/wildfires':
        return json(exampleFire(nowMs))
      case '/api/smoke':
        return json(exampleSmoke(nowMs))
      default:
        return json({ detail: 'Not Found' }, 404)
    }
  }
}

/** Every whole hour from `start_hour` to `end_hour`, as Unix seconds. */
function hoursOf(params: URLSearchParams): number[] {
  const from = Date.parse(`${params.get('start_hour')}Z`)
  const to = Date.parse(`${params.get('end_hour')}Z`)
  const out: number[] = []
  for (let t = from; t <= to; t += 3_600_000) out.push(t / 1000)
  return out
}

/**
 * A recorded answer moved onto the requested hours. Each hour takes the
 * recording's value at the same UTC hour of the day, so a morning asked for
 * is a recorded morning and the day's shape survives the move.
 */
function restamp(rec: RecordedHours, vars: string[], times: number[]): RecordedHours {
  const byHour = new Map<number, number>()
  ;(rec.hourly.time ?? []).forEach((t, i) => {
    if (t !== null) byHour.set(new Date(t * 1000).getUTCHours(), i)
  })
  const hourly: RecordedHours['hourly'] = { time: times }
  for (const v of vars) {
    const series = rec.hourly[v]
    hourly[v] = times.map((t) => {
      const i = byHour.get(new Date(t * 1000).getUTCHours())
      return series && i !== undefined ? (series[i] ?? null) : null
    })
  }
  return { ...rec, hourly }
}

/** Answers for Open-Meteo's forecast, archive and air-quality hosts. */
export function openMeteoTransport(demo: DemoData): Transport {
  return async (input, init) => {
    const url = new URL(input)
    const params = url.searchParams
    await wait(WEATHER_DELAY_MS, init?.signal)
    const lats = (params.get('latitude') ?? '').split(',').map(Number)
    const lons = (params.get('longitude') ?? '').split(',').map(Number)
    const vars = (params.get('hourly') ?? '').split(',').filter(Boolean)
    const times = hoursOf(params)
    const items = lats.map((lat, i): RecordedHours => {
      const lon = lons[i]
      if (url.hostname.startsWith('air-quality')) {
        return {
          latitude: lat,
          longitude: lon,
          hourly_units: { time: 'unixtime', us_aqi: 'USAQI' },
          hourly: { time: times, us_aqi: times.map((_t, h) => aqiAt(lat, lon, h)) },
        }
      }
      const rec = nearest(demo.weather, lat, lon)
      const recorded = vars.every((v) => v in rec.forecast.hourly) ? rec.forecast : rec.cloud
      return { ...restamp(recorded, vars, times), latitude: lat, longitude: lon }
    })
    return json(items.length === 1 ? items[0] : items)
  }
}

/** Both transports, and a way to know when the demo has stopped asking. */
export interface DemoWorld {
  api: Transport
  openMeteo: Transport
  /**
   * Resolves once no demo request is in flight and none has started for a
   * moment. The tutorial ends on it, so an answer still on its way lands in the
   * demo's cache and budgets rather than in the reader's.
   */
  settled(): Promise<void>
}

const QUIET_MS = 150

export function createDemoWorld(demo: DemoData, nowMs: number): DemoWorld {
  let inFlight = 0
  let lastSettled = 0
  const counted = (transport: Transport): Transport => async (input, init) => {
    inFlight += 1
    try {
      return await transport(input, init)
    } finally {
      inFlight -= 1
      lastSettled = performance.now()
    }
  }
  return {
    api: counted(apiTransport(demo, nowMs)),
    openMeteo: counted(openMeteoTransport(demo)),
    async settled() {
      while (inFlight > 0 || performance.now() - lastSettled < QUIET_MS) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
    },
  }
}
