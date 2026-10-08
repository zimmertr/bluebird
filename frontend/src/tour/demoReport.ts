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
  /** The freezing level over the window, in feet, lowest and highest hour. */
  freeze: [number, number]
  /** New snow over the window, in inches: at most ten times the precipitation. */
  snowfall: number
}

const SUMMITS: Summit[] = [
  { name: 'Mount Baker', latitude: 48.7768, longitude: -121.8144, elevation_ft: 10781, precip: 0, temp: [21, 34], wind: [12, 26], aqi: [18, 24], freeze: [9800, 11400], snowfall: 0 },
  { name: 'Glacier Peak', latitude: 48.1125, longitude: -121.1138, elevation_ft: 10541, precip: 0.02, temp: [24, 36], wind: [10, 22], aqi: [22, 31], freeze: [10000, 11600], snowfall: 0.2 },
  { name: 'Mount Stuart', latitude: 47.4751, longitude: -120.9026, elevation_ft: 9415, precip: 0, temp: [31, 47], wind: [8, 15], aqi: [35, 52], freeze: [10400, 12000], snowfall: 0 },
  { name: 'Mount Adams', latitude: 46.2024, longitude: -121.4909, elevation_ft: 12281, precip: 0.11, temp: [19, 30], wind: [18, 34], aqi: [58, 96], freeze: [9600, 11200], snowfall: 1.1 },
  { name: 'Mount St. Helens', latitude: 46.1914, longitude: -122.1956, elevation_ft: 8363, precip: 0.24, temp: [33, 44], wind: [14, 29], aqi: [71, 118], freeze: [9900, 11500], snowfall: 0.6 },
]

export function demoReport(now = Date.now()): DemoReport {
  // Two days out, 6 AM to 6 PM local, so the window is inside every model's
  // reach and reads as a plan rather than a record.
  const start = new Date(now)
  start.setDate(start.getDate() + 2)
  start.setHours(6, 0, 0, 0)
  const startMs = start.getTime()
  const endMs = startMs + (HOURS - 1) * HOUR_MS
  const times = Array.from({ length: HOURS }, (_, i) => startMs + i * HOUR_MS)

  const universe = SUMMITS.map((s) => {
    const temp = ramp(s.temp[0], s.temp[1])
    const wind = ramp(s.wind[0], s.wind[1])
    const aqi = ramp(s.aqi[0], s.aqi[1])
    const perHour = s.precip / HOURS
    const snowPerHour = s.snowfall / HOURS
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
      // Every default column carries a number, so the popup and the table
      // show what a real report shows rather than N/A where the model
      // publishes a value.
      freeze_min_ft: s.freeze[0],
      freeze_max_ft: s.freeze[1],
      freeze_avg_ft: Math.round((s.freeze[0] + s.freeze[1]) / 2),
      snowfall_total_in: s.snowfall,
      snowfall_avg_in_hr: Math.round(snowPerHour * 1000) / 1000,
      snowfall_min_in_hr: 0,
      snowfall_max_in_hr: Math.round(snowPerHour * 4 * 1000) / 1000,
      series: series({
        precip_in: times.map((_, i) => (i % 4 === 3 ? Math.round(perHour * 4 * 1000) / 1000 : 0)),
        temp_f: temp,
        wind_mph: wind,
        freeze_ft: ramp(s.freeze[0], s.freeze[1]).map(Math.round),
        snowfall_in: times.map((_, i) => (i % 4 === 3 ? Math.round(snowPerHour * 4 * 1000) / 1000 : 0)),
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
