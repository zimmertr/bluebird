import { SortBy } from '../types'

/**
 * A set of band boundaries and the colors they anchor.
 *
 * Split out of MetricConfig because a scale is no longer one-per-metric: the
 * table colors each cell by its own number, and two of precipitation's columns
 * are a rate where the third is a total (see PRECIP_RATE below). The `group`
 * field stays on MetricConfig, which is about the *ranked* metric.
 */
export type ColorScale = {
  // Band boundaries — always one fewer than colors. Values at or below
  // thresholds[0] take colors[0]; each band blends toward the next anchor;
  // values past the last threshold extrapolate into the final color over one
  // more last-band width, then clamp.
  thresholds: number[]
  colors: string[]
}

/**
 * A scale the map legend can key.
 *
 * Captions for the bands, not a name for the metric — that comes from
 * metrics.ts, which knows the analysis mode these thresholds do not. Every
 * legendable scale carries its own, because a caption that disagrees with its
 * threshold is a bug the numbers should catch rather than a wording choice made
 * in another file.
 */
export type LabelledScale = ColorScale & { legendLabels: string[] }

type MetricConfig = LabelledScale & {
  group: string[]
}

// The one green→red ramp every scale draws from, plus the two darker steps
// the AQI scale continues into (#255). Hue still says what kind of conditions
// (green = dry/calm/cold/clean through red = severe), but hue is no longer
// the load-bearing channel: WCAG relative luminance falls strictly from each
// step to the next, so the ramp survives protanopia, deuteranopia and
// tritanopia, where the old equal-brightness ramp collapsed (its lime and
// amber measured 1.03:1 apart, and its lightness was not even ordered).
//
// Derived by constraint search, and the constraints are enforced in
// colors.test.ts against these exported values — luminance strictly
// monotonic; lightest-vs-darkest ≥ 3:1; every adjacent pair ≥ 1.5:1 under
// normal vision AND all three dichromacies (Viénot 1999 simulation) — so a
// change here fails the measurement rather than inheriting a stale claim.
// Six-plus-two monotonic steps exhaust the usable luminance range, which is
// why the AQI continuation cannot also clear 1.5:1: red→purple→maroon
// measure 1.27–1.53:1 across conditions (floors pinned at 1.25), with the
// EPA hue convention still separating them for typical vision.
// Green's LIGHTNESS is structural (it must clear lime by 1.5:1 under
// deuteranopia, and every step below already sits at its floor), but its
// saturation is not: 66% instead of the searcher's 91% keeps the same
// luminance while dropping the neon edge (TJ, 2026-08-06).
const RAMP = ['#50eb74', '#74b800', '#9e7400', '#964100', '#800408']
const AQI_PURPLE = '#470059'
const AQI_MAROON = '#260000'

// Scales are anchored to absolute conditions (green = dry/calm/cold/clean),
// not to the chosen ranking direction — ranking "highest" simply surfaces the
// red end of the same scale first.
export const METRIC_CONFIG: Record<SortBy, MetricConfig> = {
  precip_total_in: {
    thresholds: [0.01, 0.10, 0.25, 0.50],
    colors: RAMP,
    legendLabels: ['≤ 0.01"', '0.01 – 0.10"', '0.10 – 0.25"', '0.25 – 0.50"', '> 0.50"'],
    group: ['precip_total_in', 'precip_avg_in_hr', 'precip_max_in_hr'],
  },
  wind_avg_mph: {
    thresholds: [5, 15, 25, 35],
    colors: RAMP,
    legendLabels: ['≤ 5 mph', '5 – 15 mph', '15 – 25 mph', '25 – 35 mph', '> 35 mph'],
    group: ['wind_min_mph', 'wind_avg_mph', 'wind_max_mph'],
  },
  temp_avg_f: {
    thresholds: [30, 45, 55, 65],
    colors: RAMP,
    legendLabels: ['≤ 30°F', '30 – 45°F', '45 – 55°F', '55 – 65°F', '> 65°F'],
    group: ['temp_min_f', 'temp_avg_f', 'temp_max_f'],
  },
  // All six US EPA AQI categories — Good / Moderate / Sensitive / Unhealthy /
  // Very Unhealthy / Hazardous — in the app's hues. The purple/maroon top
  // bands exist so an AQI of 250 and one of 350 never look the same. The
  // ramp's lime is skipped: EPA's Moderate is a yellow, not a yellow-green.
  aqi_avg: {
    thresholds: [50, 100, 150, 200, 300],
    colors: [RAMP[0], RAMP[2], RAMP[3], RAMP[4], AQI_PURPLE, AQI_MAROON],
    legendLabels: [
      '≤ 50 AQI',
      '50 – 100 AQI',
      '100 – 150 AQI',
      '150 – 200 AQI',
      '200 – 300 AQI',
      '> 300 AQI',
    ],
    group: ['aqi_avg', 'aqi_max'],
  },
}

/**
 * Rainfall read as an intensity rather than as a total.
 *
 * The precipitation group is the one group whose columns do not share a unit:
 * the total is inches over the whole window, and the other two are inches *per
 * hour*. One set of numbers cannot mean both — 0.30" spread across three days
 * is drizzle and 0.30 in/hr is a downpour — so scoring a rate cell on the
 * window-total scale above would have said they were the same weather.
 *
 * The boundaries are the National Weather Service's rainfall-intensity classes:
 * light below 0.10 in/hr, moderate to 0.30, heavy to 0.50, violent past it.
 * Borrowed rather than invented, because a scale a reader can look up is worth
 * more here than one tuned to this app's data.
 *
 * Shares the hues of every other scale, so green still means "nothing going on"
 * across the whole table.
 */
const PRECIP_RATE: LabelledScale = {
  thresholds: [0.01, 0.10, 0.30, 0.50],
  colors: RAMP,
  // Spelled "in/hr" rather than with an inch mark, which is what the window
  // scale above uses. The difference is the whole point of this scale existing,
  // and the map legend shows one or the other with nothing beside it to compare
  // against — so the unit has to say which reading it is on its own.
  legendLabels: [
    '≤ 0.01 in/hr',
    '0.01 – 0.10 in/hr',
    '0.10 – 0.30 in/hr',
    '0.30 – 0.50 in/hr',
    '> 0.50 in/hr',
  ],
}

/**
 * Which hourly column carries a ranked metric's per-hour value.
 *
 * Only precipitation moves: its ranked key is a window total and its hourly
 * value is a rate, so they are measured against different scales. The other
 * three rank by an average of the same quantity the hourly series holds, so the
 * ranked key IS the hourly key and the mapping is the identity.
 */
const HOURLY_COLUMN: Record<SortBy, string> = {
  precip_total_in: 'precip_avg_in_hr',
  wind_avg_mph: 'wind_avg_mph',
  temp_avg_f: 'temp_avg_f',
  aqi_avg: 'aqi_avg',
}

/**
 * Which scale scores a given column, derived from the ranking scales rather
 * than restated: every colorable column is already named in exactly one
 * `group`, and a second list would be a second answer.
 */
const COLUMN_SCALE: Record<string, LabelledScale> = {
  ...Object.fromEntries(
    (Object.keys(METRIC_CONFIG) as SortBy[]).flatMap((key) =>
      METRIC_CONFIG[key].group.map((column) => [column, METRIC_CONFIG[key] as LabelledScale]),
    ),
  ),
  precip_avg_in_hr: PRECIP_RATE,
  precip_max_in_hr: PRECIP_RATE,
}

/**
 * The scale one hour of a ranked metric is read on, for map playback (#121).
 *
 * Playback colors a marker by that hour's own number rather than by the
 * window's, so precipitation has to leave the total scale: 0.30" spread across
 * three days is drizzle and 0.30 in/hr is a downpour, and coloring the second
 * like the first would say they were the same weather. It reads the same
 * `COLUMN_SCALE` the table does, so a marker under the playhead and the cell
 * beside it in the table cannot be scored differently.
 *
 * The point-sample collapse `scaleFor` handles below cannot apply here:
 * playback exists only over a window of at least two stamps, so an hour is
 * never the whole window.
 */
export function hourlyScale(sortBy: SortBy): LabelledScale {
  return COLUMN_SCALE[HOURLY_COLUMN[sortBy]]
}

/**
 * The scale a table cell in `key` is colored on, or null if that column carries
 * no color.
 *
 * `pointSample` is the one case where a column's scale is not fixed. A
 * point-sample analysis covers a single hourly stamp, so the per-hour columns
 * hold that hour's whole total, the table collapses them into one column, and
 * the marker beside the row is colored by the window total. Reading them on the
 * rate scale there would color a cell one thing and its own marker another over
 * the same number.
 */
export function scaleFor(key: string, pointSample: boolean): ColorScale | null {
  if (pointSample && (key === 'precip_avg_in_hr' || key === 'precip_max_in_hr')) {
    return METRIC_CONFIG.precip_total_in
  }
  return COLUMN_SCALE[key] ?? null
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)))
}

function mix(
  ca: [number, number, number],
  cb: [number, number, number],
  f: number,
): [number, number, number] {
  return [lerp(ca[0], cb[0], f), lerp(ca[1], cb[1], f), lerp(ca[2], cb[2], f)]
}

function interpolateRgb(value: number, scale: ColorScale): [number, number, number] {
  const { thresholds, colors } = scale
  const anchors = colors.map(hexToRgb)
  if (value <= thresholds[0]) return [...anchors[0]] as [number, number, number]
  for (let i = 1; i < thresholds.length; i++) {
    if (value <= thresholds[i]) {
      return mix(anchors[i - 1], anchors[i], (value - thresholds[i - 1]) / (thresholds[i] - thresholds[i - 1]))
    }
  }
  // Extrapolate into the final anchor for one additional band past the last
  // threshold, then clamp fully saturated.
  const n = thresholds.length
  const lastWidth = thresholds[n - 1] - thresholds[n - 2]
  return mix(anchors[n - 1], anchors[n], Math.min(1, (value - thresholds[n - 1]) / lastWidth))
}

/** A marker is colored by the ranked value, which is what the legend explains. */
export function markerColor(value: number, sortBy: SortBy): string {
  return colorOnScale(value, METRIC_CONFIG[sortBy])
}

/**
 * The same interpolation against a scale the caller names.
 *
 * Map playback needs it: a marker under the playhead is colored by one hour's
 * value, which for precipitation is measured on `PRECIP_RATE` rather than on
 * the window scale its ranking uses.
 */
export function colorOnScale(value: number, scale: ColorScale): string {
  const [r, g, b] = interpolateRgb(value, scale)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/** WCAG relative luminance of an sRGB triple. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/**
 * The luminance floor for text printed in a band color.
 *
 * The ramp's accessible channel is darkness (#255), and the table prints its
 * numbers IN the band color on the results panel — so the darker half of the
 * ramp would land below AA as text while being exactly right as a marker.
 * The binding surface is a hovered row: slate-700 at 30% over the panel's
 * slate-800, whose effective luminance is 0.0349. AA's 4.5:1 for text there
 * needs L ≥ 4.5 × (0.0349 + 0.05) − 0.05 = 0.332; colors.test.ts measures
 * the floor against every anchor. Changing the table's surfaces moves this
 * number, so re-derive it rather than trusting it.
 */
const TEXT_FLOOR_L = 0.332

/**
 * The band color, lightened toward white only as far as the text floor needs.
 *
 * The band identity a lightened text loses is carried by the cell's tinted
 * background and by the printed number itself; text has to be readable first.
 * Binary search over the mix fraction — luminance rises monotonically with
 * it — so the result is deterministic and minimal.
 */
function readableText(rgb: [number, number, number]): [number, number, number] {
  if (relativeLuminance(rgb) >= TEXT_FLOOR_L) return rgb
  let lo = 0
  let hi = 1
  for (let i = 0; i < 20; i++) {
    const t = (lo + hi) / 2
    const mixed = mix(rgb, [255, 255, 255], t)
    if (relativeLuminance(mixed) >= TEXT_FLOOR_L) hi = t
    else lo = t
  }
  return mix(rgb, [255, 255, 255], hi)
}

/**
 * A cell is colored by the number printed in it, on the scale that number is
 * measured against — so the caller passes a scale rather than the ranking, and
 * `scaleFor` is what turns a column into one.
 *
 * It used to take the ranking and color every cell in the ranked group by the
 * *ranked* value, which painted a row one flat color: a destination with a
 * 0.55 in/hr peak inside a 0.10" window showed both cells at the window's
 * color, so the peak the reader was looking for was the one thing the color
 * could not tell them.
 *
 * The background keeps the true band color; the text wears `readableText`'s
 * lightened variant of it, because a dark band's own value is unreadable as
 * text on the dark panel (see TEXT_FLOOR_L above).
 */
export function cellStyle(
  value: number,
  scale: ColorScale,
): { backgroundColor: string; color: string } {
  const rgb = interpolateRgb(value, scale)
  const [r, g, b] = rgb
  const [tr, tg, tb] = readableText(rgb)
  return {
    backgroundColor: `rgba(${r},${g},${b},0.2)`,
    color: `rgb(${tr},${tg},${tb})`,
  }
}
