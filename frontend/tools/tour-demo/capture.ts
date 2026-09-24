// Captures the tutorial's demo analysis into src/tour/demoScene.json (#536).
//
// The tutorial shows a finished analysis without running one, so the rows it
// shows are recorded here once and shipped. They come from the app's own
// pipeline rather than a hand-built fixture: discovery is the pod's
// `POST /api/destinations` (the only source of snow depth), and the forecasts
// are `runClientAnalysis`, the function an Analyze click runs, so every row
// carries exactly what the browser commits, the wind bearing the player's
// arrows read included. A new column is therefore a re-capture, not an edit.
//
// Run it with `make capture-tour-demo`. It spends one discovery request and
// one batch of Open-Meteo calls.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runClientAnalysis } from '../../src/utils/clientAnalyze'
import { AQI_LIMIT_DAYS } from '../../src/utils/calendarBand'
import { FALLBACK_WINDOW_LIMITS } from '../../src/utils/forecastWindow'
import type { AnalyzeRequest, DestinationsResponse, GeoPolygon } from '../../src/types'
import type { DemoCapture } from '../../src/utils/tourScene'

const BASE = process.env.BLUEBIRD_URL ?? 'https://bluebirdforecast.com'
const MODEL = 'gfs_seamless'
const ZONE = 'America/Los_Angeles'
// Daylight hours at the peaks, which is the window a reader plans a climb in.
// Both ends are inclusive, as they are when a reader narrows the hours.
const START_HOUR = 6
const END_HOUR = 18

// The Glacier Peak and Dome Peak massifs.
const POLYGON: GeoPolygon = {
  type: 'Polygon',
  coordinates: [[[-121.25, 48.05], [-120.95, 48.05], [-120.95, 48.35], [-121.25, 48.35], [-121.25, 48.05]]],
}

// A subset of what discovery finds, chosen for a spread of elevations from
// 6,000 to 10,500 ft across the whole ring, so the colour scales and the
// elevation-adjusted wind and temperature have something to show.
const NAMES = new Set([
  'Glacier Peak', 'Disappointment Peak', 'Dome Peak', 'Clark Mountain', 'Sinister Peak',
  'Kennedy Peak', 'Tenpeak Mountain', 'Spire Point', 'Agnes Mountain', 'Gunsight Peak',
  'Plummer Mountain', 'Sitting Bull Mountain', 'Bannock Mountain', 'Mount Misch',
  'Lizard Mountain', 'Helmet Butte', 'Gamma Peak', 'Lime Mountain', 'Sulphur Mountain',
  'Fire Mountain', 'Green Mountain', 'Downey Mountain',
])

// The UTC instant of a wall-clock hour in ZONE. One correction pass is enough
// because the offset of the guess and of the answer differ only across a
// transition, and no transition falls between 06:00 and 18:00.
function zonedHour(date: string, hour: number): number {
  const guess = Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(guess))
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return guess - (wall - guess)
}

async function main() {
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: ZONE })
  const startMs = zonedHour(tomorrow, START_HOUR)
  const endMs = zonedHour(tomorrow, END_HOUR)

  const res = await fetch(`${BASE}/api/destinations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ polygon: POLYGON, destination_types: ['peak'] }),
  })
  if (!res.ok) throw new Error(`discovery answered ${res.status}`)
  const discovered = (await res.json()) as DestinationsResponse
  const candidates = discovered.destinations.filter((d) => NAMES.has(d.name))
  const missing = [...NAMES].filter((n) => !candidates.some((d) => d.name === n))
  if (missing.length > 0) throw new Error(`discovery no longer finds: ${missing.join(', ')}`)

  const request: AnalyzeRequest = {
    polygon: POLYGON,
    destination_types: ['peak'],
    start_datetime: new Date(startMs).toISOString(),
    end_datetime: new Date(endMs).toISOString(),
    forecast_model: MODEL,
    // Every row, in the pipeline's own order: the tutorial ranks and cuts the
    // demo with the reader's knobs, as it would any report.
    limit: candidates.length,
  }
  // Every metric the table can rank by is fetched, the cloud column too, so a
  // reader who opens the tutorial under any ranking sees numbers.
  const { response, universe } = await runClientAnalysis(request, candidates, startMs, endMs, {
    windowLimits: FALLBACK_WINDOW_LIMITS,
    aqiForecastDays: AQI_LIMIT_DAYS,
    cloud: true,
  })

  const capture: DemoCapture = {
    capturedAt: new Date().toISOString(),
    request,
    response,
    universe,
    snowAnalysisDate: discovered.snow_analysis_date ?? null,
  }
  const out = fileURLToPath(new URL('../../src/tour/demoScene.json', import.meta.url))
  writeFileSync(out, `${JSON.stringify(capture)}\n`)
  console.log(`${universe.length} destinations, ${response.times?.length ?? 0} hours -> ${out}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
