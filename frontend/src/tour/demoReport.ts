import type { AnalyzedView } from '../hooks/analyzeTypes'
import { analyzedSnapshot, resultRow, series } from '../testSupport/fixtures'
import type { AnalyzeResponse, DestinationResult } from '../types'

/**
 * The report the tutorial's last step shows (#536). A first-visit tour runs
 * before any analysis, so the results sheet has nothing to frame; this is a
 * small ranked field over real Cascade summits with plausible numbers, built
 * from the one place a fake row is spelled (`testSupport/fixtures.ts`). It
 * exists only while that step is open, reaches no URL and no storage, and is
 * gone when the tour ends.
 */
export interface DemoReport {
  universe: DestinationResult[]
  response: AnalyzeResponse
  analyzed: AnalyzedView
}

const HOUR_MS = 3_600_000
/** Hours in the demonstration window: a day out, dawn to dusk. */
const HOURS = 13

/** A smooth hourly curve between two values, so the chart draws a line rather than a step. */
function ramp(from: number, to: number, n = HOURS): number[] {
  return Array.from({ length: n }, (_, i) => Math.round((from + ((to - from) * i) / (n - 1)) * 10) / 10)
}

interface Summit {
  name: string
  latitude: number
  longitude: number
  elevation_ft: number
  precip: number
  temp: [number, number]
  wind: [number, number]
  aqi: [number, number]
}

const SUMMITS: Summit[] = [
  { name: 'Mount Baker', latitude: 48.7768, longitude: -121.8144, elevation_ft: 10781, precip: 0, temp: [21, 34], wind: [12, 26], aqi: [18, 24] },
  { name: 'Glacier Peak', latitude: 48.1125, longitude: -121.1138, elevation_ft: 10541, precip: 0.02, temp: [24, 36], wind: [10, 22], aqi: [22, 31] },
  { name: 'Mount Stuart', latitude: 47.4751, longitude: -120.9026, elevation_ft: 9415, precip: 0, temp: [31, 47], wind: [8, 15], aqi: [35, 52] },
  { name: 'Mount Adams', latitude: 46.2024, longitude: -121.4909, elevation_ft: 12281, precip: 0.11, temp: [19, 30], wind: [18, 34], aqi: [58, 96] },
  { name: 'Mount St. Helens', latitude: 46.1914, longitude: -122.1956, elevation_ft: 8363, precip: 0.24, temp: [33, 44], wind: [14, 29], aqi: [71, 118] },
]

export function demoReport(now = Date.now()): DemoReport {
  // Two days out, so the window is inside every model's reach and reads as a
  // plan rather than a record.
  const startMs = Math.floor(now / HOUR_MS) * HOUR_MS + 2 * 24 * HOUR_MS + 6 * HOUR_MS
  const endMs = startMs + (HOURS - 1) * HOUR_MS
  const times = Array.from({ length: HOURS }, (_, i) => startMs + i * HOUR_MS)

  const universe = SUMMITS.map((s) => {
    const temp = ramp(s.temp[0], s.temp[1])
    const wind = ramp(s.wind[0], s.wind[1])
    const aqi = ramp(s.aqi[0], s.aqi[1])
    const perHour = s.precip / HOURS
    return resultRow({
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      elevation_ft: s.elevation_ft,
      precip_total_in: s.precip,
      precip_avg_in_hr: Math.round(perHour * 1000) / 1000,
      precip_min_in_hr: 0,
      precip_max_in_hr: Math.round(perHour * 2 * 1000) / 1000,
      temp_min_f: s.temp[0],
      temp_max_f: s.temp[1],
      temp_avg_f: Math.round(((s.temp[0] + s.temp[1]) / 2) * 10) / 10,
      wind_min_mph: s.wind[0],
      wind_max_mph: s.wind[1],
      wind_avg_mph: Math.round(((s.wind[0] + s.wind[1]) / 2) * 10) / 10,
      aqi_min: s.aqi[0],
      aqi_max: s.aqi[1],
      aqi_avg: Math.round((s.aqi[0] + s.aqi[1]) / 2),
      series: series({
        precip_in: times.map((_, i) => (i % 4 === 3 ? Math.round(perHour * 4 * 1000) / 1000 : 0)),
        temp_f: temp,
        wind_mph: wind,
        freeze_ft: ramp(9000, 11500).map(Math.round),
        aqi: aqi.map(Math.round),
      }),
    })
  })

  return {
    universe,
    response: {
      results: universe,
      total_queried: universe.length,
      total_matched: universe.length,
      times,
    },
    analyzed: analyzedSnapshot({
      sortBy: 'aqi_max',
      sortDesc: false,
      window: { startMs, endMs },
    }),
  }
}
