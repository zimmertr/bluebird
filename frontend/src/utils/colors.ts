import { SortBy } from '../types'
import { FAMILY_KEYS, MetricFamily } from '../metrics'

/**
 * A set of band boundaries and the colors they anchor.
 *
 * A scale is not one-per-metric: the table colors each cell by its own number,
 * and two of precipitation's columns are a rate where the third is a total
 * (see PRECIP_RATE below). Which columns belong to a metric is a different
 * question and is answered by `FAMILY_KEYS` in metrics.ts, which every
 * consumer reads directly rather than through a second list here.
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

/**
 * The families whose numbers carry a color, which is every one of them.
 *
 * The freezing level was the one exception until #295 was reversed (TJ,
 * 2026-09-14). The objection was that a band scale has to call one height good
 * and another bad, and the reading is relative — 9,000 ft is a fine night under
 * a 9,500 ft summit and a ruined one under an 8,000 ft col. The scale below
 * answers that by encoding the air column's HEIGHT rather than a verdict: the
 * ramp runs cold to warm through one family of blues, so it says how high the
 * freezing line stands and never how good that is. So the alias is now the
 * whole union, and it is kept as a name rather than deleted because
 * `METRIC_SCALE` reads better keyed by what the key means.
 */
export type ColoredFamily = MetricFamily

// Scales are anchored to absolute conditions, not to the chosen ranking
// direction — ranking "highest" simply surfaces the far end of the same scale
// first. Four of the five run green (dry/calm/cold/clean) to red, because they
// measure something a hiker wants less of. The freezing level does not, and
// says why on its own entry.
//
// Keyed by family rather than by ranking key (#291): a family's aggregates
// share one scale (a windy hour is windy whether it was the average or the
// peak), so the rankable keys would be one copy of a scale each. The
// exception is precipitation's rate columns, which measure a different
// quantity and carry their own scale below (PRECIP_RATE); `rankedScale` is
// the per-key reading that knows this.
export const METRIC_SCALE: Record<ColoredFamily, LabelledScale> = {
  precip: {
    thresholds: [0.01, 0.10, 0.25, 0.50],
    colors: ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'],
    legendLabels: ['≤ 0.01"', '0.01 – 0.10"', '0.10 – 0.25"', '0.25 – 0.50"', '> 0.50"'],
  },
  wind: {
    thresholds: [5, 15, 25, 35],
    colors: ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'],
    legendLabels: ['≤ 5 mph', '5 – 15 mph', '15 – 25 mph', '25 – 35 mph', '> 35 mph'],
  },
  temp: {
    thresholds: [30, 45, 55, 65],
    colors: ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'],
    legendLabels: ['≤ 30°F', '30 – 45°F', '45 – 55°F', '55 – 65°F', '> 65°F'],
  },
  // The one scale that is not green-to-red, because it is not a verdict.
  //
  // The hue encodes the air column's HEIGHT, not whether the weather is good,
  // so it serves a winter reader and a summer one alike (TJ, 2026-09-14): a low
  // freezing line is what a skier wants and what a climber on wet rock fears,
  // and a scale with a red end would have picked one of them. One cold family
  // instead, running purple at the bottom through indigo and blue to cyan at
  // the top.
  //
  // 4,000 ft steps from 4,000 to 20,000: the band the contiguous US actually
  // sees across a year, wide enough that a single cold front does not push
  // every destination into one color.
  //
  // EVERY STEP IS A 300 OR A 400, and that is a contrast constraint rather than
  // a taste. `cellStyle` paints a table cell in the band's own colour at full
  // strength over that colour at 20%, so the band IS the text, and text owes
  // 4.5:1 (1.4.3). The first draft of this ramp used the deep 600/800 steps and
  // measured 1.58 to 2.34:1 in a cell (2026-09-14) — a ramp that dark needs
  // `cellStyle` to stop tinting the text first, which is a change to all five
  // metrics at once rather than to this one. So the shades come from the light
  // end, where they clear it: 4.79 to 6.02:1, pinned in `colors.test.ts`.
  //
  // WHICH COSTS THE LIGHTNESS ORDERING, and there is no way to keep both.
  // Relative luminance runs 0.544, 0.519, 0.477, 0.532, 0.440, 0.674, so the
  // ramp is read by hue rather than by dark-to-light. The floor is what forces
  // it: the darkest purple that clears 4.5:1 in a cell is purple-300 at 0.544,
  // and every later hue has a step below that (indigo-300 is 0.477) which also
  // clears it — so no assignment of these six hues is both conformant and
  // monotone. The ends still read: cyan-300 is the lightest thing on the ramp.
  freeze: {
    thresholds: [4000, 8000, 12000, 16000, 20000],
    colors: ['#d8b4fe', '#c4b5fd', '#a5b4fc', '#93c5fd', '#38bdf8', '#67e8f9'],
    legendLabels: [
      '≤ 4,000 ft',
      '4,000 – 8,000 ft',
      '8,000 – 12,000 ft',
      '12,000 – 16,000 ft',
      '16,000 – 20,000 ft',
      '> 20,000 ft',
    ],
  },
  // All six US EPA AQI categories — Good / Moderate / Sensitive / Unhealthy /
  // Very Unhealthy / Hazardous — in the app's hues. The purple/maroon top
  // bands exist so an AQI of 250 and one of 350 never look the same.
  aqi: {
    thresholds: [50, 100, 150, 200, 300],
    colors: ['#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7', '#991b1b'],
    legendLabels: [
      '≤ 50 AQI',
      '50 – 100 AQI',
      '100 – 150 AQI',
      '150 – 200 AQI',
      '200 – 300 AQI',
      '> 300 AQI',
    ],
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
  colors: ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'],
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
 * Which scale scores a given column, derived from the scales above crossed
 * with each family's own column list rather than restated: every colorable
 * column is already named in exactly one `FAMILY_KEYS` entry, and a second
 * list here would be a second answer. A family with no scale would contribute
 * no columns; every family carries one now, so every metric column is shaded.
 */
const COLUMN_SCALE: Record<string, LabelledScale> = {
  ...Object.fromEntries(
    (Object.keys(METRIC_SCALE) as ColoredFamily[]).flatMap((family) =>
      FAMILY_KEYS[family].map((column) => [column, METRIC_SCALE[family]]),
    ),
  ),
  precip_avg_in_hr: PRECIP_RATE,
  precip_min_in_hr: PRECIP_RATE,
  precip_max_in_hr: PRECIP_RATE,
}

/**
 * The scale the ranked value is measured on: what colors the markers and what
 * the map's metric legend prints.
 *
 * Every ranking key is a column, so this is `COLUMN_SCALE` read for the ranked
 * one — which is what puts a rate ranking on the rate scale: rank by the
 * precipitation peak and the markers, the legend, and the table cell all read
 * in/hr together.
 */
export function rankedScale(sortBy: SortBy): LabelledScale | null {
  return COLUMN_SCALE[sortBy] ?? null
}

/**
 * The scale one hour of a ranked metric is read on, for map playback (#121).
 *
 * Playback colors a marker by that hour's own number rather than by the
 * window's, so a total ranking has to leave the total scale: 0.30" spread
 * across three days is drizzle and 0.30 in/hr is a downpour, and coloring the
 * second like the first would say they were the same weather. Hence the one
 * remapping: the window-total key reads its hour on the average-rate column's
 * scale. Every other key already names an hourly quantity — one hour's
 * minimum, average and maximum are the same reading — so it is its own hourly
 * column. It reads the same `COLUMN_SCALE` the table does, so a marker under
 * the playhead and the cell beside it in the table cannot be scored
 * differently.
 *
 * The point-sample collapse `scaleFor` handles below cannot apply here:
 * playback exists only over a window of at least two stamps, so an hour is
 * never the whole window.
 */
export function hourlyScale(sortBy: SortBy): LabelledScale | null {
  return COLUMN_SCALE[sortBy === 'precip_total_in' ? 'precip_avg_in_hr' : sortBy] ?? null
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
  if (
    pointSample &&
    (key === 'precip_avg_in_hr' || key === 'precip_min_in_hr' || key === 'precip_max_in_hr')
  ) {
    return METRIC_SCALE.precip
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

/**
 * A marker is colored by the ranked value, which is what the legend explains —
 * or null where the ranked metric carries no color at all, which the caller
 * answers with its own no-value fill rather than inventing a band here.
 */
export function markerColor(value: number, sortBy: SortBy): string | null {
  const scale = rankedScale(sortBy)
  return scale === null ? null : colorOnScale(value, scale)
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
 */
export function cellStyle(
  value: number,
  scale: ColorScale,
): { backgroundColor: string; color: string } {
  const [r, g, b] = interpolateRgb(value, scale)
  return {
    backgroundColor: `rgba(${r},${g},${b},0.2)`,
    color: `rgb(${r},${g},${b})`,
  }
}
