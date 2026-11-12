import type { AnalyzedView } from '../hooks/analyzeTypes'
import { CLOUD_DECK_CEILING_FT, roundHalfEven } from '../utils/openMeteoAggregate'
import { analyzedSnapshot, resultRow, series } from '../testSupport/fixtures'
import type { AnalyzeResponse, DestinationResult } from '../types'
import { HOUR_MS } from '../utils/forecastWindow'
import { clamp } from '../utils/numbers'
import { SNOW_DEPTH_CEILING_IN } from '../utils/snowCeiling'

/**
 * The report the tutorial's results steps show (#536). A first-visit tour
 * runs before any analysis, so the results sheet has nothing to frame; this
 * is a ranked field of twenty real Washington summits over four days, with
 * plausible numbers shaped by the hour and the same on every load, every
 * aggregate reduced from the row's own series, built from the one place a
 * fake row is spelled (`testSupport/fixtures.ts`). It exists only while those
 * steps are open, reaches no URL and no storage, and is gone when the tour
 * ends.
 */
export interface DemoReport {
  universe: DestinationResult[]
  response: AnalyzeResponse
  analyzed: AnalyzedView
}

/**
 * Four whole local days, midnight to the last hour of the fourth (#850; the
 * maintainer, 2026-11-04, of a real report over four days: "Imagine this, but
 * with 20 destinations adding more fluctiations and overlaps. but still
 * showing an overall night/day trend of increase/decrease at the same
 * time."), so every line runs through four nights and four days.
 */
export const DEMO_DAYS = 4
export const DEMO_HOURS = DEMO_DAYS * 24
const HOUR_INDEX = Array.from({ length: DEMO_HOURS }, (_, i) => i)

/**
 * The hour the cold front reaches the westernmost summit, 2 PM on the second
 * day, and how many hours it takes to cross each degree of longitude east,
 * so it reaches the Stuart range about six hours after the Olympics.
 */
const FRONT_HOUR = 24 + 14
const FRONT_HOURS_PER_DEGREE = 2
const WEST_EDGE = -123.71
/** The hour the fourth day starts, when the field warms back and a second band of showers comes through. */
const DAY_FOUR = 3 * 24

/**
 * A number in [0, 1) that one summit always gets for one purpose: FNV-1a over
 * its name and the purpose. The demonstration must draw the same chart on
 * every load and in every test (#850), so nothing here reads `Math.random`,
 * and a hash rather than the index keeps a summit's days its own when the
 * list changes.
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
  const t = clamp(x, 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * The one night-and-day cycle every summit shares, from -0.5 at 5 AM to 0.5
 * at 3 PM: ten hours warming and fourteen cooling, so the whole field rises
 * and falls together and each summit's swing scales it.
 */
function daylight(i: number): number {
  const h = ((i % 24) + 24) % 24
  if (h >= 5 && h <= 15) return -0.5 * Math.cos((Math.PI * (h - 5)) / 10)
  return 0.5 * Math.cos((Math.PI * ((h - 15 + 24) % 24)) / 14)
}

/**
 * A curve's shape stretched so its lowest hour reads `lo` and its highest
 * `hi`, rounded as the app rounds that series.
 */
function fit(shape: number[], lo: number, hi: number, digits: number): number[] {
  const min = Math.min(...shape)
  const max = Math.max(...shape)
  return shape.map((v) => roundHalfEven(lo + ((hi - lo) * (v - min)) / (max - min), digits))
}

interface Summit {
  name: string
  latitude: number
  longitude: number
  elevation_ft: number
  /**
   * The temperature, in degrees F: the four days' level, the day's swing from
   * 5 AM to 3 PM, and how far the front drops it. The glaciated volcanoes sit
   * in the teens and swing a few degrees; Mount Si and Mount Pilchuck sit in
   * the fifties and swing twenty or more.
   */
  temp: [level: number, swing: number, frontDrop: number]
  /**
   * Degrees of warm air that sit over the summit at dawn on the first day,
   * a morning inversion the valleys' warming overtakes by noon.
   */
  inversion?: number
  /** The lightest and the strongest hour, in mph. */
  wind: [number, number]
  /** The cleanest and the worst hour of the AQI. */
  aqi: [number, number]
  /** Inches of rain or melted snow with the front and in day four's band: 0 under the crest's rain shadow. */
  precip: [front: number, band: number]
  /**
   * The cloud deck, in feet, at its lowest, in the showers, and its highest,
   * between them. Null on a dry summit, which reads the walk's ceiling all
   * four days, so the tour shows the table's and the popup's bound as well
   * as plain heights.
   */
  deck: [number, number] | null
  /**
   * Snow on the ground today, in inches: a November pack that deepens with
   * height and with the wet side of the crest, and the file's ceiling on the
   * two glaciated summits SNODAS fills to it (#849).
   */
  snow: number
}

// Twenty Washington summits (#850; the maintainer, 2026-11-04: "This looks a
// bit empty. Can we try and add more destinations to this tutorial to fill
// this space and add more lines to the chart? Maybe 20?"), one for each of the
// chart's twenty line colours (record 0228), so no two lines share one. The
// coordinates are their rows in `src/coordinate-lists/`. Their days are the
// shapes below rather than straight ramps (the maintainer, 2026-11-04: "This
// chart is too boring. Lets use data with more fluctuation."), ranked by the
// highest average temperature ("Not quite interesting enough. Can we use
// temperature instead of AQI for this tutorial?"), which `demoReport` sorts
// them by once the series are built. The three east of the crest stand dry
// under the walk's ceiling, every summit colder than freezing reads a
// freezing level under its top, and the cold wet ones carry snowfall.
const SUMMITS: Summit[] = [
  { name: 'Mount Si', latitude: 47.5069, longitude: -121.7390, elevation_ft: 4167, temp: [58, 26, 15], wind: [3, 14], aqi: [38, 71], precip: [0.3, 0.15], deck: [3200, 19000], snow: 0 },
  { name: 'Mount Pilchuck', latitude: 48.0580, longitude: -121.7978, elevation_ft: 5341, temp: [55, 22, 14], wind: [4, 17], aqi: [30, 58], precip: [0.4, 0.2], deck: [3900, 18500], snow: 6 },
  { name: 'Chair Peak', latitude: 47.4598, longitude: -121.4669, elevation_ft: 6238, temp: [49, 22, 13], wind: [6, 24], aqi: [34, 64], precip: [0.35, 0.18], deck: [4600, 20000], snow: 18 },
  { name: 'Kaleetan Peak', latitude: 47.4625, longitude: -121.4782, elevation_ft: 6259, temp: [51, 14, 13], wind: [6, 22], aqi: [33, 61], precip: [0.33, 0.2], deck: [4800, 21000], snow: 16 },
  { name: 'Three Fingers', latitude: 48.1699, longitude: -121.6879, elevation_ft: 6854, temp: [45, 18, 12], wind: [7, 25], aqi: [26, 49], precip: [0.45, 0.25], deck: [4300, 17500], snow: 22 },
  { name: 'Mount Olympus', latitude: 47.8013, longitude: -123.7109, elevation_ft: 7980, temp: [44, 9, 9], wind: [12, 38], aqi: [16, 29], precip: [0.9, 0.5], deck: [2400, 15000], snow: 48 },
  { name: 'Sloan Peak', latitude: 48.0415, longitude: -121.3403, elevation_ft: 7835, temp: [40, 18, 10], wind: [9, 28], aqi: [24, 44], precip: [0.4, 0.22], deck: [5600, 19500], snow: 30 },
  { name: 'Mount Daniel', latitude: 47.5650, longitude: -121.1809, elevation_ft: 7960, temp: [39, 13, 10], wind: [8, 27], aqi: [29, 53], precip: [0.3, 0.15], deck: [6400, 22000], snow: 34 },
  { name: 'Dragontail Peak', latitude: 47.4789, longitude: -120.8332, elevation_ft: 8840, temp: [36, 20, 8], wind: [7, 24], aqi: [36, 67], precip: [0, 0], deck: null, snow: 12 },
  { name: 'Mount Stuart', latitude: 47.4751, longitude: -120.9026, elevation_ft: 9415, temp: [35, 15, 8], wind: [9, 29], aqi: [37, 69], precip: [0, 0], deck: null, snow: 10 },
  { name: 'Mount St. Helens', latitude: 46.1914, longitude: -122.1956, elevation_ft: 8363, temp: [31, 9, 9], wind: [11, 33], aqi: [48, 112], precip: [0.35, 0.2], deck: [4500, 18000], snow: 8 },
  { name: 'Bonanza Peak', latitude: 48.2382, longitude: -120.8664, elevation_ft: 9511, temp: [30, 16, 7], wind: [8, 26], aqi: [27, 47], precip: [0, 0], deck: null, snow: 26 },
  { name: 'Forbidden Peak', latitude: 48.5116, longitude: -121.0583, elevation_ft: 8815, temp: [27, 12, 7], wind: [10, 31], aqi: [21, 36], precip: [0.22, 0.1], deck: [7200, 21500], snow: 40 },
  { name: 'Eldorado Peak', latitude: 48.5376, longitude: -121.1343, elevation_ft: 8868, temp: [26, 8, 7], wind: [9, 30], aqi: [20, 34], precip: [0.25, 0.12], deck: [6900, 21000], snow: 52 },
  { name: 'Sahale Peak', latitude: 48.4911, longitude: -121.0385, elevation_ft: 8681, temp: [24, 12, 7], wind: [11, 32], aqi: [22, 37], precip: [0.2, 0.1], deck: [7500, 22500], snow: 44 },
  { name: 'Mount Shuksan', latitude: 48.8311, longitude: -121.6030, elevation_ft: 9131, temp: [22, 7, 6], wind: [13, 36], aqi: [17, 28], precip: [0.45, 0.25], deck: [5200, 17000], snow: 60 },
  { name: 'Glacier Peak', latitude: 48.1125, longitude: -121.1138, elevation_ft: 10541, temp: [17, 6, 5], wind: [14, 39], aqi: [19, 32], precip: [0.35, 0.2], deck: [6100, 20500], snow: 640 },
  { name: 'Mount Baker', latitude: 48.7768, longitude: -121.8144, elevation_ft: 10781, temp: [16, 5, 5], wind: [15, 42], aqi: [15, 26], precip: [0.5, 0.3], deck: [4800, 16500], snow: SNOW_DEPTH_CEILING_IN },
  { name: 'Mount Adams', latitude: 46.2024, longitude: -121.4909, elevation_ft: 12281, temp: [14, 5, 4], inversion: 12, wind: [18, 46], aqi: [44, 96], precip: [0.25, 0.15], deck: [7800, 19000], snow: 210 },
  { name: 'Mount Rainier', latitude: 46.8517, longitude: -121.7604, elevation_ft: 14411, temp: [12, 4, 4], inversion: 14, wind: [24, 58], aqi: [41, 88], precip: [0.4, 0.25], deck: [8600, 18500], snow: SNOW_DEPTH_CEILING_IN },
]

/** The hour the front reaches a summit: later the farther east it stands. */
function frontAt(s: Summit): number {
  return FRONT_HOUR + (s.longitude - WEST_EDGE) * FRONT_HOURS_PER_DEGREE
}

/** The hour day four's band of showers peaks over a summit, in its afternoon or evening. */
function bandAt(s: Summit): number {
  return DAY_FOUR + pick(s.name, 'band-at', 12, 19)
}

/**
 * The temperature, unrounded, and the part of it the free air carries, which
 * the freezing level reads. On top of the shared cycle: the front, dropping
 * every line over about three hours, the low summits most; day four warming
 * back most of the way; a flattened cycle on a cloudy day for about a third
 * of the summits; the dawn inversion on the two summits that carry one; and
 * a small wobble of each summit's own.
 */
function temperature(s: Summit): { air: number[]; free: number[] } {
  const [level, swing, drop] = s.temp
  const front = frontAt(s)
  const cloudy = unit(s.name, 'cloudy') < 0.35
  const cloudyNoon = 24 * (unit(s.name, 'cloudy-day') < 0.5 ? 0 : 3) + 13
  const wobble = pick(s.name, 'wobble', 0.4, 1.2)
  const swell = pick(s.name, 'swell', 1.5, 3.5)
  const swellRate = pick(s.name, 'swell-rate', 0.2, 0.35)
  const p1 = pick(s.name, 'wobble-1', 0, 2 * Math.PI)
  const p2 = pick(s.name, 'wobble-2', 0, 2 * Math.PI)
  const air: number[] = []
  const free: number[] = []
  // Each summit's warmest hour an hour or so either side of 3 PM, each day's
  // swing its own, and each day's level a few degrees up or down, so
  // neighbours with close levels and different swings trade places.
  const late = pick(s.name, 'late', -1.5, 1.5)
  const swingOf = Array.from({ length: DEMO_DAYS }, (_, d) => pick(s.name, `swing-${d}`, 0.55, 1.45))
  const driftOf = Array.from({ length: DEMO_DAYS }, (_, d) => pick(s.name, `drift-${d}`, -5, 5))
  for (const i of HOUR_INDEX) {
    const flat = cloudy ? 1 - 0.65 * bump(i, cloudyNoon, 5) : 1
    let daySwing = 0
    let drift = 0
    let weight = 0
    for (let d = 0; d < DEMO_DAYS; d++) {
      const near = bump(i, 24 * d + 12, 7)
      daySwing += near * swingOf[d]
      drift += near * driftOf[d]
      weight += near
    }
    const day = swing * (daySwing / weight) * daylight(i - late) * flat
    const weather = -drop * smoothstep((i - front) / 3) + 0.8 * drop * smoothstep((i - DAY_FOUR - 7) / 9)
    const inversion = (s.inversion ?? 0) * bump(i, 6, 2.2)
    const own = wobble * Math.sin(1.3 * i + p1) + swell * Math.sin(swellRate * i + p2)
    air.push(level + drift / weight + day + weather + inversion + own)
    free.push(level + drift / weight + day / 2 + weather)
  }
  return { air, free }
}

/**
 * Precipitation, in inches an hour: two or three showers of a few hours with
 * the front and again in day four's band, each event scaled to its total and
 * dry between them. Each hour is rounded as the series is, so the window's
 * total is the series' own sum.
 */
function precipSeries(s: Summit): number[] {
  const out = HOUR_INDEX.map(() => 0)
  const events: [number, number, string][] = [
    [frontAt(s) + 1, s.precip[0], 'front'],
    [bandAt(s), s.precip[1], 'band'],
  ]
  for (const [at, total, tag] of events) {
    if (total === 0) continue
    const showers = unit(s.name, `${tag}-showers`) < 0.5 ? 2 : 3
    const raw = HOUR_INDEX.map((i) => {
      let v = 0
      for (let k = 0; k < showers; k++) {
        v += pick(s.name, `${tag}-h-${k}`, 0.4, 1) * bump(i, at + pick(s.name, `${tag}-at-${k}`, -3, 4), 0.9)
      }
      return v
    })
    const peak = Math.max(...raw)
    const wet = raw.map((v) => (v < 0.03 * peak ? 0 : v))
    const sum = wet.reduce((a, b) => a + b, 0)
    for (const i of HOUR_INDEX) out[i] += (total * wet[i]) / sum
  }
  return out.map((v) => roundHalfEven(v, 4))
}

/** Snow per inch of precipitation: ten at 28 degrees F and colder, none from 34 up. */
function snowRatio(tempF: number): number {
  return 10 * clamp((34 - tempF) / 6, 0, 1)
}

/** The cloud deck: high between the events, down near the summits in the showers. */
function deckSeries(s: Summit): number[] {
  if (s.deck === null) return HOUR_INDEX.map(() => CLOUD_DECK_CEILING_FT)
  const phase = pick(s.name, 'deck-phase', 0, 2 * Math.PI)
  const front = frontAt(s) + 1
  const band = bandAt(s)
  return fit(
    HOUR_INDEX.map((i) => -Math.max(bump(i, front, 5), 0.8 * bump(i, band, 4)) + 0.06 * Math.sin(0.7 * i + phase)),
    s.deck[0],
    s.deck[1],
    0,
  )
}

/** Wind: a little more by afternoon, strongest as the front passes, a second rise in the band. */
function windShape(s: Summit): number[] {
  const phase = pick(s.name, 'wind-phase', 0, 2 * Math.PI)
  const front = frontAt(s)
  const band = bandAt(s)
  return HOUR_INDEX.map(
    (i) => 0.2 * daylight(i) + bump(i, front, 3) + 0.45 * bump(i, band, 3) + 0.1 * Math.sin(0.9 * i + phase),
  )
}

/** AQI: worst in each afternoon, washed out by the front, building back on day four. */
function aqiShape(s: Summit): number[] {
  const front = frontAt(s)
  const phase = pick(s.name, 'aqi-phase', 0, 2 * Math.PI)
  return HOUR_INDEX.map((i) => {
    const smoke = 1 - 0.75 * smoothstep((i - front) / 4) + 0.35 * smoothstep((i - DAY_FOUR - 4) / 12)
    return (0.6 + daylight(i)) * smoke + 0.04 * Math.sin(1.1 * i + phase)
  })
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

export function demoReport(now = Date.now()): DemoReport {
  // Two days out, from local midnight, so the window is inside every
  // model's reach and reads as a plan rather than a record.
  const start = new Date(now)
  start.setDate(start.getDate() + 2)
  start.setHours(0, 0, 0, 0)
  const startMs = start.getTime()
  const endMs = startMs + (DEMO_HOURS - 1) * HOUR_MS
  const times = Array.from({ length: DEMO_HOURS }, (_, i) => startMs + i * HOUR_MS)

  const rows = SUMMITS.map((s) => {
    // Each series first, then every aggregate reduced from it, so the table,
    // the popup and the chart read the same four days.
    const { air, free } = temperature(s)
    const temp = air.map((t) => roundHalfEven(t, 1))
    const precip = precipSeries(s)
    const hourly = {
      precip_in: precip,
      temp_f: temp,
      wind_mph: fit(windShape(s), s.wind[0], s.wind[1], 1),
      // Where the free air above the summit reaches freezing, at about 230
      // feet a degree: it rises and falls with the day and the front, and
      // stands under the top of every summit colder than 32 degrees F.
      freeze_ft: free.map((t) => roundHalfEven(s.elevation_ft + 230 * (t - 32), 0)),
      snowfall_in: precip.map((p, i) => roundHalfEven(p * snowRatio(temp[i]), 4)),
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
      snow_depth_in: s.snow,
      cloud_deck_min_ft: d.min,
      cloud_deck_max_ft: d.max,
      cloud_deck_avg_ft: d.avg,
      series: series(hourly),
    })
  })
  // In the order the demonstration ranks them, the warmest average first,
  // since the marker card flies to the first row.
  const universe = rows.sort((a, b) => b.temp_avg_f - a.temp_avg_f)

  return {
    universe,
    response: {
      results: universe,
      total_queried: universe.length,
      total_matched: universe.length,
      times,
    },
    analyzed: analyzedSnapshot({
      sortBy: 'temp_avg_f',
      sortDesc: true,
      window: { startMs, endMs },
    }),
  }
}
