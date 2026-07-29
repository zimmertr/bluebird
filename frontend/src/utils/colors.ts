import { SortBy } from '../types'

type MetricConfig = {
  // Band boundaries — always one fewer than colors. Values at or below
  // thresholds[0] take colors[0]; each band blends toward the next anchor;
  // values past the last threshold extrapolate into the final color over one
  // more last-band width, then clamp.
  thresholds: number[]
  colors: string[]
  // Captions for the bands above, not a name for the metric — that comes from
  // metrics.ts, which knows the analysis mode these thresholds do not.
  legendLabels: string[]
  group: string[]
}

// Scales are anchored to absolute conditions (green = dry/calm/cold/clean),
// not to the chosen ranking direction — ranking "highest" simply surfaces the
// red end of the same scale first.
export const METRIC_CONFIG: Record<SortBy, MetricConfig> = {
  precip_total_in: {
    thresholds: [0.01, 0.10, 0.25, 0.50],
    colors: ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'],
    legendLabels: ['≤ 0.01"', '0.01 – 0.10"', '0.10 – 0.25"', '0.25 – 0.50"', '> 0.50"'],
    group: ['precip_total_in', 'precip_avg_in_hr', 'precip_max_in_hr'],
  },
  wind_avg_mph: {
    thresholds: [5, 15, 25, 35],
    colors: ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'],
    legendLabels: ['≤ 5 mph', '5 – 15 mph', '15 – 25 mph', '25 – 35 mph', '> 35 mph'],
    group: ['wind_min_mph', 'wind_avg_mph', 'wind_max_mph'],
  },
  temp_avg_f: {
    thresholds: [30, 45, 55, 65],
    colors: ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'],
    legendLabels: ['≤ 30°F', '30 – 45°F', '45 – 55°F', '55 – 65°F', '> 65°F'],
    group: ['temp_min_f', 'temp_avg_f', 'temp_max_f'],
  },
  // All six US EPA AQI categories — Good / Moderate / Sensitive / Unhealthy /
  // Very Unhealthy / Hazardous — in the app's hues. The purple/maroon top
  // bands exist so an AQI of 250 and one of 350 never look the same.
  aqi_avg: {
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
    group: ['aqi_avg', 'aqi_max'],
  },
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

function interpolateRgb(value: number, sortBy: SortBy): [number, number, number] {
  const { thresholds, colors } = METRIC_CONFIG[sortBy]
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

export function markerColor(value: number, sortBy: SortBy): string {
  const [r, g, b] = interpolateRgb(value, sortBy)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

export function cellStyle(
  value: number,
  sortBy: SortBy,
): { backgroundColor: string; color: string } {
  const [r, g, b] = interpolateRgb(value, sortBy)
  return {
    backgroundColor: `rgba(${r},${g},${b},0.2)`,
    color: `rgb(${r},${g},${b})`,
  }
}
