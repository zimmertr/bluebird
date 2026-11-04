import type { AnalyzedView } from '../hooks/analyzeTypes'
import { CLOUD_DECK_CEILING_FT, roundHalfEven } from '../utils/openMeteoAggregate'
import { analyzedSnapshot, resultRow, series } from '../testSupport/fixtures'
import type { AnalyzeResponse, DestinationResult } from '../types'
import { HOUR_MS } from '../utils/forecastWindow'

/**
 * The report the tutorial's last step shows (#536). A first-visit tour runs
 * before any analysis, so the results sheet has nothing to frame; this is a
 * ranked field of twenty real Washington summits with plausible numbers shaped
 * by the hour and the same on every load, every aggregate reduced from the
 * row's own series, built from the one place a fake row is spelled
 * (`testSupport/fixtures.ts`). It
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
const HOUR_INDEX = Array.from({ length: HOURS }, (_, i) => i)

/**
 * A number in [0, 1) that one summit always gets for one purpose: FNV-1a over
 * its name and the purpose. The demonstration must draw the same chart on
 * every load and in every test (#850), so nothing here reads `Math.random`,
 * and a hash rather than the index keeps a summit's day its own when the list
 * is reordered.
 */
function unit(name: string, purpose: string): number {
  let h = 0x811c9dc5
  for (const c of `${name}:${purpose}`) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h / 2 ** 32
}

/** `unit` stretched over [lo, hi]. */
function pick(name: string, purpose: string, lo: number, hi: number): number {
  return lo + (hi - lo) * unit(name, purpose)
}

function bump(i: number, at: number, width: number): number {
  return Math.exp(-((i - at) ** 2) / (2 * width ** 2))
}

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x))
  return t * t * (3 - 2 * t)
}

/**
 * A curve's shape stretched so its lowest hour reads `lo` and its highest
 * `hi`, rounded as the app rounds that series. The ranges in the table below
 * are therefore the row's own minimum and maximum, which is what keeps the
 * ranking by the worst AQI hour in the table's order.
 */
function fit(shape: number[], lo: number, hi: number, digits: number): number[] {
  const min = Math.min(...shape)
  const max = Math.max(...shape)
  return shape.map((v) => roundHalfEven(lo + ((hi - lo) * (v - min)) / (max - min), digits))
}

type Wind = 'calm' | 'building' | 'gusty'
type Air = 'clean' | 'haze' | 'smoke'
type Deck = 'dip' | 'hump'

interface Summit {
  name: string
  latitude: number
  longitude: number
  elevation_ft: number
  /** Dawn low and afternoon high, in degrees F: a narrow day high up. */
  temp: [number, number]
  /** The lightest and the strongest hour, in mph, and how the day blows. */
  wind: [number, number, Wind]
  /** The morning low and the worst hour of the AQI, and what drives it. */
  aqi: [number, number, Air]
  /** The freezing level, in feet, at its lowest and its highest hour. */
  freeze: [number, number]
  /** The window's precipitation, in inches: 0 for a dry summit. */
  precip: number
  /** New snow per inch of precipitation: 0 where it falls as rain, never over ten. */
  snowRatio: number
  /**
   * The cloud deck, in feet, at its lowest and highest hour, and whether it
   * sinks through the morning and lifts after (`dip`) or the reverse. Null on
   * a dry summit, which reads the walk's ceiling all day, so the tour shows
   * the table's and the popup's bound as well as plain heights.
   */
  deck: [number, number, Deck] | null
}

/** Temperature: coldest at 6 AM, warmest at 2 or 3 PM, easing toward 6 PM. */
function tempShape(s: Summit): number[] {
  const at = pick(s.name, 'temp-at', 8, 9)
  const width = pick(s.name, 'temp-width', 3.2, 4.2)
  return HOUR_INDEX.map((i) => bump(i, at, width))
}

/**
 * Wind: a calm summit wanders, a building one picks up through the afternoon,
 * and a gusty one carries two or three peaks at hours of its own.
 */
function windShape(s: Summit): number[] {
  const phase = pick(s.name, 'wind-phase', 0, 2 * Math.PI)
  if (s.wind[2] === 'calm') return HOUR_INDEX.map((i) => Math.sin(0.8 * i + phase) + 0.4 * Math.sin(1.9 * i + 2 * phase))
  if (s.wind[2] === 'building') {
    const from = pick(s.name, 'wind-from', 4, 7)
    return HOUR_INDEX.map((i) => smoothstep((i - from) / 5) + 0.12 * Math.sin(2.1 * i + phase))
  }
  // Two or three peaks, each in its own stretch of the day so they never
  // merge, over a base that drifts up or down through the window.
  const peaks = unit(s.name, 'wind-peaks') < 0.5 ? 2 : 3
  const stretch = 12 / peaks
  const at = Array.from({ length: peaks }, (_, k) => pick(s.name, `wind-at-${k}`, k * stretch, (k + 1) * stretch - 1))
  const drift = pick(s.name, 'wind-drift', -0.3, 0.3)
  return HOUR_INDEX.map(
    (i) =>
      0.3 +
      (drift * i) / 12 +
      at.reduce((sum, c, k) => sum + pick(s.name, `wind-h-${k}`, 0.45, 1) * bump(i, c, pick(s.name, `wind-w-${k}`, 0.7, 1.3)), 0),
  )
}

/**
 * AQI, lowest at 6 AM: a clean summit nearly flat, a hazy one rising with a
 * wobble, and a smoky one climbing into the afternoon to a bump at 2 to 4 PM
 * and partly recovering by evening. Every term is zero at dawn and positive
 * after, so the first hour is the row's minimum.
 */
function aqiShape(s: Summit): number[] {
  const rate = pick(s.name, 'aqi-rate', 0.9, 1.6)
  if (s.aqi[2] === 'clean') return HOUR_INDEX.map((i) => 0.3 * (1 - Math.cos(rate * i)) + (0.4 * i) / 12)
  if (s.aqi[2] === 'haze') return HOUR_INDEX.map((i) => i / 12 + 0.15 * (1 - Math.cos(rate * i)))
  const at = pick(s.name, 'aqi-at', 8, 10)
  return HOUR_INDEX.map((i) => 0.6 * smoothstep((i - 2) / 7) + 0.7 * bump(i, at, 1.4))
}

/** Freezing level: rising through the day, with a wobble of its own. */
function freezeShape(s: Summit): number[] {
  const phase = pick(s.name, 'freeze-phase', 0, 2 * Math.PI)
  return HOUR_INDEX.map((i) => i / 12 + 0.12 * Math.sin(1.4 * i + phase))
}

/**
 * Precipitation, in inches an hour, totalling the summit's `precip`: one or
 * two bursts of a few hours each with a sharp peak, dry between them. Each
 * hour is rounded as the series is, so the total is the series' own sum.
 */
function precipSeries(s: Summit): number[] {
  if (s.precip === 0) return HOUR_INDEX.map(() => 0)
  const bursts =
    unit(s.name, 'rain-bursts') < 0.5
      ? [pick(s.name, 'rain-at', 2, 10)]
      : [pick(s.name, 'rain-at-1', 1, 5), pick(s.name, 'rain-at-2', 7, 11)]
  const raw = HOUR_INDEX.map((i) =>
    bursts.reduce((sum, at, k) => sum + pick(s.name, `rain-h-${k}`, 0.5, 1) * bump(i, at, 0.85), 0),
  )
  const peak = Math.max(...raw)
  const wet = raw.map((v) => (v < 0.03 * peak ? 0 : v))
  const sum = wet.reduce((a, b) => a + b, 0)
  return wet.map((v) => roundHalfEven((s.precip * v) / sum, 4))
}

/** The cloud deck: sinking through the morning and lifting after, or the reverse. */
function deckSeries(s: Summit): number[] {
  if (s.deck === null) return HOUR_INDEX.map(() => CLOUD_DECK_CEILING_FT)
  const [lo, hi, kind] = s.deck
  const phase = pick(s.name, 'deck-phase', 0, 2 * Math.PI)
  const at = kind === 'dip' ? pick(s.name, 'deck-at', 4, 6) : pick(s.name, 'deck-at', 5, 8)
  const sign = kind === 'dip' ? -1 : 1
  return fit(
    HOUR_INDEX.map((i) => sign * bump(i, at, 2.5) + 0.08 * Math.sin(1.7 * i + phase)),
    lo,
    hi,
    0,
  )
}

/** The least, the most, the mean and the sum of one series, rounded as the app rounds that metric. */
function aggregate(values: number[], digits: number) {
  const sum = values.reduce((a, b) => a + b, 0)
  return {
    min: roundHalfEven(Math.min(...values), digits),
    max: roundHalfEven(Math.max(...values), digits),
    avg: roundHalfEven(sum / values.length, digits),
    total: roundHalfEven(sum, digits),
  }
}

// Twenty Washington summits (#850; the maintainer, 2026-11-04: "This looks a
// bit empty. Can we try and add more destinations to this tutorial to fill
// this space and add more lines to the chart? Maybe 20?"), one for each of the
// chart's twenty line colours (record 0228), so no two lines share one. Each
// hour is shaped like a day in the Cascades rather than a straight ramp (the
// maintainer, 2026-11-04: "This chart is too boring. Lets use data with more
// fluctuation."): the curves above, each summit's phases and peaks from
// `unit`. The coordinates are their rows in `src/coordinate-lists/`. In the
// order the demonstration ranks them, the least worst-hour AQI first, so
// Mount Baker leads and the marker card's popup and camera stand where they
// did. Mount Baker, Mount Shuksan and Forbidden Peak stand dry under the
// walk's ceiling, Mount Olympus and the four highest volcanoes read a
// freezing level under their summits, the cold wet ones carry snowfall, and
// the smoke reaches the southern volcanoes and the I-90 summits.
const SUMMITS: Summit[] = [
  { name: 'Mount Baker', latitude: 48.7768, longitude: -121.8144, elevation_ft: 10781, temp: [21, 30], wind: [12, 26, 'gusty'], aqi: [20, 24, 'clean'], freeze: [9800, 11400], precip: 0, snowRatio: 0, deck: null },
  { name: 'Mount Shuksan', latitude: 48.8311, longitude: -121.6030, elevation_ft: 9131, temp: [20, 31], wind: [15, 30, 'building'], aqi: [22, 27, 'clean'], freeze: [9700, 11300], precip: 0, snowRatio: 0, deck: null },
  { name: 'Glacier Peak', latitude: 48.1125, longitude: -121.1138, elevation_ft: 10541, temp: [24, 32], wind: [10, 22, 'gusty'], aqi: [26, 31, 'clean'], freeze: [10000, 11600], precip: 0.02, snowRatio: 8, deck: [12500, 18000, 'dip'] },
  { name: 'Eldorado Peak', latitude: 48.5376, longitude: -121.1343, elevation_ft: 8868, temp: [23, 37], wind: [6, 10, 'calm'], aqi: [28, 34, 'clean'], freeze: [9900, 11700], precip: 0, snowRatio: 0, deck: [15500, 21000, 'hump'] },
  { name: 'Sahale Peak', latitude: 48.4911, longitude: -121.0385, elevation_ft: 8681, temp: [22, 35], wind: [13, 27, 'gusty'], aqi: [31, 37, 'clean'], freeze: [9500, 11000], precip: 0.03, snowRatio: 8, deck: [11000, 16500, 'dip'] },
  { name: 'Forbidden Peak', latitude: 48.5116, longitude: -121.0583, elevation_ft: 8815, temp: [25, 39], wind: [8, 18, 'building'], aqi: [33, 40, 'clean'], freeze: [10300, 11900], precip: 0, snowRatio: 0, deck: null },
  { name: 'Bonanza Peak', latitude: 48.2382, longitude: -120.8664, elevation_ft: 9511, temp: [24, 40], wind: [5, 9, 'calm'], aqi: [28, 44, 'haze'], freeze: [10600, 12200], precip: 0, snowRatio: 0, deck: [21000, 26500, 'hump'] },
  { name: 'Dragontail Peak', latitude: 47.4789, longitude: -120.8332, elevation_ft: 8840, temp: [29, 45], wind: [9, 17, 'building'], aqi: [31, 48, 'haze'], freeze: [10500, 12100], precip: 0, snowRatio: 0, deck: [23000, 28000, 'dip'] },
  { name: 'Mount Stuart', latitude: 47.4751, longitude: -120.9026, elevation_ft: 9415, temp: [31, 47], wind: [8, 15, 'gusty'], aqi: [35, 52, 'haze'], freeze: [10400, 12000], precip: 0, snowRatio: 0, deck: [24000, 28500, 'hump'] },
  { name: 'Mount Daniel', latitude: 47.5650, longitude: -121.1809, elevation_ft: 7960, temp: [27, 41], wind: [12, 24, 'gusty'], aqi: [34, 56, 'haze'], freeze: [9900, 11400], precip: 0.05, snowRatio: 7, deck: [8800, 13500, 'dip'] },
  { name: 'Mount Olympus', latitude: 47.8013, longitude: -123.7109, elevation_ft: 7980, temp: [30, 38], wind: [16, 31, 'gusty'], aqi: [22, 60, 'haze'], freeze: [7400, 9100], precip: 0.38, snowRatio: 6, deck: [2800, 5600, 'hump'] },
  { name: 'Sloan Peak', latitude: 48.0415, longitude: -121.3403, elevation_ft: 7835, temp: [28, 40], wind: [11, 23, 'building'], aqi: [36, 63, 'haze'], freeze: [9800, 11300], precip: 0.08, snowRatio: 6, deck: [7600, 11800, 'dip'] },
  { name: 'Three Fingers', latitude: 48.1699, longitude: -121.6879, elevation_ft: 6854, temp: [32, 43], wind: [10, 21, 'gusty'], aqi: [39, 67, 'haze'], freeze: [9700, 11200], precip: 0.12, snowRatio: 3, deck: [5900, 9200, 'hump'] },
  { name: 'Kaleetan Peak', latitude: 47.4625, longitude: -121.4782, elevation_ft: 6259, temp: [33, 45], wind: [9, 19, 'building'], aqi: [43, 72, 'smoke'], freeze: [9600, 11100], precip: 0.15, snowRatio: 2, deck: [5200, 8600, 'dip'] },
  { name: 'Chair Peak', latitude: 47.4598, longitude: -121.4669, elevation_ft: 6238, temp: [34, 46], wind: [10, 20, 'gusty'], aqi: [46, 77, 'smoke'], freeze: [9600, 11000], precip: 0.17, snowRatio: 1, deck: [5000, 8300, 'hump'] },
  { name: 'Mount Pilchuck', latitude: 48.0580, longitude: -121.7978, elevation_ft: 5341, temp: [37, 50], wind: [5, 10, 'calm'], aqi: [50, 83, 'haze'], freeze: [9500, 11000], precip: 0.2, snowRatio: 0, deck: [4400, 7800, 'dip'] },
  { name: 'Mount Si', latitude: 47.5069, longitude: -121.7390, elevation_ft: 4167, temp: [40, 55], wind: [4, 8, 'calm'], aqi: [55, 89, 'smoke'], freeze: [9400, 10900], precip: 0.28, snowRatio: 0, deck: [3600, 6900, 'hump'] },
  { name: 'Mount Adams', latitude: 46.2024, longitude: -121.4909, elevation_ft: 12281, temp: [19, 26], wind: [18, 34, 'building'], aqi: [58, 96, 'smoke'], freeze: [9600, 11200], precip: 0.11, snowRatio: 9, deck: [6200, 9800, 'dip'] },
  { name: 'Mount Rainier', latitude: 46.8517, longitude: -121.7604, elevation_ft: 14411, temp: [10, 16], wind: [28, 47, 'gusty'], aqi: [62, 104, 'smoke'], freeze: [9800, 11600], precip: 0.06, snowRatio: 9, deck: [10500, 15000, 'hump'] },
  { name: 'Mount St. Helens', latitude: 46.1914, longitude: -122.1956, elevation_ft: 8363, temp: [33, 44], wind: [14, 29, 'gusty'], aqi: [71, 118, 'smoke'], freeze: [9900, 11500], precip: 0.24, snowRatio: 3, deck: [4100, 7400, 'dip'] },
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
    // Each series first, then every aggregate reduced from it, so the table,
    // the popup and the chart read one day.
    const precip = precipSeries(s)
    const hourly = {
      precip_in: precip,
      temp_f: fit(tempShape(s), s.temp[0], s.temp[1], 1),
      wind_mph: fit(windShape(s), s.wind[0], s.wind[1], 1),
      freeze_ft: fit(freezeShape(s), s.freeze[0], s.freeze[1], 0),
      snowfall_in: precip.map((p) => roundHalfEven(p * s.snowRatio, 4)),
      cloud_deck_ft: deckSeries(s),
      aqi: fit(aqiShape(s), s.aqi[0], s.aqi[1], 0),
    }
    const p = aggregate(hourly.precip_in, 4)
    const t = aggregate(hourly.temp_f, 1)
    const w = aggregate(hourly.wind_mph, 1)
    const a = aggregate(hourly.aqi, 0)
    const f = aggregate(hourly.freeze_ft, 0)
    const sn = aggregate(hourly.snowfall_in, 4)
    const d = aggregate(hourly.cloud_deck_ft, 0)
    return resultRow({
      name: s.name,
      latitude: s.latitude,
      longitude: s.longitude,
      elevation_ft: s.elevation_ft,
      precip_total_in: p.total,
      precip_avg_in_hr: p.avg,
      precip_min_in_hr: p.min,
      precip_max_in_hr: p.max,
      temp_min_f: t.min,
      temp_max_f: t.max,
      temp_avg_f: t.avg,
      wind_min_mph: w.min,
      wind_max_mph: w.max,
      wind_avg_mph: w.avg,
      aqi_min: a.min,
      aqi_max: a.max,
      aqi_avg: a.avg,
      // Every default column carries a number, so the popup and the table
      // show what a real report shows rather than N/A where the model
      // publishes a value.
      freeze_min_ft: f.min,
      freeze_max_ft: f.max,
      freeze_avg_ft: f.avg,
      snowfall_total_in: sn.total,
      snowfall_avg_in_hr: sn.avg,
      snowfall_min_in_hr: sn.min,
      snowfall_max_in_hr: sn.max,
      cloud_deck_min_ft: d.min,
      cloud_deck_max_ft: d.max,
      cloud_deck_avg_ft: d.avg,
      series: series(hourly),
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
