// Captures the tutorial's recorded answers into src/tour/demoData.json (#536).
//
// The tutorial acts an analysis out on a demo copy of the app, and every
// request that copy makes is answered from this file, so none of it leaves the
// browser. What is recorded here is what cannot be invented honestly: the
// place search's answer, discovery's rows (the only source of elevation and
// snow depth), the deployment's limits, and Open-Meteo's hourly weather for
// every peak the demo can reach. The weather is re-stamped onto whatever hours
// the demo asks for when it replays. Air quality, the fire and the smoke are
// the scenario's own and are made in `src/tour/scenario.ts`, not here.
//
// The weather is fetched through the app's own `fetchWeather` and
// `fetchCloud`, with a transport that keeps each answer, so the recorded
// request is exactly the one the demo will make. A new variable is therefore a
// re-capture, not an edit.
//
// Run it with `make capture-tour-demo`. It spends one discovery request, one
// place search, and two Open-Meteo calls of 22 locations.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fetchCloud, fetchWeather, setOpenMeteoTransport } from '../../src/utils/openMeteo'
import { FALLBACK_WINDOW_LIMITS } from '../../src/utils/forecastWindow'
import type { DestinationsResponse } from '../../src/types'
import {
  DEMO_MODEL,
  POOL_NAMES,
  POOL_POLYGON,
  SEARCH_QUERY,
  type DemoData,
  type RecordedHours,
} from '../../src/tour/scenario'

const BASE = process.env.BLUEBIRD_URL ?? 'https://bluebirdforecast.com'
// A full day from the next midnight UTC, which covers any 13-hour window a
// reader in any zone can pick for tomorrow once it is re-stamped.
const HOURS = 24

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) throw new Error(`${path} answered ${res.status}`)
  return (await res.json()) as T
}

async function main() {
  const capabilities = await json<unknown>('/api/capabilities')
  const geocode = await json<DemoData['geocode']>(
    `/api/geocode?limit=5&q=${encodeURIComponent(SEARCH_QUERY)}`,
  )
  if (geocode.length < 2) throw new Error('the place search must answer with a menu, not one place')

  const discovered = await json<DestinationsResponse>('/api/destinations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ polygon: POOL_POLYGON, destination_types: ['peak'] }),
  })
  const pool = discovered.destinations.filter((d) => POOL_NAMES.includes(d.name))
  const missing = POOL_NAMES.filter((n) => !pool.some((d) => d.name === n))
  if (missing.length > 0) throw new Error(`discovery no longer finds: ${missing.join(', ')}`)

  // Every answer the two fetches get, in order. Both batch the whole pool
  // into one request, so each list holds one body with one item per peak.
  const bodies: unknown[] = []
  setOpenMeteoTransport(async (url, init) => {
    const res = await fetch(url, init)
    bodies.push(await res.clone().json())
    return res
  })
  const midnight = Math.ceil(Date.now() / 86_400_000) * 86_400_000
  const startMs = midnight
  const endMs = midnight + (HOURS - 1) * 3_600_000
  const opts = { model: DEMO_MODEL, windowLimits: FALLBACK_WINDOW_LIMITS }
  await fetchWeather(pool, startMs, endMs, opts)
  const forecast = bodies.splice(0) as RecordedHours[][]
  await fetchCloud(pool, startMs, endMs, opts)
  const cloud = bodies.splice(0) as RecordedHours[][]
  if (forecast.length !== 1 || cloud.length !== 1) throw new Error('expected one batch per service')

  const data: DemoData = {
    capturedAt: new Date().toISOString(),
    capabilities,
    geocode,
    pool,
    snowAnalysisDate: discovered.snow_analysis_date ?? null,
    weather: pool.map((d, i) => ({
      latitude: d.latitude,
      longitude: d.longitude,
      forecast: forecast[0][i],
      cloud: cloud[0][i],
    })),
  }
  const out = fileURLToPath(new URL('../../src/tour/demoData.json', import.meta.url))
  writeFileSync(out, `${JSON.stringify(data)}\n`)
  console.log(`${pool.length} peaks, ${geocode.length} search results -> ${out}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
