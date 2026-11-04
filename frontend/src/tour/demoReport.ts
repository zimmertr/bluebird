import type { AnalyzedView } from '../hooks/analyzeTypes'
import { CLOUD_DECK_CEILING_FT } from '../utils/openMeteoAggregate'
import { analyzedSnapshot, resultRow, series } from '../testSupport/fixtures'
import type { AnalyzeResponse, DestinationResult } from '../types'
import { roundTo } from '../utils/numbers'
import { HOUR_MS } from '../utils/forecastWindow'

/**
 * The report the tutorial's last step shows (#536). A first-visit tour runs
 * before any analysis, so the results sheet has nothing to frame; this is a
 * ranked field of twenty real Washington summits with plausible numbers, built
 * from the one place a fake row is spelled (`testSupport/fixtures.ts`). It
 * exists only while that step is open, reaches no URL and no storage, and is
 * gone when the tour ends.
 */
export interface DemoReport {
  universe: DestinationResult[]
  response: AnalyzeResponse
  analyzed: AnalyzedView
}

/** Hours in the demonstration window: a day out, dawn to dusk. */
const HOURS = 13

/** A smooth hourly curve between two values, so the chart draws a line rather than a step. */
function ramp(from: number, to: number, n = HOURS): number[] {
  return Array.from({ length: n }, (_, i) => roundTo(from + ((to - from) * i) / (n - 1), 1))
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
  /**
   * The cloud deck over the window, in feet, lowest and highest hour. A dry
   * summit reads the walk's ceiling throughout, which the table and popup
   * print as a bound, so the tour shows that mark as well as plain heights.
   */
  deck: [number, number]
}

// Twenty Washington summits (#850; the maintainer, 2026-11-04: "This looks a
// bit empty. Can we try and add more destinations to this tutorial to fill
// this space and add more lines to the chart? Maybe 20?"), one for each of the
// chart's twenty line colours (record 0228), so no two lines share one. The
// five the tour began with keep their numbers; the coordinates of the other
// fifteen are their rows in `src/coordinate-lists/`, and their numbers fan
// out like the first five's. In the order the demonstration ranks them, the
// least air-quality index first, so Mount Baker leads and the marker card's
// popup and camera stand where they did. Three stand dry under the walk's
// ceiling, Mount Olympus and the four highest volcanoes read a freezing level
// under their summits, and the wet ones carry snowfall.
const SUMMITS: Summit[] = [
  { name: 'Mount Baker', latitude: 48.7768, longitude: -121.8144, elevation_ft: 10781, precip: 0, temp: [21, 34], wind: [12, 26], aqi: [18, 24], freeze: [9800, 11400], snowfall: 0, deck: [CLOUD_DECK_CEILING_FT, CLOUD_DECK_CEILING_FT] },
  { name: 'Mount Shuksan', latitude: 48.8311, longitude: -121.6030, elevation_ft: 9131, precip: 0, temp: [20, 33], wind: [15, 30], aqi: [19, 27], freeze: [9700, 11300], snowfall: 0, deck: [CLOUD_DECK_CEILING_FT, CLOUD_DECK_CEILING_FT] },
  { name: 'Glacier Peak', latitude: 48.1125, longitude: -121.1138, elevation_ft: 10541, precip: 0.02, temp: [24, 36], wind: [10, 22], aqi: [22, 31], freeze: [10000, 11600], snowfall: 0.2, deck: [12500, 18000] },
  { name: 'Eldorado Peak', latitude: 48.5376, longitude: -121.1343, elevation_ft: 8868, precip: 0, temp: [23, 37], wind: [9, 19], aqi: [21, 34], freeze: [9900, 11700], snowfall: 0, deck: [15500, 21000] },
  { name: 'Sahale Peak', latitude: 48.4911, longitude: -121.0385, elevation_ft: 8681, precip: 0.03, temp: [22, 35], wind: [13, 27], aqi: [24, 37], freeze: [9500, 11000], snowfall: 0.3, deck: [11000, 16500] },
  { name: 'Forbidden Peak', latitude: 48.5116, longitude: -121.0583, elevation_ft: 8815, precip: 0, temp: [25, 39], wind: [8, 18], aqi: [26, 40], freeze: [10300, 11900], snowfall: 0, deck: [CLOUD_DECK_CEILING_FT, CLOUD_DECK_CEILING_FT] },
  { name: 'Bonanza Peak', latitude: 48.2382, longitude: -120.8664, elevation_ft: 9511, precip: 0, temp: [24, 40], wind: [6, 14], aqi: [28, 44], freeze: [10600, 12200], snowfall: 0, deck: [21000, 26500] },
  { name: 'Dragontail Peak', latitude: 47.4789, longitude: -120.8332, elevation_ft: 8840, precip: 0, temp: [29, 45], wind: [9, 17], aqi: [31, 48], freeze: [10500, 12100], snowfall: 0, deck: [23000, 28000] },
  { name: 'Mount Stuart', latitude: 47.4751, longitude: -120.9026, elevation_ft: 9415, precip: 0, temp: [31, 47], wind: [8, 15], aqi: [35, 52], freeze: [10400, 12000], snowfall: 0, deck: [24000, 28500] },
  { name: 'Mount Daniel', latitude: 47.5650, longitude: -121.1809, elevation_ft: 7960, precip: 0.05, temp: [27, 41], wind: [12, 24], aqi: [34, 56], freeze: [9900, 11400], snowfall: 0.4, deck: [8800, 13500] },
  { name: 'Mount Olympus', latitude: 47.8013, longitude: -123.7109, elevation_ft: 7980, precip: 0.38, temp: [30, 38], wind: [16, 31], aqi: [22, 60], freeze: [7400, 9100], snowfall: 2.4, deck: [2800, 5600] },
  { name: 'Sloan Peak', latitude: 48.0415, longitude: -121.3403, elevation_ft: 7835, precip: 0.08, temp: [28, 40], wind: [11, 23], aqi: [36, 63], freeze: [9800, 11300], snowfall: 0.5, deck: [7600, 11800] },
  { name: 'Three Fingers', latitude: 48.1699, longitude: -121.6879, elevation_ft: 6854, precip: 0.12, temp: [32, 43], wind: [10, 21], aqi: [39, 67], freeze: [9700, 11200], snowfall: 0.3, deck: [5900, 9200] },
  { name: 'Kaleetan Peak', latitude: 47.4625, longitude: -121.4782, elevation_ft: 6259, precip: 0.15, temp: [33, 45], wind: [9, 19], aqi: [43, 72], freeze: [9600, 11100], snowfall: 0.2, deck: [5200, 8600] },
  { name: 'Chair Peak', latitude: 47.4598, longitude: -121.4669, elevation_ft: 6238, precip: 0.17, temp: [34, 46], wind: [10, 20], aqi: [46, 77], freeze: [9600, 11000], snowfall: 0.1, deck: [5000, 8300] },
  { name: 'Mount Pilchuck', latitude: 48.0580, longitude: -121.7978, elevation_ft: 5341, precip: 0.2, temp: [37, 50], wind: [7, 15], aqi: [50, 83], freeze: [9500, 11000], snowfall: 0, deck: [4400, 7800] },
  { name: 'Mount Si', latitude: 47.5069, longitude: -121.7390, elevation_ft: 4167, precip: 0.28, temp: [40, 55], wind: [5, 12], aqi: [55, 89], freeze: [9400, 10900], snowfall: 0, deck: [3600, 6900] },
  { name: 'Mount Adams', latitude: 46.2024, longitude: -121.4909, elevation_ft: 12281, precip: 0.11, temp: [19, 30], wind: [18, 34], aqi: [58, 96], freeze: [9600, 11200], snowfall: 1.1, deck: [6200, 9800] },
  { name: 'Mount Rainier', latitude: 46.8517, longitude: -121.7604, elevation_ft: 14411, precip: 0.06, temp: [8, 19], wind: [28, 47], aqi: [62, 104], freeze: [9800, 11600], snowfall: 0.6, deck: [10500, 15000] },
  { name: 'Mount St. Helens', latitude: 46.1914, longitude: -122.1956, elevation_ft: 8363, precip: 0.24, temp: [33, 44], wind: [14, 29], aqi: [71, 118], freeze: [9900, 11500], snowfall: 0.6, deck: [4100, 7400] },
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
      precip_avg_in_hr: roundTo(perHour, 3),
      precip_min_in_hr: 0,
      precip_max_in_hr: roundTo(perHour * 2, 3),
      temp_min_f: s.temp[0],
      temp_max_f: s.temp[1],
      temp_avg_f: roundTo((s.temp[0] + s.temp[1]) / 2, 1),
      wind_min_mph: s.wind[0],
      wind_max_mph: s.wind[1],
      wind_avg_mph: roundTo((s.wind[0] + s.wind[1]) / 2, 1),
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
      snowfall_avg_in_hr: roundTo(snowPerHour, 3),
      snowfall_min_in_hr: 0,
      snowfall_max_in_hr: roundTo(snowPerHour * 4, 3),
      cloud_deck_min_ft: s.deck[0],
      cloud_deck_max_ft: s.deck[1],
      cloud_deck_avg_ft: Math.round((s.deck[0] + s.deck[1]) / 2),
      series: series({
        precip_in: times.map((_, i) => (i % 4 === 3 ? roundTo(perHour * 4, 3) : 0)),
        temp_f: temp,
        wind_mph: wind,
        freeze_ft: ramp(s.freeze[0], s.freeze[1]).map(Math.round),
        snowfall_in: times.map((_, i) => (i % 4 === 3 ? roundTo(snowPerHour * 4, 3) : 0)),
        cloud_deck_ft: ramp(s.deck[0], s.deck[1]).map(Math.round),
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
